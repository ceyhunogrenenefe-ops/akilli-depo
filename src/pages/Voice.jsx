import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mic, MicOff, Send, Undo2, Info, Plus, X, CheckCircle2, ListChecks, Sparkles, MessageSquareWarning } from 'lucide-react'
import { useStore } from '../store.jsx'
import { trLower, fmtQty, UNIT_LIST } from '../lib/parser.js'
import { analyze, parseCorrection, missingFields, startsWithPallet, FIELDS, FIELD_LABEL, normProduct } from '../lib/voice.js'
import { PalletSelect, CompanySelect, UnitSelect } from '../components/ui.jsx'

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const SAVE = /^(kaydet|onayla|onaylıyorum|bitti|tamam|tamamdır|evet|hepsini kaydet|listeyi kaydet)$/
const CLEAR = /^(listeyi temizle|listeyi sil|hepsini sil|hepsini iptal et)$/
const UNDO = /^(geri al|sonuncuyu sil|son satırı sil|sonuncuyu iptal et)$/
const CANCEL = /^(iptal|vazgeç|bunu sil|bu kaydı sil|baştan)$/
const DRAFT_KEY = 'akilli-depo-taslak-v2'
const PROMPT_MS = 4000

// Yankı önleme: sistemin kendi söylediği cümleye benzeyen tanıma sonuçları atılır.
// (Kullanıcının soruya hemen verdiği cevap ise kabul edilir.)
let spoken = { words: new Set(), until: 0 }
const wordsOf = s => trLower(s).replace(/[^a-zçğıöşü0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
export function isEcho(text) {
  if (Date.now() > spoken.until) return false
  const w = wordsOf(text)
  if (!w.length) return false
  const hit = w.filter(x => spoken.words.has(x)).length
  return hit / w.length >= 0.5
}
export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'tr-TR'; u.rate = 1.05
    spoken = { words: new Set(wordsOf(text)), until: Date.now() + 2500 + text.length * 80 }
    u.onend = () => { spoken.until = Date.now() + 1500 }
    const v = window.speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith('tr'))
    if (v) u.voice = v
    window.speechSynthesis.speak(u)
  } catch { /* ses yok */ }
}
const buzz = () => { try { navigator.vibrate?.(60) } catch { /* yok */ } }
const num = q => Number(String(q ?? '').replace(',', '.'))
const rowMissing = d => missingFields({ pallet_id: d.pallet_id, company_id: d.company_id, product: d.product, quantity: d.quantity, unit: d.unit }).filter(f => f !== 'pallet' || !d.pallet_id)

