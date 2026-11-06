import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Send, MessageCircle, Mail, Share2, CheckCircle2, XCircle, Users, Info } from 'lucide-react'
import { useStore, STATUS } from '../store.jsx'
import { Empty } from '../components/ui.jsx'
import { textSummary, fileName } from '../lib/summary.js'
import { normalizePhone, KIND, scopeFor } from '../lib/phone.js'
import { makeExcelBlob } from './ExcelPage.jsx'

export default function Notify() {
  const { data, db, DEMO, toast, run, can, companyById, itemsByPallet } = useStore()
  const [params] = useSearchParams()
  const [recipients, setRecipients] = useState(null)
  const [palletIds, setPalletIds] = useState(() => {
    const p = params.get('p')
    if (p) return p.split(',')
    const done = data.pallets.filter(x => x.status === 'tamamlandi').map(x => x.id)
    return done
  })
  const [chosen, setChosen] = useState({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState(null)

  useEffect(() => { db.recipients().then(setRecipients).catch(e => { toast(e.message, { type: 'error' }); setRecipients([]) }) }, [db, toast])

  const pallets = [...data.pallets].sort((a, b) => a.number - b.number)
  const selItems = useMemo(() => palletIds.flatMap(id => itemsByPallet[id] || []), [palletIds, itemsByPallet])
  const companiesInSel = useMemo(() => new Set(selItems.map(i => i.company_id)), [selItems])
  const relevant = r => r.active && (r.kind !== 'firma' || companiesInSel.has(r.company_id))

  // varsayılan: ilgili tüm alıcılar seçili
  useEffect(() => {
    if (!recipients) return
    setChosen(Object.fromEntries(recipients.map(r => [r.id, relevant(r)])))
  }, [recipients, palletIds.join(',')]) // eslint-disable-line

  if (!can.notify) return <div className="card p-6 text-slate-600">Bu bölüm için yetkiniz yok.</div>

  const toggleP = id => setPalletIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const palletNos = palletIds.map(id => data.pallets.find(p => p.id === id)?.number).filter(Boolean).sort((a, b) => a - b)
  const dateStr = new Date().toLocaleDateString('tr-TR', { dateStyle: 'long' })

  const messageFor = r => {
    const cid = scopeFor(r)
    const header = `Merhaba ${r.name},\n${dateStr} — Palet ${palletNos.join(', ')} listesi${cid ? ` (${companyById[cid]?.name} ürünleri)` : ''}:`
    return textSummary({ ...data, companyId: cid, palletIds, header }) + (note.trim() ? `\n\nNot: ${note.trim()}` : '')
  }

  const shareExcel = async r => {
    try {
      const cid = scopeFor(r)
      const { blob } = await makeExcelBlob({ data, companyId: cid, palletIds })
      const name = fileName(cid ? `${companyById[cid]?.name} Palet Listesi` : 'Palet Listesi Genel')
      const file = new File([blob], name, { type: blob.type })
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: name, text: messageFor(r) })
      else toast('Bu cihaz dosya paylaşımını desteklemiyor. Excel İndir bölümünü kullanın.', { type: 'warn' })
    } catch (e) { if (e.name !== 'AbortError') toast(e.message, { type: 'error' }) }
  }

  const sendAuto = async () => {
    const ids = Object.entries(chosen).filter(([, v]) => v).map(([k]) => k)
    if (!ids.length || !palletIds.length) return
    if (!window.confirm(`${ids.length} alıcıya Palet ${palletNos.join(', ')} listesi gönderilsin mi?`)) return
    setBusy(true); setResults(null)
    try {
      const r = await db.sendNotifications({ palletIds, recipientIds: ids, note })
      setResults(r.results)
      const ok = r.results.filter(x => x.status === 'gonderildi').length
      toast(`${ok} mesaj gönderildi${r.results.length - ok ? `, ${r.results.length - ok} hata/atlandı` : ''}`, { type: ok ? 'ok' : 'warn' })
    } catch (e) { toast(e.message, { type: 'error' }) } finally { setBusy(false) }
  }

  const markSent = () => run(async () => { for (const id of palletIds) await db.updatePallet(id, { status: 'gonderildi' }) }, 'Paletler “Gönderildi” olarak işaretlendi')

  return (
    <div className="space-y-4">
      <div className="card space-y-2 p-4">
        <div className="font-semibold text-slate-800">1. Gönderilecek paletler</div>
        {pallets.length === 0 ? <div className="text-sm text-slate-500">Palet yok.</div> : (
          <div className="flex flex-wrap gap-1.5">
            {pallets.map(p => (
              <button key={p.id} onClick={() => toggleP(p.id)} className={`btn btn-sm ${palletIds.includes(p.id) ? 'bg-brand-700 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>
                Palet {p.number} <span className="opacity-70">· {STATUS[p.status].label}</span>
              </button>
            ))}
          </div>
        )}
        <div className="text-sm text-slate-500">{selItems.length} kalem · {companiesInSel.size} firma</div>
      </div>

      <div className="card p-4">
        <div className="mb-2 flex items-center gap-2 font-semibold text-slate-800">2. Alıcılar</div>
        {recipients == null ? <div className="text-slate-500">Yükleniyor…</div> : recipients.length === 0 ? (
          <Empty icon={Users} title="Kayıtlı alıcı yok">
            <Link to="/yonetim" className="text-brand-600 underline">Yönetim → Alıcılar</Link> bölümünden firma yetkilisi, depo sorumlusu, kendinizi ve personeli ekleyin.
          </Empty>
        ) : (
          <ul className="divide-y">
            {recipients.map(r => {
              const rel = relevant(r)
              const phone = normalizePhone(r.phone)
              const msg = messageFor(r)
              return (
                <li key={r.id} className={`py-3 ${rel ? '' : 'opacity-50'}`}>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" className="mt-1 h-5 w-5" disabled={!rel} checked={!!chosen[r.id]} onChange={e => setChosen(c => ({ ...c, [r.id]: e.target.checked }))} />
                    <div className="flex-1">
                      <div className="font-medium text-slate-800">{r.name}</div>
                      <div className="text-xs text-slate-500">
                        {KIND[r.kind]}{r.kind === 'firma' && ` · ${companyById[r.company_id]?.name}`} · {r.kind === 'firma' ? 'yalnızca kendi ürünleri' : 'tüm liste'}
                        {!r.active && ' · pasif'}{r.active && !rel && ' · seçili paletlerde ürünü yok'}
                      </div>
                    </div>
                  </label>
                  {rel && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-8">
                      {phone && <a className="btn-sm btn bg-[#25D366] text-white" target="_blank" rel="noreferrer" href={`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`}><MessageCircle size={16} /> WhatsApp</a>}
                      {r.email && <a className="btn-sm btn-outline" href={`mailto:${r.email}?subject=${encodeURIComponent(`Palet listesi — Palet ${palletNos.join(', ')}`)}&body=${encodeURIComponent(msg)}`}><Mail size={16} /> E-posta</a>}
                      {'share' in navigator && <button className="btn-sm btn-outline" onClick={() => shareExcel(r)}><Share2 size={16} /> Excel paylaş</button>}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="card space-y-3 p-4">
        <div className="font-semibold text-slate-800">3. Gönder</div>
        <textarea className="input min-h-20" placeholder="Mesaja eklenecek not (isteğe bağlı) — ör. Kamyon plakası, yükleme saati" value={note} onChange={e => setNote(e.target.value)} />
        {DEMO
          ? <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"><Info size={18} className="shrink-0" /> Demo modunda otomatik gönderim kapalı. Yukarıdaki WhatsApp / E-posta / Excel paylaş butonlarıyla elle gönderebilirsiniz.</div>
          : <button className="btn-primary w-full py-3 text-base" disabled={busy || !palletIds.length || !Object.values(chosen).some(Boolean)} onClick={sendAuto}><Send size={20} /> {busy ? 'Gönderiliyor…' : 'Otomatik gönder (e-posta + WhatsApp, Excel ekli)'}</button>}
        {results && (
          <ul className="space-y-1 text-sm">
            {results.map((x, i) => (
              <li key={i} className="flex items-center gap-2">
                {x.status === 'gonderildi' ? <CheckCircle2 size={16} className="text-emerald-600" /> : <XCircle size={16} className="text-red-600" />}
                <span className="font-medium">{x.recipient}</span> · {x.channel === 'email' ? 'E-posta' : 'WhatsApp'} · {x.status}{x.error ? ` — ${x.error}` : ''}
              </li>
            ))}
          </ul>
        )}
        {palletIds.length > 0 && <button className="btn-light w-full" onClick={markSent}>Seçili paletleri “Gönderildi” olarak işaretle</button>}
      </div>

      {palletIds.length > 0 && (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-800">Mesaj önizlemesi (depo sorumlusu)</summary>
          <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">{messageFor({ name: 'Depo Sorumlusu', kind: 'depo' })}</pre>
        </details>
      )}
    </div>
  )
}
