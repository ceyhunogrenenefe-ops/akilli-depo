import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PackagePlus, Layers, Search, Star } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Empty, StatusChip, unitTotals } from '../components/ui.jsx'

export default function Pallets() {
  const { data, itemsByPallet, companyById, can, run, db, setActivePalletId, activePalletId } = useStore()
  const [filter, setFilter] = useState('hepsi')
  const [q, setQ] = useState('')
  const nav = useNavigate()

  const list = useMemo(() => {
    const ql = q.trim().toLocaleLowerCase('tr')
    return [...data.pallets]
      .sort((a, b) => b.number - a.number)
      .filter(p => filter === 'hepsi' || p.status === filter)
      .filter(p => {
        if (!ql) return true
        if (String(p.number) === ql) return true
        return (itemsByPallet[p.id] || []).some(i => i.product.toLocaleLowerCase('tr').includes(ql) || companyById[i.company_id]?.name.toLocaleLowerCase('tr').includes(ql))
      })
  }, [data.pallets, filter, q, itemsByPallet, companyById])

  const newPallet = async () => {
    const p = await run(() => db.createPallet(), null)
    setActivePalletId(p.id)
    nav(`/palet/${p.id}`)
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {can.edit && <button className="btn-primary" onClick={newPallet}><PackagePlus size={20} /> Yeni Palet</button>}
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-3 text-slate-400" />
          <input className="input pl-9" placeholder="Palet no, ürün veya firma ara" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="flex gap-1.5 overflow-x-auto">
        {[['hepsi', 'Hepsi'], ['acik', 'Açık'], ['tamamlandi', 'Tamamlandı'], ['gonderildi', 'Gönderildi']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`btn-sm btn ${filter === k ? 'bg-brand-700 text-white' : 'bg-white text-slate-700 border border-slate-200'}`}>{l}</button>
        ))}
      </div>

      {list.length === 0
        ? <Empty icon={Layers} title="Palet yok">{can.edit && 'Yeni Palet butonuyla başlayın.'}</Empty>
        : (
          <div className="grid gap-3 sm:grid-cols-2">
            {list.map(p => {
              const items = itemsByPallet[p.id] || []
              const cos = [...new Set(items.map(i => i.company_id))].map(id => companyById[id]?.name).filter(Boolean)
              return (
                <Link key={p.id} to={`/palet/${p.id}`} className="card block p-4 transition hover:border-brand-500">
                  <div className="flex items-center gap-2">
                    <div className="text-xl font-bold text-slate-800">Palet {p.number}</div>
                    {activePalletId === p.id && <span className="chip bg-emerald-100 text-emerald-800"><Star size={12} /> Aktif</span>}
                    <div className="ml-auto"><StatusChip status={p.status} /></div>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">{items.length} kalem{items.length > 0 && ' · ' + unitTotals(items)}</div>
                  {cos.length > 0 && <div className="mt-1 truncate text-sm text-slate-500">{cos.join(', ')}</div>}
                  {p.note && <div className="mt-1 truncate text-sm italic text-slate-500">{p.note}</div>}
                </Link>
              )
            })}
          </div>
        )}
    </div>
  )
}
