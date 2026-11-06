import { useEffect } from 'react'
import { X } from 'lucide-react'
import { UNIT_LIST } from '../lib/parser.js'
import { useStore, STATUS } from '../store.jsx'

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return
    const f = e => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-slate-900/40 p-0 sm:p-4" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className={`w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-white shadow-xl`}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button className="btn-light btn-sm" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center text-slate-500">
      {Icon && <Icon size={36} className="text-slate-300" />}
      <div className="font-medium text-slate-700">{title}</div>
      {children}
    </div>
  )
}

export function StatusChip({ status }) {
  const s = STATUS[status] || STATUS.acik
  return <span className={`chip ${s.cls}`}>{s.label}</span>
}

export function UnitSelect({ value, onChange, className = '' }) {
  const opts = UNIT_LIST.includes(value) || !value ? UNIT_LIST : [value, ...UNIT_LIST]
  return (
    <select className={`input ${className}`} value={value} onChange={e => onChange(e.target.value)}>
      {opts.map(u => <option key={u} value={u}>{u}</option>)}
    </select>
  )
}

export function PalletSelect({ value, onChange, allowNew = true, className = '' }) {
  const { data, nextPalletNumber } = useStore()
  const pallets = [...data.pallets].sort((a, b) => a.number - b.number)
  return (
    <select className={`input ${className}`} value={value ?? ''} onChange={e => onChange(e.target.value)}>
      <option value="" disabled>Palet seçin</option>
      {pallets.map(p => <option key={p.id} value={p.id}>Palet {p.number}{p.status !== 'acik' ? ` (${STATUS[p.status].label})` : ''}</option>)}
      {String(value || '').startsWith('new:') && value !== `new:${nextPalletNumber}` && <option value={value}>Palet {value.slice(4)} (yeni)</option>}
      {allowNew && <option value={`new:${nextPalletNumber}`}>Palet {nextPalletNumber} (yeni)</option>}
    </select>
  )
}

export function CompanySelect({ value, onChange, className = '' }) {
  const { data } = useStore()
  return (
    <select className={`input ${className}`} value={value ?? ''} onChange={e => onChange(e.target.value)}>
      <option value="" disabled>Firma seçin</option>
      {data.companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )
}

export function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800">{value}</div>
    </div>
  )
}

/** Birim bazında toplamları "40 adet · 25 koli" biçiminde döndürür */
export function unitTotals(items) {
  const m = new Map()
  for (const i of items) m.set(i.unit, (m.get(i.unit) || 0) + Number(i.quantity))
  return [...m.entries()].map(([u, q]) => `${Number.isInteger(q) ? q.toLocaleString('tr-TR') : q.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} ${u}`).join(' · ')
}
