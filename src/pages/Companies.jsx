import { useState } from 'react'
import { Plus, Pencil, Trash2, Building2, Phone, Mail, User } from 'lucide-react'
import { useStore } from '../store.jsx'
import { Modal, Empty, unitTotals } from '../components/ui.jsx'

export default function Companies() {
  const { data, can, run, db } = useStore()
  const [edit, setEdit] = useState(null)

  const remove = async c => {
    const n = data.items.filter(i => i.company_id === c.id).length
    if (n) return run(() => Promise.reject(new Error(`${c.name} firmasına ait ${n} ürün kaydı var. Önce bu ürünleri silin veya başka firmaya aktarın.`)))
    if (!window.confirm(`${c.name} silinsin mi?`)) return
    await run(() => db.deleteCompany(c.id), `${c.name} silindi`)
  }

  return (
    <div className="space-y-3">
      {can.admin && <button className="btn-primary" onClick={() => setEdit({})}><Plus size={18} /> Firma ekle</button>}
      {data.companies.length === 0 && <Empty icon={Building2} title="Firma yok" />}
      <div className="grid gap-3 sm:grid-cols-2">
        {data.companies.map(c => {
          const items = data.items.filter(i => i.company_id === c.id)
          const pallets = new Set(items.map(i => i.pallet_id)).size
          return (
            <div key={c.id} className="card p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700">{c.code || c.name[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800">{c.name}</div>
                  <div className="text-sm text-slate-500">{pallets} palet · {items.length} kalem{items.length > 0 && ' · ' + unitTotals(items)}</div>
                  <div className="mt-1 space-y-0.5 text-sm text-slate-600">
                    {c.contact_name && <div className="flex items-center gap-1.5"><User size={14} /> {c.contact_name}</div>}
                    {c.phone && <div className="flex items-center gap-1.5"><Phone size={14} /> {c.phone}</div>}
                    {c.email && <div className="flex items-center gap-1.5 truncate"><Mail size={14} /> {c.email}</div>}
                  </div>
                </div>
                {can.admin && (
                  <div className="flex flex-col gap-1">
                    <button className="btn-light btn-sm px-2" onClick={() => setEdit(c)} aria-label="Düzenle"><Pencil size={16} /></button>
                    <button className="btn-light btn-sm px-2 text-red-600" onClick={() => remove(c)} aria-label="Sil"><Trash2 size={16} /></button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <CompanyModal value={edit} onClose={() => setEdit(null)} />
    </div>
  )
}

function CompanyModal({ value, onClose }) {
  const { run, db } = useStore()
  const [f, setF] = useState(null)
  if (value && (!f || f._src !== value)) setF({ _src: value, code: value.code || '', name: value.name || '', contact_name: value.contact_name || '', phone: value.phone || '', email: value.email || '' })
  if (!value || !f) return null
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const submit = async e => {
    e.preventDefault()
    const { _src, ...row } = f
    row.code = row.code.trim().toLocaleUpperCase('tr') || null
    row.name = row.name.trim()
    if (value.id) await run(() => db.updateCompany(value.id, row), 'Firma güncellendi')
    else await run(() => db.createCompany(row), 'Firma eklendi')
    setF(null)
    onClose()
  }
  return (
    <Modal open onClose={() => { setF(null); onClose() }} title={value.id ? 'Firmayı düzenle' : 'Yeni firma'}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Kod</label>
            <input className="input" maxLength={3} value={f.code} onChange={e => set('code', e.target.value)} placeholder="A" />
          </div>
          <div className="col-span-2">
            <label className="label">Firma adı</label>
            <input className="input" required value={f.name} onChange={e => set('name', e.target.value)} placeholder="ör. Yılmaz Gıda" />
          </div>
        </div>
        <p className="text-xs text-slate-500">Sesli komutta “{f.code || 'A'} firması” ya da “{f.name || 'Yılmaz Gıda'}” diyerek bu firmayı seçebilirsiniz.</p>
        <div>
          <label className="label">Yetkili kişi</label>
          <input className="input" value={f.contact_name} onChange={e => set('contact_name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Telefon (WhatsApp)</label>
            <input className="input" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="+90 5xx xxx xx xx" />
          </div>
          <div>
            <label className="label">E-posta</label>
            <input className="input" type="email" value={f.email} onChange={e => set('email', e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-slate-500">Bildirim alıcıları Yönetim → Alıcılar bölümünden yönetilir. Buradaki iletişim bilgisi bilgi amaçlıdır.</p>
        <button className="btn-primary w-full">Kaydet</button>
      </form>
    </Modal>
  )
}
