import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mic, MicOff, Send, Undo2, Info, Plus, X, CheckCircle2, ListChecks } from 'lucide-react'
import { useStore } from '../store.jsx'
import { parseCommand, trLower, fmtQty } from '../lib/parser.js'
import { PalletSelect, CompanySelect, UnitSelect } from '../components/ui.jsx'

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const SAVE = /^(kaydet|onayla|onaylıyorum|bitti|tamam|tamamdır|evet|hepsini kaydet|listeyi kaydet)$/
const CLEAR = /^(listeyi temizle|listeyi sil|hepsini sil|hepsini iptal et)$/
const UNDO = /^(geri al|sonuncuyu sil|son satırı sil|sonuncuyu iptal et)$/
const DRAFT_KEY = 'akilli-depo-taslak'

export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'tr-TR'; u.rate = 1.05
    const v = window.speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith('tr'))
    if (v) u.voice = v
    window.speechSynthesis.speak(u)
  } catch { /* ses yok */ }
}

const num = q => Number(String(q).replace(',', '.'))
const missing = d => [
  !d.pallet_id && 'palet',
  !d.company_id && 'firma',
  !d.product?.trim() && 'ürün',
  !(num(d.quantity) > 0) && 'miktar',
].filter(Boolean)

export default function Voice() {
  const store = useStore()
  const { data, db, toast, reload, activePalletId, setActivePalletId, settings, setSettings, can } = store
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [lastText, setLastText] = useState('')
  const [list, setListState] = useState(() => { try { return JSON.parse(localStorage.getItem(DRAFT_KEY)) || [] } catch { return [] } })
  const [typed, setTyped] = useState('')
  const [recent, setRecent] = useState([])
  const [busy, setBusy] = useState(false)
  const [showMissing, setShowMissing] = useState(false)
  const recRef = useRef(null)
  const stopRef = useRef(false)
  const ctx = useRef()
  ctx.current = { ...store, list, recent }

  const setList = fn => setListState(prev => {
    const next = typeof fn === 'function' ? fn(prev) : fn
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(next)) } catch { /* yok */ }
    return next
  })

  useEffect(() => () => { stopRef.current = true; recRef.current?.abort?.() }, [])

  function palletLabel(id) {
    if (!id) return 'Palet ?'
    if (String(id).startsWith('new:')) return `Palet ${id.slice(4)} (yeni)`
    return `Palet ${ctx.current.palletById[id]?.number ?? '?'}`
  }

  // --------------------------------------------- konuşmayı satırlara çevir (hata göstermeden)
  function toDrafts(parsed) {
    const { data, palletByNumber, nextPalletNumber, activePalletId, list } = ctx.current
    const prev = list[list.length - 1]
    const lastPallet = [...data.pallets].sort((a, b) => b.number - a.number)[0]
    let carryPallet = prev?.pallet_id || activePalletId || ''
    let carryCompany = prev?.company_id || ''
    return parsed.items.map(it => {
      let pallet_id = ''
      if (it.pallet != null) pallet_id = palletByNumber[it.pallet]?.id || `new:${it.pallet}`
      else if (it.palletRef === 'last') pallet_id = lastPallet?.id || `new:${nextPalletNumber}`
      else if (it.palletRef === 'new') pallet_id = `new:${nextPalletNumber}`
      else if (it.palletRef === 'current') pallet_id = activePalletId || ''
      else pallet_id = carryPallet
      const company_id = it.companyId || (it.companyHeard ? '' : carryCompany)
      carryPallet = pallet_id; carryCompany = company_id || carryCompany
      return {
        key: Math.random().toString(36).slice(2),
        heard: parsed.text,
        pallet_id, company_id, companyHeard: company_id ? null : it.companyHeard,
        product: it.product || '', quantity: it.quantity ?? '', unit: it.unit || 'adet',
      }
    })
  }

  // --------------------------------------------- kaydet (onaydan sonra)
  async function saveAll(override) {
    const { db, settings } = ctx.current
    const list = Array.isArray(override) ? override : ctx.current.list
    if (!list.length) { if (settings.speak) speak('Liste boş'); return }
    const bad = list.filter(d => missing(d).length)
    if (bad.length) {
      setShowMissing(true)
      if (settings.speak) speak(`${bad.length} satırda eksik bilgi var. Sarı satırları tamamlayıp tekrar onaylayın.`)
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
          if (!created[n]) created[n] = (await db.createPallet(n)).id
          pid = created[n]
        }
        rows.push({ pallet_id: pid, company_id: d.company_id, product: d.product.trim(), quantity: num(d.quantity), unit: d.unit, source: 'ses' })
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
    try {
      await ctx.current.db.deleteItems(ids)
      await ctx.current.reload()
      setRecent(r => r.filter(x => x.ids !== ids))
      toast('Geri alındı')
    } catch (e) { toast(e.message, { type: 'error' }) }
  }

  // --------------------------------------------- metni işle
  async function handleText(alternatives) {
    const alts = (Array.isArray(alternatives) ? alternatives : [alternatives]).map(s => s.trim()).filter(Boolean)
    if (!alts.length) return
    const text = alts[0]
    setLastText(text)
    setInterim('')
    const t = trLower(text).replace(/[.!?,]/g, '').trim()
    const { settings, list } = ctx.current

    if (SAVE.test(t)) return saveAll()
    if (CLEAR.test(t)) { setList([]); setShowMissing(false); if (settings.speak) speak('Liste temizlendi'); return }
    if (UNDO.test(t)) {
      if (list.length) { setList(l => l.slice(0, -1)); if (settings.speak) speak('Son satır silindi') }
      else if (ctx.current.recent[0]) undo(ctx.current.recent[0].ids)
      return
    }

    // birden fazla tanıma alternatifi varsa en eksiksiz olanı seç
    let best = null, bestScore = -1
    for (const a of alts) {
      const drafts = toDrafts({ ...parseCommand(a, ctx.current.data.companies), text: a })
      const score = drafts.length ? drafts.reduce((s, d) => s + 4 - missing(d).length, 0) / drafts.length : -1
      if (score > bestScore) { best = drafts; bestScore = score }
    }
    if (!best?.length) return // anlaşılmayan cümle: sessizce yok say

    if (settings.autoSave && best.every(d => !missing(d).length)) {
      return saveAll([...ctx.current.list, ...best])
    }
    setList(l => [...l, ...best])
    if (settings.speak) {
      speak(best.map(d => [d.quantity !== '' ? `${fmtQty(d.quantity)} ${d.unit}` : '', d.product].filter(Boolean).join(' ')).join(', '))
    }
  }

  // --------------------------------------------- mikrofon
  function start() {
    if (!SR) return
    stopRef.current = false
    const rec = new SR()
    rec.lang = 'tr-TR'
    rec.interimResults = true
    rec.maxAlternatives = 3
    rec.continuous = false
    rec.onresult = e => {
      let inter = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) handleText(Array.from(r).map(a => a.transcript))
        else inter += r[0].transcript
      }
      setInterim(inter)
    }
    rec.onerror = e => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { stopRef.current = true; toast('Mikrofon izni verilmedi. Tarayıcı ayarlarından mikrofona izin verin.', { type: 'error' }) }
      else if (e.error === 'network') { stopRef.current = true; toast('Ses tanıma için internet bağlantısı gerekli', { type: 'error' }) }
    }
    rec.onend = () => {
      setListening(false)
      if (ctx.current.settings.continuous && !stopRef.current) setTimeout(() => { if (!stopRef.current) start() }, 250)
    }
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { /* zaten çalışıyor */ }
  }
  function stop() { stopRef.current = true; recRef.current?.stop?.(); setListening(false) }

  const upd = (key, patch) => setList(l => l.map(d => d.key === key ? { ...d, ...patch, ...(patch.company_id ? { companyHeard: null } : {}) } : d))
  const remove = key => setList(l => l.filter(d => d.key !== key))

  async function addHeardCompany(d) {
    try {
      const c = await db.createCompany({ name: d.companyHeard, code: null })
      await reload()
      setList(l => l.map(x => x.companyHeard === d.companyHeard && !x.company_id ? { ...x, company_id: c.id, companyHeard: null } : x))
      toast(`${c.name} firmalara eklendi`)
    } catch (e) { toast(e.message, { type: 'error' }) }
  }

  if (!can.edit) return <div className="card p-6 text-slate-600">Bu bölüm için yetkiniz yok.</div>

  const incomplete = list.filter(d => missing(d).length).length

  return (
    <div className="space-y-4">
      {/* Aktif palet */}
      <div className="card flex items-center gap-3 p-3">
        <div className="shrink-0 text-sm text-slate-500">Aktif palet</div>
        <PalletSelect value={activePalletId || ''} onChange={async v => {
          if (String(v).startsWith('new:')) { const p = await db.createPallet(Number(v.slice(4))); await reload(); setActivePalletId(p.id); toast(`Palet ${p.number} oluşturuldu`) }
          else setActivePalletId(v)
        }} className="py-2" />
      </div>

      {/* Mikrofon */}
      <div className="card flex flex-col items-center gap-4 p-6">
        {SR ? (
          <>
            <button
              onClick={listening ? stop : start}
              className={`relative flex h-32 w-32 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 ${listening ? 'bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              aria-label={listening ? 'Dinlemeyi durdur' : 'Konuşmaya başla'}
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-30" />}
              {listening ? <MicOff size={52} /> : <Mic size={52} />}
            </button>
            <div className="text-center">
              <div className="font-semibold text-slate-800">{listening ? 'Dinliyorum… ürünleri sırayla söyleyin' : 'Konuşmak için dokunun'}</div>
              <div className="min-h-6 text-slate-500">{interim || (lastText && <>Son duyulan: “{lastText}”</>)}</div>
            </div>
          </>
        ) : (
          <div className="flex gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <Info size={20} className="shrink-0" />
            <div>Bu tarayıcı doğrudan sesli girişi desteklemiyor. Telefonda <b>Chrome (Android)</b> veya <b>Safari (iPhone)</b> kullanın ya da aşağıdaki kutuya dokunup <b>klavyedeki mikrofon tuşuyla</b> konuşun.</div>
          </div>
        )}

        <form className="flex w-full gap-2" onSubmit={e => { e.preventDefault(); if (typed.trim()) { handleText(typed); setTyped('') } }}>
          <input className="input" value={typed} onChange={e => setTyped(e.target.value)} placeholder="Komutu yazın veya klavyeden dikte edin…" enterKeyHint="send" />
          <button className="btn-primary px-3" aria-label="Listeye ekle"><Send size={20} /></button>
        </form>

        <div className="flex w-full flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-slate-600">
          {SR && <label className="flex items-center gap-2"><input type="checkbox" checked={settings.continuous} onChange={e => setSettings({ continuous: e.target.checked })} /> Sürekli dinle</label>}
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.speak} onChange={e => setSettings({ speak: e.target.checked })} /> Sesli tekrar</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.autoSave} onChange={e => setSettings({ autoSave: e.target.checked })} /> Onay beklemeden kaydet</label>
        </div>
      </div>

      {/* Onay listesi */}
      <div className="card p-4">
        <div className="mb-3 flex items-center gap-2">
          <ListChecks className="text-brand-700" size={22} />
          <div className="font-semibold text-slate-800">Onay bekleyen ürünler ({list.length})</div>
          {list.length > 0 && <button className="btn-light btn-sm ml-auto" onClick={() => { if (window.confirm('Liste temizlensin mi?')) { setList([]); setShowMissing(false) } }}>Temizle</button>}
        </div>

        {list.length === 0 ? (
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            Mikrofona basıp ürünleri arka arkaya söyleyin. Her cümle buraya eklenir. Bitince <b>“kaydet”</b> deyin veya aşağıdaki butona basın.
            <div className="mt-2 text-slate-500">Örnek: “Birinci palete A firması için domates salçası 40 adet” … “25 koli makarna” … “kaydet”</div>
          </div>
        ) : (
          <ul className="space-y-2">
            {list.map((d, idx) => {
              const miss = missing(d)
              const warn = miss.length > 0
              return (
                <li key={d.key} className={`rounded-xl border p-3 ${warn ? (showMissing ? 'border-amber-400 bg-amber-50' : 'border-amber-200 bg-amber-50/50') : 'border-slate-200'}`}>
                  <div className="mb-2 flex items-start gap-2 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{idx + 1}.</span>
                    <span className="flex-1">“{d.heard}”</span>
                    <button className="text-slate-400 hover:text-red-600" onClick={() => remove(d.key)} aria-label="Satırı sil"><X size={18} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <PalletSelect value={d.pallet_id} onChange={v => upd(d.key, { pallet_id: v })} className={`py-2 ${!d.pallet_id ? 'border-amber-400' : ''}`} />
                    <CompanySelect value={d.company_id} onChange={v => upd(d.key, { company_id: v })} className={`py-2 ${!d.company_id ? 'border-amber-400' : ''}`} />
                    <input className={`input col-span-2 py-2 ${!d.product.trim() ? 'border-amber-400' : ''}`} value={d.product} placeholder="Ürün adı" onChange={e => upd(d.key, { product: e.target.value })} />
                    <input className={`input py-2 ${!(num(d.quantity) > 0) ? 'border-amber-400' : ''}`} inputMode="decimal" value={d.quantity} placeholder="Miktar" onChange={e => upd(d.key, { quantity: e.target.value })} />
                    <UnitSelect value={d.unit} onChange={v => upd(d.key, { unit: v })} className="py-2" />
                  </div>
                  {warn && <div className="mt-2 text-xs text-amber-800">Seçilmesi gereken: {miss.join(', ')}</div>}
                  {d.companyHeard && !d.company_id && can.admin && (
                    <button className="btn-outline btn-sm mt-2" onClick={() => addHeardCompany(d)}><Plus size={16} /> “{d.companyHeard}” firmasını ekle</button>
                  )}
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
            {incomplete > 0 && <div className="mt-2 text-center text-xs text-amber-800">{incomplete} satırda seçim gerekiyor (sarı alanlar)</div>}
            <div className="mt-1 text-center text-xs text-slate-500">Sesle: “kaydet” · “son satırı sil” · “listeyi temizle”</div>
          </>
        )}
      </div>

      {/* Kaydedilenler */}
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

      <details className="card p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">Nasıl konuşmalıyım?</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>“Birinci palete A firması için domates salçası 40 adet”</li>
          <li>Aynı palet ve firma için devam ederken yalnızca ürünü söyleyin: “25 koli makarna”, “10 kasa ayran”. Palet ve firma bir önceki satırdan alınır.</li>
          <li>Firma: “A firması”, “firma A”, “be firmasından”, “A için” ya da tam adı (“Yılmaz Gıda”).</li>
          <li>Bitince: <b>“kaydet”</b> (veya “onayla”, “bitti”). Son satırı silmek: “son satırı sil”.</li>
        </ul>
        <div className="mt-2">Firma kodlarını <Link className="text-brand-600 underline" to="/firmalar">Firmalar</Link> sayfasından düzenleyebilirsiniz.</div>
      </details>
    </div>
  )
}
