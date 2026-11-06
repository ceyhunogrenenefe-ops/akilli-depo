import { Link, useNavigate } from 'react-router-dom'
import { PackagePlus, Mic, Layers, Building2, FileSpreadsheet, Send, History } from 'lucide-react'
import { useStore } from '../store.jsx'
import { unitTotals } from '../components/ui.jsx'

export default function Home() {
  const { data, can, run, db, setActivePalletId, activePalletId, palletById, itemsByPallet, toast } = useStore()
  const nav = useNavigate()
  const active = activePalletId ? palletById[activePalletId] : null

  const newPallet = async () => {
    const p = await run(() => db.createPallet())
    setActivePalletId(p.id)
    toast(`Palet ${p.number} oluşturuldu ve aktif palet yapıldı`)
    nav(`/palet/${p.id}`)
  }

  const tiles = [
    can.edit && { label: 'Yeni Palet Oluştur', icon: PackagePlus, onClick: newPallet, cls: 'bg-brand-700 text-white' },
    can.edit && { label: 'Sesle Ürün Ekle', icon: Mic, to: '/ses', cls: 'bg-emerald-600 text-white', big: true },
    { label: 'Palet Listesi', icon: Layers, to: '/paletler' },
    can.edit || can.admin ? { label: 'Firmalar', icon: Building2, to: '/firmalar' } : null,
    { label: 'Excel İndir', icon: FileSpreadsheet, to: '/excel' },
    can.notify && { label: 'Bildirim Gönder', icon: Send, to: '/bildirim' },
    can.history && { label: 'Geçmiş İşlemler', icon: History, to: '/gecmis' },
  ].filter(Boolean)

  const open = data.pallets.filter(p => p.status === 'acik').length
  return (
    <div className="space-y-4">
      {can.edit && (
        <div className="card flex items-center gap-3 p-4">
          <div className="flex-1">
            <div className="text-xs uppercase tracking-wide text-slate-500">Aktif palet</div>
            {active
              ? <div className="text-lg font-semibold text-slate-800">Palet {active.number} <span className="text-sm font-normal text-slate-500">· {(itemsByPallet[active.id] || []).length} kalem {unitTotals(itemsByPallet[active.id] || []) && '· ' + unitTotals(itemsByPallet[active.id] || [])}</span></div>
              : <div className="text-slate-500">Seçilmedi — sesli komutta palet söylenmezse aktif palet kullanılır</div>}
          </div>
          {active && <Link to={`/palet/${active.id}`} className="btn-light btn-sm">Aç</Link>}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(t => {
          const inner = (
            <>
              <t.icon size={t.big ? 40 : 30} strokeWidth={1.8} />
              <span className="text-base font-semibold leading-tight">{t.label}</span>
            </>
          )
          const cls = `card flex ${t.big ? 'min-h-36' : 'min-h-28'} flex-col items-center justify-center gap-2 p-4 text-center transition active:scale-[.98] ${t.cls || 'text-brand-700 hover:bg-brand-50'}`
          return t.to
            ? <Link key={t.label} to={t.to} className={cls}>{inner}</Link>
            : <button key={t.label} onClick={t.onClick} className={cls}>{inner}</button>
        })}
      </div>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="card p-3"><div className="text-2xl font-bold text-brand-700">{data.pallets.length}</div><div className="text-xs text-slate-500">Palet</div></div>
        <div className="card p-3"><div className="text-2xl font-bold text-sky-700">{open}</div><div className="text-xs text-slate-500">Açık palet</div></div>
        <div className="card p-3"><div className="text-2xl font-bold text-emerald-700">{data.items.length}</div><div className="text-xs text-slate-500">Ürün kalemi</div></div>
      </div>
    </div>
  )
}
