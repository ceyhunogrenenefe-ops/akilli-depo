import { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { PalletSelect, CompanySelect, UnitSelect } from './ui.jsx'
import { titleCaseTr } from '../lib/parser.js'

/** "new:7" biçimindeki palet seçimini gerçek palet id'sine çevirir (gerekirse paleti oluşturur) */
export async function resolvePalletId(db, value) {
  if (value && String(value).startsWith('new:')) {
    const n = Number(String(value).slice(4))
    const p = await db.createPallet(n)
    return p.id
  }
  return value
}

/** Manuel ürün ekleme / düzenleme formu */
export default function ItemForm({ initial = {}, onSubmit, submitText = 'Kaydet', onCancel }) {
  const { data } = useStore()
  const [f, setF] = useState({
    pallet_id: initial.pallet_id ?? '',
    company_id: initial.company_id ?? '',
    product: initial.product ?? '',
    quantity: initial.quantity ?? '',
    unit: initial.unit ?? 'adet',
    note: initial.note ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const products = useMemo(() => [...new Set(data.items.map(i => i.product))].sort((a, b) => a.localeCompare(b, 'tr')), [data.items])
  const valid = f.pallet_id && f.company_id && f.product.trim() && Number(String(f.quantity).replace(',', '.')) > 0

  const submit = async e => {
    e.preventDefault()
    if (!valid) return
    setBusy(true)
    try {
      await onSubmit({ ...f, product: titleCaseTr(f.product.trim()), quantity: Number(String(f.quantity).replace(',', '.')) })
    } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Palet</label>
          <PalletSelect value={f.pallet_id} onChange={v => set('pallet_id', v)} />
        </div>
        <div>
          <label className="label">Firma</label>
          <CompanySelect value={f.company_id} onChange={v => set('company_id', v)} />
        </div>
      </div>
      <div>
        <label className="label">Ürün</label>
        <input className="input" list="urun-listesi" value={f.product} onChange={e => set('product', e.target.value)} placeholder="ör. Domates Salçası" autoComplete="off" />
        <datalist id="urun-listesi">{products.map(p => <option key={p} value={p} />)}</datalist>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Miktar</label>
          <input className="input" inputMode="decimal" value={f.quantity} onChange={e => set('quantity', e.target.value)} placeholder="40" />
        </div>
        <div>
          <label className="label">Birim</label>
          <UnitSelect value={f.unit} onChange={v => set('unit', v)} />
        </div>
      </div>
      <div>
        <label className="label">Not (isteğe bağlı)</label>
        <input className="input" value={f.note} onChange={e => set('note', e.target.value)} />
      </div>
      <div className="flex gap-2 pt-1">
        {onCancel && <button type="button" className="btn-light flex-1" onClick={onCancel}>Vazgeç</button>}
        <button className="btn-primary flex-1" disabled={!valid || busy}>{busy ? 'Kaydediliyor…' : submitText}</button>
      </div>
    </form>
  )
}