export default function Voice() {
  const store = useStore()
  const { data, db, toast, reload, activePalletId, setActivePalletId, settings, setSettings, can, companyById } = store
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [list, setListState] = useState(() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || [] } catch { return [] } })
  const [cur, setCur] = useState(null)
  const [typed, setTyped] = useState('')
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const [aliasRows, setAliasRows] = useState([])
  const [idleStopped, setIdleStopped] = useState(false)
  const recRef = useRef(null)
  const stopRef = useRef(false)
  const lastHeard = useRef({ text: '', at: 0 })
  const lastActivity = useRef(0)
  const promptTimer = useRef(null)
  const ctx = useRef()

  // Öğrenilmiş eşleştirmeler + kayıtlı ürün adları
  useEffect(() => { db.aliases().then(setAliasRows).catch(() => {}) }, [db])
  const companiesX = useMemo(() => data.companies.map(c => ({ ...c, aliases: aliasRows.filter(a => a.kind === 'firma' && a.value === c.id).map(a => a.heard) })), [data.companies, aliasRows])
  const productAliases = useMemo(() => Object.fromEntries(aliasRows.filter(a => a.kind === 'urun').map(a => [a.heard, a.value])), [aliasRows])
  const products = useMemo(() => [...new Set(data.items.map(i => i.product))], [data.items])
  ctx.current = { ...store, list, cur, recent, companiesX, productAliases, products }

  const setList = fn => setListState(prev => {
    const next = typeof fn === 'function' ? fn(prev) : fn
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch { /* yok */ }
    return next
  })
  useEffect(() => () => { stopRef.current = true; recRef.current?.abort?.(); clearTimeout(promptTimer.current) }, [])

  const palletLabel = id => !id ? '—' : String(id).startsWith('new:') ? `Palet ${id.slice(4)} (yeni)` : `Palet ${ctx.current.palletById[id]?.number ?? '?'}`

  // ------------------------------------------------ analiz sonucunu satıra çevir
  function toRow(r, text, prev) {
    const { palletByNumber, nextPalletNumber, data, list, activePalletId, settings } = ctx.current
    const lastPallet = [...data.pallets].sort((a, b) => b.number - a.number)[0]
    let pallet_id = ''
    if (r.pallet != null) pallet_id = palletByNumber[r.pallet]?.id || `new:${r.pallet}`
    else if (r.palletRef === 'last') pallet_id = lastPallet?.id || `new:${nextPalletNumber}`
    else if (r.palletRef === 'new') pallet_id = `new:${nextPalletNumber}`
    else if (r.palletRef === 'current') pallet_id = activePalletId || ''
    const tags = {}
    let company_id = r.company?.id || ''
    if (settings.inherit) {
      const last = list[list.length - 1]
      if (!pallet_id && (last?.pallet_id || activePalletId)) { pallet_id = last?.pallet_id || activePalletId; tags.pallet = 'önceki' }
      if (!company_id && !r.companyHeard && !r.companyAmbiguous && last?.company_id) { company_id = last.company_id; tags.company = 'önceki' }
    }
    if (r.productMatchedFrom) tags.product = r.productLearned ? 'öğrenildi' : 'eşleşti'
    const row = {
      key: prev?.key || Math.random().toString(36).slice(2),
      text, heard: text,
      pallet_id, company_id, product: r.product || '', quantity: r.quantity ?? '', unit: r.unit || '',
      companyHeard: r.companyHeard || null,
      companyAmbiguous: r.companyAmbiguous ? r.companyAmbiguous.map(c => c.id) : null,
      conflicts: (r.conflicts || []).map(c => c.field),
      productMatchedFrom: r.productMatchedFrom || null,
      tags, mode: r.mode,
      orig: { company_id, companyRaw: r.companyRaw || r.companyHeard || null, product: r.productSpoken || r.product || '' },
      locked: prev?.locked || {},
    }
    // Elle ya da sesle düzeltilmiş alanları koru
    if (prev) for (const f of Object.keys(row.locked)) { const k = fieldKey(f); row[k] = prev[k]; if (f === 'quantity') row.unit = prev.unit || row.unit }
    return row
  }
  const fieldKey = f => ({ pallet: 'pallet_id', company: 'company_id', product: 'product', quantity: 'quantity', unit: 'unit' }[f])

  // ------------------------------------------------ eksik alanları sor
  function schedulePrompt() {
    clearTimeout(promptTimer.current)
    promptTimer.current = setTimeout(async () => {
      const c = ctx.current.cur
      if (!c) return
      let miss = rowMissing(c)
      if (ctx.current.settings.ai && miss.length) {
        const filled = await aiFill(c)
        if (filled) { miss = rowMissing(filled); if (!miss.length) return }
      }
      setCur(x => x && x.key === c.key ? { ...x, asked: true } : x)
      if (ctx.current.settings.speak && miss.length) speak(`${miss.map(f => FIELD_LABEL[f]).join(', ')} eksik. Söyleyin.`)
    }, PROMPT_MS)
  }

  async function aiFill(c) {
    const { db, data, products } = ctx.current
    const res = await db.parseWithAI({ text: c.text, companies: data.companies.map(x => x.name), units: UNIT_LIST, products: products.slice(0, 300) })
    if (!res) return null
    const patch = { tags: { ...c.tags } }
    const miss = rowMissing(c)
    if (miss.includes('pallet') && Number.isInteger(res.pallet)) { patch.pallet_id = ctx.current.palletByNumber[res.pallet]?.id || `new:${res.pallet}`; patch.tags.pallet = 'yz' }
    if (miss.includes('company') && res.company) { const co = data.companies.find(x => x.name === res.company); if (co) { patch.company_id = co.id; patch.tags.company = 'yz' } }
    if (miss.includes('product') && res.product) { patch.product = res.product; patch.tags.product = 'yz' }
    if (miss.includes('quantity') && res.quantity > 0) { patch.quantity = res.quantity; patch.tags.quantity = 'yz' }
    if (miss.includes('unit') && res.unit) { patch.unit = res.unit; patch.tags.unit = 'yz' }
    const next = { ...c, ...patch }
    setCur(x => x && x.key === c.key ? next : x)
    return next
  }

  function commit(row) {
    clearTimeout(promptTimer.current)
    setList(l => [...l, { ...row, asked: false }])
    setCur(null)
    buzz()
  }
  function flushCur() { const c = ctx.current.cur; if (c) { clearTimeout(promptTimer.current); setList(l => [...l, c]); setCur(null) } }

  // ------------------------------------------------ düzeltme uygula + öğren
  function applyCorrection(corr) {
    const { cur, list } = ctx.current
    const target = cur || list[list.length - 1]
    if (!target) return false
    const k = fieldKey(corr.field)
    let value = corr.value
    if (corr.field === 'pallet') value = ctx.current.palletByNumber[value]?.id || `new:${value}`
    if (corr.field === 'company') value = value.id
    const patch = { [k]: value, locked: { ...target.locked, [corr.field]: true }, tags: { ...target.tags, [corr.field]: 'düzeltildi' } }
    if (corr.field === 'company') { patch.companyHeard = null; patch.companyAmbiguous = null }
    if (corr.unit) patch.unit = corr.unit
    patch.conflicts = (target.conflicts || []).filter(f => f !== corr.field)
    if (cur && target.key === cur.key) {
      const next = { ...cur, ...patch }
      if (!rowMissing(next).length && !next.conflicts.length) commit(next); else setCur(next)
    } else setList(l => l.map(d => d.key === target.key ? { ...d, ...patch } : d))
    buzz()
    return true
  }
  function learnFrom(row, patch) {
    const { db } = ctx.current
    const o = row.orig || {}
    const learned = []
    if (patch.company_id && o.companyRaw && patch.company_id !== o.company_id) learned.push(['firma', trLower(o.companyRaw), patch.company_id])
    if (patch.product && o.product && normProduct(patch.product) !== normProduct(o.product)) learned.push(['urun', normProduct(o.product), patch.product])
    for (const [kind, heard, value] of learned) {
      db.learnAlias(kind, heard, value).then(() => db.aliases().then(setAliasRows)).catch(() => {})
    }
  }

  // ------------------------------------------------ kaydet (onaydan sonra)
  async function saveAll(override) {
    const { db, settings, cur } = ctx.current
    const list = Array.isArray(override) ? override : cur ? [...ctx.current.list, cur] : ctx.current.list
    if (cur) { clearTimeout(promptTimer.current); setList(list); setCur(null) }
    if (!list.length) { if (settings.speak) speak('Liste boş'); return }
    const bad = list.filter(d => rowMissing(d).length || (d.conflicts || []).length)
    if (bad.length) {
      setShowMissing(true)
      if (settings.speak) speak(`${bad.length} satırda eksik bilgi var. Sarı alanları tamamlayın.`)
      return
    }
    setBusy(true)
    try {
      const created = {}
      const rows = []
      for (const d of list) {
        let pid = d.pallet_id
        if (String(pid).startsWith('new:')) {
          const n = Number(pid.slice(4))
          if (!created[n]) created[n] = ctx.current.palletByNumber[n]?.id || (await db.createPallet(n)).id
          pid = created[n]
        }
        rows.push({ pallet_id: pid, company_id: d.company_id, product: d.product.trim(), quantity: num(d.quantity), unit: d.unit, source: 'ses' })
        learnFrom(d, { company_id: d.company_id, product: d.product })
      }
      const saved = await db.createItems(rows)
      await reload()
      setActivePalletId(rows[rows.length - 1].pallet_id)
      const ids = saved.map(s => s.id)
      const coName = id => ctx.current.companyById[id]?.name || ''
      const label = list.map(d => `${palletLabel(d.pallet_id).replace(' (yeni)', '')} · ${coName(d.company_id)} · ${d.product} ${fmtQty(d.quantity)} ${d.unit}`).join('\n')
      setRecent(r => [{ ids, label, at: Date.now() }, ...r].slice(0, 15))
      setList([])
      setShowMissing(false)
      toast(`${rows.length} ürün kaydedildi`, { action: { label: 'Geri Al', fn: () => undo(ids) } })
      if (settings.speak) speak(`${rows.length} ürün kaydedildi`)
    } catch (e) {
      toast(e.message, { type: 'error' })
    } finally { setBusy(false) }
  }
  async function undo(ids) {
    try { await ctx.current.db.deleteItems(ids); await ctx.current.reload(); setRecent(r => r.filter(x => x.ids !== ids)); toast('Geri alındı') }
    catch (e) { toast(e.message, { type: 'error' }) }
  }

  // ------------------------------------------------ konuşma parçasını işle
  function handleText(alternatives, typedInput = false) {
    const alts = (Array.isArray(alternatives) ? alternatives : [alternatives]).map(s => s.trim()).filter(Boolean)
    if (!alts.length) return
    const text = alts[0]
    const norm = trLower(text).replace(/[^a-zçğıöşü0-9]/g, '')
    const now = Date.now()
    if (!typedInput && lastHeard.current.text === norm && now - lastHeard.current.at < 6000) return
    lastHeard.current = { text: norm, at: now }
    lastActivity.current = now
    setInterim('')
    const t = trLower(text).replace(/[.!?,]/g, '').trim()
    const { settings, list, cur, companiesX, products, productAliases } = ctx.current

    if (SAVE.test(t)) return saveAll()
    if (CLEAR.test(t)) { setList([]); setCur(null); setShowMissing(false); if (settings.speak) speak('Liste temizlendi'); return }
    if (CANCEL.test(t)) { if (cur) { setCur(null); clearTimeout(promptTimer.current); if (settings.speak) speak('İptal edildi') } return }
    if (UNDO.test(t)) {
      if (cur) setCur(null)
      else if (list.length) setList(l => l.slice(0, -1))
      else if (ctx.current.recent[0]) undo(ctx.current.recent[0].ids)
      if (settings.speak) speak('Silindi')
      return
    }
    const corr = parseCorrection(text, companiesX)
    if (corr && applyCorrection(corr)) return

    // Sıralı düzende palet ilk söylenir: palet zaten doluyken yeni "palet ..." = yeni kayıt
    let base = cur
    if (cur) {
      const alone = analyze(text, { companies: companiesX, products, productAliases })
      const a = alone.length === 1 ? alone[0] : null
      const aloneComplete = alone.length > 1 || (a && !missingFields(a).length && !a.conflicts.length)
      const newPallet = startsWithPallet(text) && cur.pallet_id && !cur.tags?.pallet
      const otherCompany = a?.company && cur.company_id && a.company.id !== cur.company_id && !cur.tags?.company
      if (aloneComplete || newPallet || otherCompany) { flushCur(); base = null }
    }
    const combined = base ? `${base.text} ${text}` : text

    // Birden fazla tanıma alternatifi varsa en eksiksizini seç
    let best = null, bestMiss = 99
    for (const a of (base ? [text] : alts)) {
      const full = base ? combined : a
      const res = analyze(full, { companies: companiesX, products, productAliases })
      const rows = res.map(r => toRow(r, full, base))
      const miss = rows.reduce((s, r) => s + rowMissing(r).length + r.conflicts.length, 0)
      if (miss < bestMiss) { best = rows; bestMiss = miss }
      if (!miss) break
    }
    if (!best?.length) return
    if (best.length > 1) { flushCur(); best.forEach(commit); return }
    const row = best[0]
    const empty = !row.pallet_id && !row.company_id && !row.product && row.quantity === '' && !row.unit && !row.companyHeard
    if (empty) return
    if (!rowMissing(row).length && !row.conflicts.length) {
      if (settings.autoSave) { setCur(null); saveAll([...ctx.current.list, row]) } else commit(row)
    } else { setCur(row); schedulePrompt() }
  }

  // ------------------------------------------------ mikrofon
  function start() {
    if (!SR) return
    stopRef.current = false
    setIdleStopped(false)
    const rec = new SR()
    rec.lang = 'tr-TR'
    rec.interimResults = true
    rec.maxAlternatives = 3
    rec.continuous = true
    const done = new Set()
    rec.onresult = e => {
      let inter = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) {
          if (done.has(i)) continue
          done.add(i)
          if (isEcho(r[0].transcript)) continue
          handleText(Array.from(r).map(a => a.transcript))
        } else if (!isEcho(r[0].transcript)) inter += r[0].transcript
      }
      setInterim(inter)
      if (inter) { lastActivity.current = Date.now(); clearTimeout(promptTimer.current) }
    }
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stopRef.current = true; toast('Mikrofon izni verilmedi. Tarayıcı ayarlarından mikrofona izin verin.', { type: 'error' }) }
      else if (e.error === 'network') { stopRef.current = true; toast('Ses tanıma için internet bağlantısı gerekli', { type: 'error' }) }
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
      if (!ctx.current.settings.continuous || stopRef.current) return
      if (Date.now() - lastActivity.current > 45000) { stopRef.current = true; setIdleStopped(true); return }
      setTimeout(() => { if (!stopRef.current) start() }, 400)
    }
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { /* zaten çalışıyor */ }
  }
  function stop() { stopRef.current = true; recRef.current?.stop?.(); setListening(false); setInterim('') }

  // ------------------------------------------------ elle düzenleme
  const updRow = (key, f, value) => {
    const k = fieldKey(f)
    if (cur && cur.key === key) {
      const next = { ...cur, [k]: value, locked: { ...cur.locked, [f]: true }, conflicts: cur.conflicts.filter(x => x !== f), ...(f === 'company' ? { companyHeard: null, companyAmbiguous: null } : {}) }
      setCur(next)
    } else setList(l => l.map(d => d.key === key ? { ...d, [k]: value, conflicts: (d.conflicts || []).filter(x => x !== f), ...(f === 'company' ? { companyHeard: null, companyAmbiguous: null } : {}) } : d))
  }

  async function addHeardCompany(d) {
    try {
      const c = await db.createCompany({ name: d.companyHeard, code: null })
      await reload()
      if (cur && cur.key === d.key) setCur({ ...cur, company_id: c.id, companyHeard: null, locked: { ...cur.locked, company: true } })
      setList(l => l.map(x => x.companyHeard === d.companyHeard && !x.company_id ? { ...x, company_id: c.id, companyHeard: null } : x))
      toast(`${c.name} firmalara eklendi`)
    } catch (e) { toast(e.message, { type: 'error' }) }
  }

  if (!can.edit) return <div className="card p-6 text-slate-600">Bu bölüm için yetkiniz yok.</div>
  const incomplete = list.filter(d => rowMissing(d).length || (d.conflicts || []).length).length

  return (
    <div className="space-y-4">
      {/* Mikrofon */}
      <div className="card flex flex-col items-center gap-3 p-5">
        {SR ? (
          <>
            <button
              onClick={listening ? stop : () => { lastActivity.current = Date.now(); start() }}
              className={`relative flex h-28 w-28 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 ${listening ? 'bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              aria-label={listening ? 'Dinlemeyi durdur' : 'Konuşmaya başla'}
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-30" />}
              {listening ? <MicOff size={48} /> : <Mic size={48} />}
            </button>
            <div className="text-center">
              <div className="font-semibold text-slate-800">{listening ? 'Dinliyorum…' : idleStopped ? 'Sessizlik nedeniyle durdu — devam için dokunun' : 'Konuşmak için dokunun'}</div>
              <div className="text-sm text-slate-500">Sıra: <b>Palet</b> → <b>Firma</b> → <b>Ürün</b> → <b>Miktar</b> → <b>Birim</b></div>
              {interim && <div className="mt-1 text-slate-600">“{interim}”</div>}
            </div>
          </>
        ) : (
          <div className="flex gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <Info size={20} className="shrink-0" />
            <div>Bu tarayıcı doğrudan sesli girişi desteklemiyor. Telefonda <b>Chrome (Android)</b> veya <b>Safari (iPhone)</b> kullanın ya da aşağıdaki kutuya dokunup <b>klavyedeki mikrofon tuşuyla</b> konuşun.</div>
          </div>
        )}
        <form className="flex w-full gap-2" onSubmit={e => { e.preventDefault(); if (typed.trim()) { handleText(typed, true); setTyped('') } }}>
          <input className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Palet 1, A firması, domates salçası, 40, adet" enterKeyHint="send" />
          <button className="btn-primary px-3" aria-label="Gönder"><Send size={20} /></button>
        </form>
      </div>

      {/* Şu an söylenen kayıt */}
      {cur && <CurrentCard cur={cur} onEdit={updRow} onCancel={() => { setCur(null); clearTimeout(promptTimer.current) }} onAdd={() => commit(cur)} onAddCompany={addHeardCompany} palletLabel={palletLabel} />}

      {/* Onay listesi */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="text-brand-700" size={22} />
          <div className="font-semibold text-slate-800">Onay bekleyen ürünler ({list.length})</div>
          {list.length > 0 && <button className="btn-light btn-sm ml-auto" onClick={() => { if (window.confirm('Liste temizlensin mi?')) { setList([]); setShowMissing(false) } }}>Temizle</button>}
        </div>

        {list.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Her ürünü şu sırayla söyleyin: <b>“Palet 1, A firması, domates salçası, 40, adet”</b>. Eksiksiz anlaşılan ürün buraya düşer.
            Bitince <b>“kaydet”</b> deyin.
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((d, idx) => {
              const miss = rowMissing(d)
              const warn = miss.length > 0 || (d.conflicts || []).length > 0
              return (
                <li key={d.key} className={`rounded-xl border p-3 ${warn ? (showMissing ? 'border-amber-400 bg-amber-50' : 'border-amber-200 bg-amber-50/50') : 'border-slate-200'}`}>
                  <div className="mb-2 flex items-start gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{idx + 1}.</span>
                    <span className="flex-1">“{d.heard}”</span>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => setList(l => l.filter(x => x.key !== d.key))} aria-label="Satırı sil"><X size={18} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PalletSelect value={d.pallet_id} onChange={v => updRow(d.key, 'pallet', v)} className={`py-2 ${!d.pallet_id ? 'border-amber-400' : ''}`} />
                    <CompanySelect value={d.company_id} onChange={v => updRow(d.key, 'company', v)} className={`py-2 ${!d.company_id ? 'border-amber-400' : ''}`} />
                    <input className={`input col-span-2 py-2 ${!d.product?.trim() ? 'border-amber-400' : ''}`} value={d.product} placeholder="Ürün adı" onChange={e => updRow(d.key, 'product', e.target.value)} />
                    <input className={`input py-2 ${!(num(d.quantity) > 0) ? 'border-amber-400' : ''}`} inputMode="decimal" value={d.quantity} placeholder="Miktar" onChange={e => updRow(d.key, 'quantity', e.target.value)} />
                    <UnitSelectReq value={d.unit} onChange={v => updRow(d.key, 'unit', v)} />
                  </div>
                  {warn && <div className="mt-2 text-xs text-amber-800">Tamamlanması gereken: {[...miss, ...(d.conflicts || [])].map(f => FIELD_LABEL[f]).join(', ')}</div>}
                  {d.companyHeard && !d.company_id && can.admin && <button className="btn-outline btn-sm mt-2" onClick={() => addHeardCompany(d)}><Plus size={16} /> “{d.companyHeard}” firmasını ekle</button>}
                </li>
              )
            })}
          </ul>
        )}

        {list.length > 0 && (
          <>
            <button className="btn-green mt-4 w-full py-3 text-base" disabled={busy} onClick={() => saveAll()}>
              <CheckCircle2 size={20} /> {busy ? 'Kaydediliyor…' : `Onayla ve ${list.length} ürünü kaydet`}
            </button>
            {incomplete > 0 && <div className="mt-2 text-center text-xs text-amber-800">{incomplete} satırda tamamlanması gereken alan var</div>}
            <div className="mt-1 text-center text-xs text-slate-500">Sesle: “kaydet” · “son satırı sil” · “miktar 50 olsun”</div>
          </>
        )}
      </div>

      {recent.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 font-semibold text-slate-800">Bu oturumda kaydedilenler</div>
          <ul className="divide-y">
            {recent.map(r => {
              const alive = r.ids.some(id => data.items.some(i => i.id === id))
              return (
                <li key={r.at} className={`flex items-center gap-2 py-2 text-sm ${alive ? '' : 'text-slate-400 line-through'}`}>
                  <div className="flex-1 whitespace-pre-line">{r.label}</div>
                  {alive && <button className="btn-light btn-sm" onClick={() => undo(r.ids)} aria-label="Geri al"><Undo2 size={16} /></button>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="card space-y-2 p-4 text-sm text-slate-600">
        <div className="font-semibold text-slate-800">Ayarlar</div>
        {SR && <label className="flex items-center gap-2"><input type="checkbox" checked={settings.continuous} onChange={e => setSettings({ continuous: e.target.checked })} /> Sürekli dinle</label>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.speak} onChange={e => setSettings({ speak: e.target.checked })} /> Eksik alanları sesli sor, kaydı sesli onayla</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.inherit} onChange={e => setSettings({ inherit: e.target.checked })} /> Palet/firma söylenmezse önceki satırdan devam et</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.ai} onChange={e => setSettings({ ai: e.target.checked })} /> <Sparkles size={14} /> Anlaşılamayan alanlarda yapay zekâ yardımı</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.autoSave} onChange={e => setSettings({ autoSave: e.target.checked })} /> Eksiksiz anlaşılanı onay beklemeden kaydet</label>
        <div className="flex items-center gap-2 pt-1">
          <span className="shrink-0">Aktif palet:</span>
          <PalletSelect value={activePalletId || ''} onChange={async v => {
            if (String(v).startsWith('new:')) { const p = await db.createPallet(Number(v.slice(4))); await reload(); setActivePalletId(p.id) } else setActivePalletId(v)
          }} className="py-1.5 text-sm" />
        </div>
      </div>

      <details className="card p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">Nasıl konuşmalıyım?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><b>Sıra:</b> “Palet 1, A firması, domates salçası, 40, adet”. Aralarda duraksayabilirsiniz; parçalar birleştirilir.</li>
          <li>Karışık sıra da anlaşılır: “A firmasına ait 40 adet domates salçasını birinci palete ekle”.</li>
          <li>Eksik kalan alan sarı yanar ve sorulur; sadece eksik olanı söyleyin (ör. “40 adet”).</li>
          <li><b>Düzeltme:</b> “miktar 50 olsun”, “firma B olsun”, “birim koli olsun”, “ürün makarna olsun”, “palet 3 olsun”.</li>
          <li>“iptal” → şu anki kaydı bırak · “son satırı sil” · “listeyi temizle” · <b>“kaydet”</b> → hepsini kaydet.</li>
          <li>Düzelttiğiniz firma ve ürün adlarını sistem öğrenir; bir dahaki sefere doğru tanır.</li>
        </ul>
        <div className="mt-2">Firma kodlarını <Link className="text-brand-600 underline" to="/firmalar">Firmalar</Link> sayfasından düzenleyin.</div>
      </details>
    </div>
  )
}

function UnitSelectReq({ value, onChange }) {
  return (
    <select className={`input py-2 ${!value ? 'border-amber-400' : ''}`} value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="" disabled>Birim</option>
      {UNIT_LIST.map(u => <option key={u} value={u}>{u}</option>)}
    </select>
  )
}

const TAG_STYLE = { önceki: 'bg-sky-100 text-sky-800', eşleşti: 'bg-violet-100 text-violet-800', öğrenildi: 'bg-violet-100 text-violet-800', düzeltildi: 'bg-emerald-100 text-emerald-800', yz: 'bg-fuchsia-100 text-fuchsia-800' }

function CurrentCard({ cur, onEdit, onCancel, onAdd, onAddCompany, palletLabel }) {
  const { companyById, can } = useStore()
  const miss = rowMissing(cur)
  const conflicts = cur.conflicts || []
  const val = f => f === 'pallet' ? (cur.pallet_id ? palletLabel(cur.pallet_id) : '') : f === 'company' ? (companyById[cur.company_id]?.name || '') : f === 'quantity' ? (cur.quantity !== '' ? fmtQty(cur.quantity) : '') : cur[f] || ''
  return (
    <div className={`card p-4 ring-2 ${miss.length || conflicts.length ? (cur.asked ? 'ring-amber-300' : 'ring-sky-200') : 'ring-emerald-300'}`}>
      <div className="mb-2 flex items-center gap-2">
        <MessageSquareWarning size={18} className="text-brand-700" />
        <div className="text-sm font-semibold text-slate-800">Anlaşılan</div>
        <div className="flex-1 truncate text-xs text-slate-500">“{cur.text}”</div>
        <button className="text-slate-400 hover:text-red-600" onClick={onCancel} aria-label="İptal"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {FIELDS.map((f, i) => {
          const v = val(f)
          const bad = miss.includes(f) || conflicts.includes(f)
          return (
            <div key={f} className={`rounded-lg border px-1.5 py-2 text-center ${bad ? (cur.asked ? 'border-amber-400 bg-amber-50' : 'border-dashed border-slate-300 bg-slate-50') : 'border-emerald-200 bg-emerald-50'}`}>
              <div className="text-[9px] font-medium uppercase text-slate-500">{i + 1}. {FIELD_LABEL[f]}</div>
              <div className={`mt-0.5 text-[13px] font-semibold leading-tight [overflow-wrap:normal] [word-break:keep-all] ${bad ? 'text-amber-700' : 'text-slate-800'}`}>{v || (conflicts.includes(f) ? 'belirsiz' : '?')}</div>
              {cur.tags?.[f] && <div className={`mt-1 inline-block rounded px-1 text-[10px] ${TAG_STYLE[cur.tags[f]] || 'bg-slate-100'}`}>{cur.tags[f] === 'yz' ? 'YZ' : cur.tags[f]}</div>}
            </div>
          )
        })}
      </div>
      {(miss.length > 0 || conflicts.length > 0) && (
        <div className="mt-3 space-y-2">
          <div className="text-sm text-amber-800">{cur.asked ? 'Lütfen söyleyin veya seçin: ' : 'Bekleniyor: '}<b>{[...miss, ...conflicts].map(f => FIELD_LABEL[f]).join(', ')}</b></div>
          <div className="grid grid-cols-2 gap-2">
            {(miss.includes('pallet') || conflicts.includes('pallet')) && <PalletSelect value={cur.pallet_id} onChange={v => onEdit(cur.key, 'pallet', v)} className="py-2" />}
            {(miss.includes('company') || conflicts.includes('company')) && <CompanySelect value={cur.company_id} onChange={v => onEdit(cur.key, 'company', v)} className="py-2" />}
            {(miss.includes('product') || conflicts.includes('product')) && <input className="input col-span-2 py-2" placeholder="Ürün adı" value={cur.product} onChange={e => onEdit(cur.key, 'product', e.target.value)} />}
            {(miss.includes('quantity') || conflicts.includes('quantity')) && <input className="input py-2" inputMode="decimal" placeholder="Miktar" value={cur.quantity} onChange={e => onEdit(cur.key, 'quantity', e.target.value)} />}
            {(miss.includes('unit') || conflicts.includes('unit')) && <UnitSelectReq value={cur.unit} onChange={v => onEdit(cur.key, 'unit', v)} />}
          </div>
          {cur.companyAmbiguous && <div className="text-xs text-amber-800">Firma şunlara benziyor: {cur.companyAmbiguous.map(id => companyById[id]?.name).join(' / ')} — hangisi?</div>}
          {cur.companyHeard && !cur.company_id && <div className="text-xs text-amber-800">“{cur.companyHeard}” kayıtlı bir firma değil. {can.admin && <button className="ml-1 underline" onClick={() => onAddCompany(cur)}>Firma olarak ekle</button>}</div>}
        </div>
      )}
      {cur.productMatchedFrom && <div className="mt-2 text-xs text-violet-700">Duyulan “{cur.productMatchedFrom}” → kayıtlı ürün “{cur.product}” ile eşleştirildi.</div>}
      <button className="btn-green mt-3 w-full" disabled={miss.length > 0 || conflicts.length > 0} onClick={onAdd}><Plus size={18} /> Listeye ekle</button>
    </div>
  )
}
