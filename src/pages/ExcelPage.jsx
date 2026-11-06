import { useState } from 'react'
import { FileSpreadsheet, Download, Building2 } from 'lucide-react'
import { useStore, STATUS } from '../store.jsx'
import { fileName } from '../lib/summary.js'

export async function makeExcelBlob({ data, companyId = null, palletIds = null, title }) {
  const { buildWorkbook } = await import('../lib/excel.js')
  const { workbook, rows } = buildWorkbook({ ...data, companyId, palletIds, title })
  const buf = await workbook.xlsx.writeBuffer()
  return { blob: new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), count: rows.length }
}

export async function downloadExcel({ data, companyId = null, palletIds = null, title, name }) {
  const { blob, count } = await makeExcelBlob({ data, companyId, palletIds, title })
  if (!count) throw new Error('Seçime uygun ürün yok')
  const co = companyId ? data.companies.find(c => c.id === companyId)?.name : null
  const fname = fileName(name || title || (co ? `${co} Palet Listesi` : 'Palet Listesi Genel'))
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = fname
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000)
}

export default function ExcelPage() {
  const { data, toast, user } = useStore()
  const [statusFilter, setStatusFilter] = useState('hepsi')
  const [selected, setSelected] = useState([])
  const [busy, setBusy] = useState(false)

  const pallets = [...data.pallets].sort((a, b) => a.number - b.number).filter(p => statusFilter === 'hepsi' || p.status === statusFilter)
  const palletIds = selected.length ? selected : (statusFilter === 'hepsi' ? null : pallets.map(p => p.id))
  const scopeText = selected.length ? `${selected.length} seçili palet` : statusFilter === 'hepsi' ? 'Tüm paletler' : `${STATUS[statusFilter].label} paletler (${pallets.length})`
  const toggle = id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const companies = user.role === 'firma' ? data.companies.filter(c => c.id === user.company_id) : data.companies

  const go = async opts => {
    setBusy(true)
    try { await downloadExcel({ data, palletIds: palletIds && !palletIds.length ? ['-'] : palletIds, ...opts }); toast('Excel indirildi') }
    catch (e) { toast(e.message, { type: 'error' }) }
    finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4">
        <div className="font-semibold text-slate-800">Hangi paletler?</div>
        <div className="flex flex-wrap gap-1.5">
          {[['hepsi', 'Hepsi'], ['acik', 'Açık'], ['tamamlandi', 'Tamamlandı'], ['gonderildi', 'Gönderildi']].map(([k, l]) => (
            <button key={k} onClick={() => { setStatusFilter(k); setSelected([]) }} className={`btn btn-sm ${statusFilter === k ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-700'}`}>{l}</button>
          ))}
        </div>
        {pallets.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {pallets.map(p => (
              <button key={p.id} onClick={() => toggle(p.id)} className={`btn btn-sm ${selected.includes(p.id) ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>Palet {p.number}</button>
            ))}
          </div>
        )}
        <div className="text-sm text-slate-500">Kapsam: <b>{scopeText}</b>{selected.length > 0 && <button className="ml-2 text-brand-600 underline" onClick={() => setSelected([])}>temizle</button>}</div>
      </div>

      {user.role !== 'firma' && (
        <button disabled={busy} onClick={() => go({ title: 'Palet Listesi — Genel Rapor', name: 'Palet Listesi Genel' })} className="card flex w-full items-center gap-4 p-5 text-left transition hover:border-brand-500 active:scale-[.99]">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white"><FileSpreadsheet size={30} /></div>
          <div className="flex-1">
            <div className="text-lg font-semibold text-slate-800">Genel rapor (tüm firmalar)</div>
            <div className="text-sm text-slate-500">Özet + firma toplamları · Palet palet liste · Filtrelenebilir detay tablosu</div>
          </div>
          <Download className="text-slate-400" />
        </button>
      )}

      <div className="card p-4">
        <div className="mb-3 font-semibold text-slate-800">Firma bazlı raporlar</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {companies.map(c => {
            const n = data.items.filter(i => i.company_id === c.id && (!palletIds || palletIds.includes(i.pallet_id))).length
            return (
              <button key={c.id} disabled={busy || !n} onClick={() => go({ companyId: c.id })} className="btn-outline justify-start">
                <Building2 size={18} /> <span className="flex-1 text-left">{c.name}</span> <span className="text-sm text-slate-500">{n} kalem</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
