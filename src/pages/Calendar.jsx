import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Search, FileSpreadsheet, CalendarDays, X } from 'lucide-react'
import { useStore } from '../store.jsx'
import { StatusChip, unitTotals, Empty } from '../components/ui.jsx'
import { fmtQty } from '../lib/parser.js'
import { downloadExcel } from './ExcelPage.jsx'

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
const DAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const pad = n => String(n).padStart(2, '0')
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const localDay = iso => ymd(new Date(iso)) // created_at (ISO) → yerel gün
const trDate = s => new Date(s + 'T00:00').toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })
const norm = s => (s || '').toLocaleLowerCase('tr')

export default function Calendar() {
  const { data, companyById, itemsByPallet, toast, user } = useStore()
  const [params, setParams] = useSearchParams()
  const initial = params.get('d')
  const [month, setMonth] = useState(() => { const d = initial ? new Date(initial + 'T00:00') : new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [selected, setSelected] = useState(initial || null)
  const [mode, setMode] = useState('gonderim') // gonderim | hazirlama
  const [companyId, setCompanyId] = useState(user.role === 'firma' ? user.company_id || '' : '')
  const [q, setQ] = useState('')

  // Her palete takvimdeki günü
  const dayOf = p => mode === 'gonderim' ? p.shipped_at : (p.created_at ? localDay(p.created_at) : null)
  const qn = norm(q.trim())
  const itemMatch = i => (!companyId || i.company_id === companyId) && (!qn || norm(i.product).includes(qn))

  // gün → [{pallet, items}]
  const byDay = useMemo(() => {
    const m = {}
    for (const p of data.pallets) {
      const d = dayOf(p)
      if (!d) continue
      const items = (itemsByPallet[p.id] || []).filter(itemMatch)
      if ((companyId || qn) && !items.length) continue
      ;(m[d] ||= []).push({ pallet: p, items })
    }
    for (const d in m) m[d].sort((a, b) => a.pallet.number - b.pallet.number)
    return m
  }, [data.pallets, itemsByPallet, mode, companyId, qn]) // eslint-disable-line

  // ay ızgarası (Pazartesi başlangıçlı)
  const cells = useMemo(() => {
    const first = new Date(month)
    const offset = (first.getDay() + 6) % 7
    const start = new Date(first); start.setDate(1 - offset)
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [month])
  const monthKey = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`
  const monthDays = Object.keys(byDay).filter(d => d.startsWith(monthKey)).sort()
  const monthEntries = monthDays.flatMap(d => byDay[d])
  const monthItems = monthEntries.flatMap(e => e.items)
  const today = ymd(new Date())

  const go = delta => { const m = new Date(month); m.setMonth(m.getMonth() + delta); setMonth(m); setSelected(null) }
  const pick = d => { setSelected(d === selected ? null : d); setParams(d === selected ? {} : { d }, { replace: true }) }

  // Tüm zamanlarda ürün araması
  const searchRows = useMemo(() => {
    if (!qn) return []
    const rows = []
    for (const [d, entries] of Object.entries(byDay)) for (const e of entries) for (const i of e.items) rows.push({ d, p: e.pallet, i })
    return rows.sort((a, b) => b.d.localeCompare(a.d) || a.p.number - b.p.number)
  }, [byDay, qn])

  const exportPallets = async (palletIds, title) => {
    try { await downloadExcel({ data, palletIds, companyId: companyId || null, title }); toast('Excel indirildi') }
    catch (e) { toast(e.message, { type: 'error' }) }
  }

  const companies = user.role === 'firma' ? data.companies.filter(c => c.id === user.company_id) : data.companies

  return (
    <div className="space-y-3">
      {/* Filtreler */}
      <div className="card space-y-2 p-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
          {[['gonderim', 'Gönderim tarihi'], ['hazirlama', 'Hazırlama tarihi']].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={`flex-1 rounded-lg py-1.5 font-semibold ${mode === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select className="input py-2 text-sm" value={companyId} onChange={e => setCompanyId(e.target.value)} disabled={user.role === 'firma'}>
            <option value="">Tüm firmalar</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="relative">
            <Search size={16} className="absolute left-2.5 top-3 text-slate-400" />
            <input className="input py-2 pl-8 pr-7 text-sm" placeholder="Ürün ara" value={q} onChange={e => setQ(e.target.value)} />
            {q && <button className="absolute right-2 top-2.5 text-slate-400" onClick={() => setQ('')} aria-label="Temizle"><X size={16} /></button>}
          </div>
        </div>
      </div>

      {/* Ay */}
      <div className="card p-3">
        <div className="mb-2 flex items-center gap-2">
          <button className="btn-light btn-sm px-2" onClick={() => go(-1)} aria-label="Önceki ay"><ChevronLeft size={18} /></button>
          <div className="flex-1 text-center text-lg font-semibold text-slate-800">{MONTHS[month.getMonth()]} {month.getFullYear()}</div>
          <button className="btn-light btn-sm px-2" onClick={() => go(1)} aria-label="Sonraki ay"><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
          {DAYS.map(d => <div key={d}>{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {cells.map(d => {
            const k = ymd(d)
            const inMonth = d.getMonth() === month.getMonth()
            const entries = byDay[k] || []
            const n = entries.length
            const sel = selected === k
            return (
              <button key={k} onClick={() => pick(k)}
                className={`flex aspect-square flex-col items-center justify-start rounded-lg p-1 text-sm transition
                  ${sel ? 'bg-brand-700 text-white' : n ? 'bg-emerald-50 text-slate-800 hover:bg-emerald-100' : 'text-slate-700 hover:bg-slate-50'}
                  ${inMonth ? '' : 'opacity-35'} ${k === today && !sel ? 'ring-2 ring-brand-500' : ''}`}>
                <span className="font-medium">{d.getDate()}</span>
                {n > 0 && <span className={`mt-auto rounded-full px-1.5 text-[10px] font-bold ${sel ? 'bg-white text-brand-700' : 'bg-emerald-600 text-white'}`}>{n}</span>}
              </button>
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span><b>{monthEntries.length}</b> palet · <b>{monthItems.length}</b> kalem{monthItems.length > 0 && ` · ${unitTotals(monthItems)}`}</span>
          {monthEntries.length > 0 && <button className="btn-outline btn-sm ml-auto" onClick={() => exportPallets(monthEntries.map(e => e.pallet.id), `${MONTHS[month.getMonth()]} ${month.getFullYear()} — ${mode === 'gonderim' ? 'Gönderilen' : 'Hazırlanan'} Paletler`)}><FileSpreadsheet size={16} /> Ayı Excel'e aktar</button>}
        </div>
        {mode === 'gonderim' && <div className="mt-1 text-xs text-slate-500">Palet “Gönderildi” yapıldığında tarih otomatik o gün olur; palet sayfasından değiştirilebilir.</div>}
      </div>

      {/* Seçili gün */}
      {selected && (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2">
            <CalendarDays size={18} className="text-brand-700" />
            <div className="flex-1 font-semibold text-slate-800">{trDate(selected)}</div>
            {(byDay[selected] || []).length > 0 && <button className="btn-outline btn-sm" onClick={() => exportPallets(byDay[selected].map(e => e.pallet.id), `${trDate(selected)} — Paletler`)}><FileSpreadsheet size={16} /> Excel</button>}
          </div>
          {!(byDay[selected] || []).length ? <div className="text-sm text-slate-500">Bu gün {mode === 'gonderim' ? 'gönderilen' : 'hazırlanan'} palet yok.</div> : (
            <div className="space-y-3">
              {byDay[selected].map(({ pallet, items }) => <DayPallet key={pallet.id} pallet={pallet} items={items} companyById={companyById} />)}
            </div>
          )}
        </div>
      )}

      {/* Ürün araması (tüm zamanlar) */}
      {qn && (
        <div className="card p-4">
          <div className="mb-2 font-semibold text-slate-800">“{q.trim()}” — {mode === 'gonderim' ? 'gönderim' : 'hazırlama'} geçmişi ({searchRows.length})</div>
          {!searchRows.length ? <div className="text-sm text-slate-500">Eşleşen kayıt yok{mode === 'gonderim' ? ' (yalnızca gönderim tarihi olan paletler aranır)' : ''}.</div> : (
            <ul className="divide-y text-sm">
              {searchRows.map(({ d, p, i }) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2">
                  <button className="w-28 text-left font-medium text-brand-700 underline" onClick={() => { const dt = new Date(d + 'T00:00'); setMonth(new Date(dt.getFullYear(), dt.getMonth(), 1)); setSelected(d) }}>{new Date(d + 'T00:00').toLocaleDateString('tr-TR')}</button>
                  <Link to={`/palet/${p.id}`} className="font-semibold text-slate-800">Palet {p.number}</Link>
                  <span className="text-slate-600">{companyById[i.company_id]?.name}</span>
                  <span className="ml-auto text-slate-800">{i.product} · <b>{fmtQty(i.quantity)}</b> {i.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!selected && !qn && !monthEntries.length && (
        <Empty icon={CalendarDays} title={`${MONTHS[month.getMonth()]} ayında ${mode === 'gonderim' ? 'gönderilen' : 'hazırlanan'} palet yok`}>
          {mode === 'gonderim' && 'Paletleri “Gönderildi” olarak işaretleyince burada görünür.'}
        </Empty>
      )}
    </div>
  )
}

function DayPallet({ pallet, items, companyById }) {
  const byCo = {}
  for (const i of items) (byCo[i.company_id] ||= []).push(i)
  return (
    <div className="rounded-xl border border-slate-200">
      <Link to={`/palet/${pallet.id}`} className="flex items-center gap-2 border-b bg-slate-50 px-3 py-2">
        <span className="font-semibold text-slate-800">Palet {pallet.number}</span>
        <StatusChip status={pallet.status} />
        <span className="ml-auto text-xs text-slate-500">{items.length} kalem · {unitTotals(items)}</span>
      </Link>
      <div className="divide-y">
        {Object.entries(byCo).map(([cid, list]) => (
          <div key={cid} className="px-3 py-2 text-sm">
            <div className="font-medium text-brand-700">{companyById[cid]?.name}</div>
            <ul className="mt-0.5 space-y-0.5">
              {list.map(i => <li key={i.id} className="flex justify-between text-slate-700"><span>{i.product}</span><span className="tabular-nums"><b>{fmtQty(i.quantity)}</b> {i.unit}</span></li>)}
            </ul>
          </div>
        ))}
        {!items.length && <div className="px-3 py-2 text-sm text-slate-500">Boş palet</div>}
      </div>
    </div>
  )
}
