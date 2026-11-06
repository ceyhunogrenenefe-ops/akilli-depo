import { useEffect, useState } from 'react'
import { History as HistoryIcon, Plus, Pencil, Trash2, ArrowRightLeft } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Empty } from '../components/ui.jsx'
import { fmtQty } from '../lib/parser.js'

const ICON = { ekle: Plus, guncelle: Pencil, sil: Trash2, tasi: ArrowRightLeft }
const COLOR = { ekle: 'bg-emerald-100 text-emerald-700', guncelle: 'bg-sky-100 text-sky-700', sil: 'bg-red-100 text-red-700', tasi: 'bg-violet-100 text-violet-700' }
const VERB = { ekle: 'eklendi', guncelle: 'güncellendi', sil: 'silindi', tasi: 'taşındı' }
const FIELD = { product: 'ürün', quantity: 'miktar', unit: 'birim', company_id: 'firma', note: 'not', status: 'durum', name: 'ad', code: 'kod', phone: 'telefon', email: 'e-posta', contact_name: 'yetkili' }
const STATUS_TR = { acik: 'Açık', tamamlandi: 'Tamamlandı', gonderildi: 'Gönderildi' }

export default function History() {
  const { db, data, palletById, companyById, can } = useStore()
  const [log, setLog] = useState(null)
  const [tab, setTab] = useState('islem')
  const [notes, setNotes] = useState([])

  useEffect(() => { db.audit(400).then(setLog).catch(() => setLog([])) }, [db, data])
  useEffect(() => { if (tab === 'bildirim') db.notifications().then(setNotes).catch(() => setNotes([])) }, [db, tab])

  if (!can.history) return <div className="card p-6 text-slate-600">Bu bölüm için yetkiniz yok.</div>

  const pal = pid => palletById[pid] ? `Palet ${palletById[pid].number}` : 'silinmiş palet'
  const co = cid => companyById[cid]?.name || 'silinmiş firma'
  const val = (k, v) => k === 'company_id' ? co(v) : k === 'status' ? STATUS_TR[v] || v : k === 'quantity' ? fmtQty(v) : v || '—'

  function describe(e) {
    const r = e.after || e.before || {}
    if (e.entity === 'item') {
      const base = `${r.product} ${fmtQty(r.quantity)} ${r.unit} · ${co(r.company_id)}`
      if (e.action === 'tasi') return `${base}: ${pal(e.before?.pallet_id)} → ${pal(e.after?.pallet_id)}`
      if (e.action === 'guncelle') return `${pal(r.pallet_id)} · ${r.product}: ${diff(e.before, e.after)}`
      return `${pal(r.pallet_id)} · ${base}${e.after?.source === 'ses' ? ' (sesle)' : ''}`
    }
    if (e.entity === 'pallet') {
      if (e.action === 'guncelle') return `Palet ${r.number}: ${diff(e.before, e.after)}`
      return `Palet ${r.number}`
    }
    if (e.entity === 'company') return e.action === 'guncelle' && e.before ? `${e.before.name}: ${diff(e.before, e.after)}` : `Firma: ${r.name || ''}`
    if (e.entity === 'recipient') return `Alıcı: ${r.name || ''}`
    return e.entity
  }
  function diff(a, b) {
    if (!a || !b) return ''
    const ch = Object.keys(FIELD).filter(k => k in b && String(a[k] ?? '') !== String(b[k] ?? ''))
    return ch.map(k => `${FIELD[k]} ${val(k, a[k])} → ${val(k, b[k])}`).join(', ') || 'değişiklik'
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        <button onClick={() => setTab('islem')} className={`btn btn-sm ${tab === 'islem' ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200'}`}>İşlemler</button>
        <button onClick={() => setTab('bildirim')} className={`btn btn-sm ${tab === 'bildirim' ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200'}`}>Gönderilen bildirimler</button>
      </div>
      {tab === 'islem' && (log == null ? <div className="text-slate-500">Yükleniyor…</div> : log.length === 0 ? <Empty icon={HistoryIcon} title="Henüz işlem yok" /> : (
        <ul className="card divide-y">
          {log.map(e => {
            const I = ICON[e.action] || Pencil
            return (
              <li key={e.id} className="flex items-start gap-3 px-4 py-3">
                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${COLOR[e.action] || 'bg-slate-100'}`}><I size={16} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800">{describe(e)} <span className="text-slate-500">{VERB[e.action]}</span></div>
                  <div className="text-xs text-slate-500">{new Date(e.at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}{e.user_email ? ` · ${e.user_email}` : ''}</div>
                </div>
              </li>
            )
          })}
        </ul>
      ))}
      {tab === 'bildirim' && (notes.length === 0 ? <Empty icon={HistoryIcon} title="Gönderilmiş bildirim yok" /> : (
        <ul className="card divide-y">
          {notes.map(n => (
            <li key={n.id} className="px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-slate-800">{n.recipient_name}</span>
                <span className="chip bg-slate-100 text-slate-700">{n.channel === 'email' ? 'E-posta' : 'WhatsApp'}</span>
                <span className={`chip ${n.status === 'gonderildi' ? 'bg-emerald-100 text-emerald-800' : n.status === 'hata' ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-600'}`}>{n.status}</span>
              </div>
              <div className="text-xs text-slate-500">{new Date(n.created_at).toLocaleString('tr-TR')} · Palet {(n.pallet_numbers || []).join(', ')}{n.error ? ` · ${n.error}` : ''}</div>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}
