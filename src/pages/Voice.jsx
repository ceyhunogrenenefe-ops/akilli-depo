import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mic, MicOff, Send, AlertTriangle, Undo2, Info, Plus, X } from 'lucide-react'
import { useStore } from '../store.jsx'
import { parseCommand, ISSUE_TEXT, trLower, fmtQty } from '../lib/parser.js'
import { PalletSelect, CompanySelect, UnitSelect } from '../components/ui.jsx'

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null
const YES = /^(evet|onayla|onaylıyorum|kaydet|tamam|doğru|olur)\b/
const NO = /^(hayır|iptal|vazgeç|sil|yanlış)\b/
const UNDO = /^(geri al|son kaydı sil|sonuncuyu sil)/

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

export default function Voice() {
  const store = useStore()
  const { data, db, toast, reload, activePalletId, setActivePalletId, palletById, companyById, settings, setSettings, can } = store
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [lastText, setLastText] = useState('')
  const [pending, setPending] = useState(null) // { text, drafts: [...] }
  const [typed, setTyped] = useState('')
  const [recent, setRecent] = useState([]) // [{ids, label}]
  const [busy, setBusy] = useState(false)
  const recRef = useRef(null)
  const stopRef = useRef(false)
  const ctx = useRef()
  ctx.current = { ...store, pending, recent }

  useEffect(() => () => { stopRef.current = true; recRef.current?.abort?.() }, [])

  // --------------------------------------------- komutu palet/firma kayıtlarına bağla
  function resolve(parsed) {
    const { data, palletByNumber, nextPalletNumber, activePalletId } = ctx.current
    const lastPallet = [...data.pallets].sort((a, b) => b.number - a.number)[0]
    const drafts = parsed.items.map(it => {
      const issues = it.issues.filter(i => i !== 'palet' && i !== 'birim')
      const warnings = it.issues.includes('birim') ? ['birim'] : []
      let pallet_id = null, palletNote = null
      if (it.pallet != null) {
        const p = palletByNumber[it.pallet]
        if (p) pallet_id = p.id
        else {
          pallet_id = `new:${it.pallet}`
          if (it.pallet !== nextPalletNumber) issues.push('palet_yeni')
          palletNote = `Palet ${it.pallet} yok, oluşturulacak`
        }
      } else if (it.palletRef === 'last') { if (lastPallet) pallet_id = lastPallet.id; else pallet_id = `new:${nextPalletNumber}` }
      else if (it.palletRef === 'new') { pallet_id = `new:${nextPalletNumber}`; palletNote = `Yeni palet: Palet ${nextPalletNumber}` }
      else if (activePalletId) { pallet_id = activePalletId; palletNote = 'Aktif palet kullanıldı' }
      else issues.push('palet')
      return {
        key: Math.random().toString(36).slice(2),
        pallet_id: pallet_id || '', company_id: it.companyId || '', companyHeard: it.companyHeard,
        product: it.product, quantity: it.quantity ?? '', unit: it.unit, issues, warnings, palletNote,
      }
    })
    return { drafts, confident: drafts.length > 0 && drafts.every(d => d.issues.length === 0) }
  }

  function palletLabel(id) {
    if (!id) return '?'
    if (String(id).startsWith('new:')) return `Palet ${id.slice(4)}`
    return `Palet ${ctx.current.palletById[id]?.number ?? '?'}`
  }

  // --------------------------------------------- kaydet
  async function save(drafts) {
    const { db } = ctx.current
    setBusy(true)
    try {
      const created = {}
      const rows = []
      for (const d of drafts) {
        let pid = d.pallet_id
        if (String(pid).startsWith('new:')) {
          const n = Number(pid.slice(4))
          if (!created[n]) created[n] = (await db.createPallet(n)).id
          pid = created[n]
        }
        rows.push({ pallet_id: pid, company_id: d.company_id, product: d.product.trim(), quantity: Number(String(d.quantity).replace(',', '.')), unit: d.unit, source: 'ses' })
      }
      const saved = await db.createItems(rows)
      await reload()
      setActivePalletId(rows[rows.length - 1].pallet_id)
      const coName = id => ctx.current.companyById[id]?.name || ''
      const label = drafts.map(d => `${palletLabel(d.pallet_id)} · ${coName(d.company_id)} · ${d.product} ${fmtQty(d.quantity)} ${d.unit}`).join('\n')
      const ids = saved.map(s => s.id)
      setRecent(r => [{ ids, label, at: Date.now() }, ...r].slice(0, 15))
      toast(`Kaydedildi: ${label.replace(/\n/g, '  +  ')}`, { action: { label: 'Geri Al', fn: () => undo(ids) } })
      if (ctx.current.settings.speak) {
        speak(drafts.map(d => `${palletLabel(d.pallet_id)}, ${coName(d.company_id)}, ${fmtQty(d.quantity)} ${d.unit} ${d.product}`).join('. ') + ' kaydedildi')
      }
      setPending(null)
      return true
    } catch (e) {
      toast(e.message, { type: 'error' })
      if (ctx.current.settings.speak) speak('Kayıt başarısız')
      return false
    } finally { setBusy(false) }
  }

  async function undo(ids) {
    try {
      await ctx.current.db.deleteItems(ids)
      await ctx.current.reload()
      setRecent(r => r.filter(x => x.ids !== ids))
      toast('Geri alındı')
      if (ctx.current.settings.speak) speak('Geri alındı')
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
    const { pending, recent, settings } = ctx.current

    if (UNDO.test(t)) { if (recent[0]) undo(recent[0].ids); else toast('Geri alınacak kayıt yok', { type: 'warn' }); return }
    if (pending) {
      if (YES.test(t)) { if (pending.drafts.every(valid)) await save(pending.drafts); else { toast('Eksik alanları doldurun', { type: 'warn' }); if (settings.speak) speak('Eksik bilgi var') } return }
      if (NO.test(t)) { setPending(null); toast('İptal edildi'); if (settings.speak) speak('İptal edildi'); return }
    }

    // birden fazla tanıma alternatifi varsa net olanı seç
    let best = null
    for (const a of alts) {
      const r = resolve(parseCommand(a, ctx.current.data.companies))
      if (!best) best = { ...r, text: a }
      if (r.confident) { best = { ...r, text: a }; break }
    }
    if (!best.drafts.length) {
      toast(`Anlaşılamadı: “${text}”`, { type: 'warn' })
      if (settings.speak) speak('Anlaşılamadı, tekrar söyleyin')
      return
    }
    if (best.confident && settings.autoSave) {
      await save(best.drafts)
    } else {
      ctx.current.clearToasts()
      setPending({ text: best.text, drafts: best.drafts })
      if (settings.speak) {
        const iss = [...new Set(best.drafts.flatMap(d => d.issues))]
        speak(iss.length ? `Onay gerekiyor. ${iss.map(i => ISSUE_TEXT[i] || (i === 'palet_yeni' ? 'Yeni palet oluşturulacak' : '')).join('. ')}` : 'Onaylıyor musunuz?')
      }
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
      const { settings, pending } = ctx.current
      if (settings.continuous && !stopRef.current) setTimeout(() => { if (!stopRef.current) start() }, 250)
      else if (pending && !stopRef.current) { /* onay bekleniyor */ }
    }
    recRef.current = rec
    try { rec.start(); setListening(true) } catch { /* zaten çalışıyor */ }
  }
  function stop() { stopRef.current = true; recRef.current?.stop?.(); setListening(false) }

  // onay beklerken kısa dinleme: "evet / iptal"
  useEffect(() => {
    if (pending && settings.continuous && !listening && !stopRef.current) { const t = setTimeout(start, 1600); return () => clearTimeout(t) }
  }, [pending]) // eslint-disable-line

  const valid = d => d.pallet_id && d.company_id && d.product?.trim() && Number(String(d.quantity).replace(',', '.')) > 0
  const updDraft = (key, patch) => setPending(p => ({ ...p, drafts: p.drafts.map(d => d.key === key ? { ...d, ...patch, issues: d.issues.filter(i => !issueFixedBy(i, patch)) } : d) }))
  const issueFixedBy = (i, patch) => (i === 'palet' || i === 'palet_yeni') ? 'pallet_id' in patch : i.startsWith('firma') ? 'company_id' in patch : i === 'urun' ? 'product' in patch : i === 'miktar' ? 'quantity' in patch : false

  async function addHeardCompany(d) {
    try {
      const c = await db.createCompany({ name: d.companyHeard, code: null })
      await reload()
      updDraft(d.key, { company_id: c.id })
      toast(`${c.name} firmalara eklendi`)
    } catch (e) { toast(e.message, { type: 'error' }) }
  }

  if (!can.edit) return <div className="card p-6 text-slate-600">Bu bölüm için yetkiniz yok.</div>

  return (
    <div className="space-y-4">
      {/* Aktif palet */}
      <div className="card flex items-center gap-3 p-3">
        <div className="text-sm text-slate-500 shrink-0">Aktif palet</div>
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
              className={`relative flex h-36 w-36 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95 ${listening ? 'bg-red-600' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              aria-label={listening ? 'Dinlemeyi durdur' : 'Konuşmaya başla'}
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-30" />}
              {listening ? <MicOff size={56} /> : <Mic size={56} />}
            </button>
            <div className="text-center">
              <div className="font-semibold text-slate-800">{listening ? 'Dinliyorum…' : 'Konuşmak için dokunun'}</div>
              <div className="min-h-6 text-slate-500">{interim || (lastText && <>Son komut: “{lastText}”</>)}</div>
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
          <button className="btn-primary px-3" aria-label="Gönder"><Send size={20} /></button>
        </form>

        <div className="flex w-full flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-slate-600">
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.autoSave} onChange={e => setSettings({ autoSave: e.target.checked })} /> Net komutları direkt kaydet</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.speak} onChange={e => setSettings({ speak: e.target.checked })} /> Sesli geri bildirim</label>
          {SR && <label className="flex items-center gap-2"><input type="checkbox" checked={settings.continuous} onChange={e => setSettings({ continuous: e.target.checked })} /> Sürekli dinle</label>}
        </div>
      </div>

      {/* Onay kartı */}
      {pending && (
        <div className="card border-amber-300 p-4 ring-2 ring-amber-200">
          <div className="mb-3 flex items-start gap-2">
            <AlertTriangle className="mt-0.5 shrink-0 text-amber-600" size={20} />
            <div>
              <div className="font-semibold text-slate-800">Onay gerekiyor</div>
              <div className="text-sm text-slate-500">Duyulan: “{pending.text}”</div>
            </div>
          </div>
          <div className="space-y-3">
            {pending.drafts.map(d => (
              <div key={d.key} className="rounded-xl border border-slate-200 p-3">
                {(d.issues.length > 0 || d.warnings.length > 0 || d.palletNote) && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {d.issues.map(i => <span key={i} className="chip bg-amber-100 text-amber-900">{i === 'palet_yeni' ? d.palletNote : ISSUE_TEXT[i]}</span>)}
                    {d.warnings.map(i => <span key={i} className="chip bg-slate-100 text-slate-700">{ISSUE_TEXT[i]}</span>)}
                    {d.palletNote && !d.issues.includes('palet_yeni') && <span className="chip bg-sky-100 text-sky-800">{d.palletNote}</span>}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <PalletSelect value={d.pallet_id} onChange={v => updDraft(d.key, { pallet_id: v })} className={d.issues.some(i => i.startsWith('palet')) ? 'border-amber-400' : ''} />
                  <CompanySelect value={d.company_id} onChange={v => updDraft(d.key, { company_id: v })} className={d.issues.some(i => i.startsWith('firma')) ? 'border-amber-400' : ''} />
                  <input className={`input col-span-2 ${d.issues.includes('urun') ? 'border-amber-400' : ''}`} value={d.product} placeholder="Ürün adı" onChange={e => updDraft(d.key, { product: e.target.value })} />
                  <input className={`input ${d.issues.includes('miktar') ? 'border-amber-400' : ''}`} inputMode="decimal" value={d.quantity} placeholder="Miktar" onChange={e => updDraft(d.key, { quantity: e.target.value })} />
                  <UnitSelect value={d.unit} onChange={v => updDraft(d.key, { unit: v })} />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {d.companyHeard && !d.company_id && can.admin && (
                    <button className="btn-outline btn-sm" onClick={() => addHeardCompany(d)}><Plus size={16} /> “{d.companyHeard}” firmasını ekle</button>
                  )}
                  {pending.drafts.length > 1 && <button className="btn-light btn-sm ml-auto" onClick={() => setPending(p => ({ ...p, drafts: p.drafts.filter(x => x.key !== d.key) }))}><X size={16} /> Bu satırı çıkar</button>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-light flex-1" onClick={() => setPending(null)}>İptal</button>
            <button className="btn-green flex-1" disabled={busy || !pending.drafts.every(valid)} onClick={() => save(pending.drafts)}>Onayla ve Kaydet</button>
          </div>
          <div className="mt-2 text-center text-xs text-slate-500">Sesle de cevap verebilirsiniz: “evet” veya “iptal”</div>
        </div>
      )}

      {/* Son kayıtlar */}
      {recent.length > 0 && (
        <div className="card p-4">
          <div className="mb-2 font-semibold text-slate-800">Bu oturumda eklenenler</div>
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

      {/* Örnekler */}
      <details className="card p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">Örnek komutlar</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>“Birinci palete A firması için domates salçası 40 adet ekle.”</li>
          <li>“İkinci palete B firmasından 25 koli makarna ekle.”</li>
          <li>“3. palete C firması için 10 kasa ayran ve 5 çuval un.”</li>
          <li>“A firması 12 koli zeytin” — palet söylenmezse <b>aktif palet</b> kullanılır.</li>
          <li>“Son palete …”, “Yeni palete …”</li>
          <li>“Geri al” — son kaydı siler. Onay kartında “evet” / “iptal”.</li>
        </ul>
        <div className="mt-2">Firmalar kod harfiyle (“A firması”, “be firması”) veya tam adıyla (“Yılmaz Gıda için”) söylenebilir. Kodları <Link className="text-brand-600 underline" to="/firmalar">Firmalar</Link> sayfasından düzenleyin.</div>
      </details>
    </div>
  )
}
