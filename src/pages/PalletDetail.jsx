import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Plus, Mic, Pencil, Trash2, ArrowRightLeft, FileSpreadsheet, Send, Star, PackageOpen } from 'lucide-react'
import { useStore, STATUS } from '../store.jsx'
import { Modal, Empty, StatusChip, PalletSelect, unitTotals } from '../components/ui.jsx'
import ItemForm, { resolvePalletId } from '../components/ItemForm.jsx'
import { fmtQty } from '../lib/parser.js'
import { downloadExcel } from './ExcelPage.jsx'

export default function PalletDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { data, palletById, itemsByPallet, companyById, can, run, db, activePalletId, setActivePalletId, toast } = useStore()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [moving, setMoving] = useState(null) // { ids, label }
  const [noteEdit, setNoteEdit] = useState(null)
  const pallet = palletById[id]
  if (!pallet) return <Empty icon={PackageOpen} title="Palet bulunamadı"><Link className="text-brand-600 underline" to="/paletler">Palet listesine dön</Link></Empty>

  const items = itemsByPallet[id] || []
  const byCompany = {}
  for (const i of items) (byCompany[i.company_id] ||= []).push(i)
  const companyIds = Object.keys(byCompany).sort((a, b) => (companyById[a]?.name || '').localeCompare(companyById[b]?.name || '', 'tr'))

  const setStatus = async status => {
    await run(() => db.updatePallet(id, { status }), `Palet ${pallet.number}: ${STATUS[status].label}`)
    if (status === 'tamamlandi' && can.notify && window.confirm('Palet tamamlandı. Şimdi ilgili kişilere bildirim gönderilsin mi?')) nav(`/bildirim?p=${id}`)
  }
  const removePallet = async () => {
    if (!window.confirm(`Palet ${pallet.number} ve içindeki ${items.length} ürün silinsin mi?`)) return
    await run(() => db.deletePallet(id), `Palet ${pallet.number} silindi`)
    nav('/paletler')
  }
  const removeItem = async it => {
    if (!window.confirm(`${it.product} (${fmtQty(it.quantity)} ${it.unit}) silinsin mi?`)) return
    await run(() => db.deleteItems([it.id]), 'Ürün silindi')
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-800">Palet {pallet.number}</h1>
          <StatusChip status={pallet.status} />
          {activePalletId === id
            ? <span className="chip bg-emerald-100 text-emerald-800"><Star size={12} /> Aktif palet</span>
            : can.edit && <button className="btn-light btn-sm" onClick={() => { setActivePalletId(id); toast(`Palet ${pallet.number} aktif palet yapıldı`) }}><Star size={14} /> Aktif yap</button>}
        </div>
        <div className="mt-1 text-sm text-slate-600">{items.length} kalem · {companyIds.length} firma{items.length > 0 && ' · ' + unitTotals(items)}</div>
        <div className="mt-1 text-sm text-slate-500">
          {pallet.note ? <span className="italic">{pallet.note}</span> : null}
          {can.edit && <button className="ml-2 text-brand-600 underline" onClick={() => setNoteEdit(pallet.note || '')}>{pallet.note ? 'Notu düzenle' : 'Not ekle'}</button>}
        </div>

        {can.edit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <select className="input w-auto py-2" value={pallet.status} onChange={e => setStatus(e.target.value)}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button className="btn-primary btn-sm" onClick={() => setAdding(true)}><Plus size={16} /> Ürün ekle</button>
            <button className="btn-green btn-sm" onClick={() => { setActivePalletId(id); nav('/ses') }}><Mic size={16} /> Sesle ekle</button>
            <button className="btn-outline btn-sm" onClick={() => downloadExcel({ data, palletIds: [id], title: `Palet ${pallet.number}` }).catch(e => toast(e.message, { type: 'error' }))}><FileSpreadsheet size={16} /> Excel</button>
            {can.notify && <button className="btn-outline btn-sm" onClick={() => nav(`/bildirim?p=${id}`)}><Send size={16} /> Bildir</button>}
            <button className="btn-light btn-sm text-red-700" onClick={removePallet}><Trash2 size={16} /> Paleti sil</button>
          </div>
        )}
      </div>

      {items.length === 0
        ? <Empty icon={PackageOpen} title="Bu palet boş">{can.edit && 'Ürün eklemek için “Sesle ekle” veya “Ürün ekle”yi kullanın.'}</Empty>
        : companyIds.map(cid => {
          const list = byCompany[cid]
          return (
            <div key={cid} className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b bg-slate-50 px-4 py-2.5">
                <div className="font-semibold text-brand-700">{companyById[cid]?.name || 'Bilinmeyen firma'}</div>
                <div className="text-sm text-slate-500">· {unitTotals(list)}</div>
                {can.edit && <button className="btn-light btn-sm ml-auto" title="Bu firmanın tüm ürünlerini taşı" onClick={() => setMoving({ ids: list.map(i => i.id), label: `${companyById[cid]?.name} — ${list.length} ürün` })}><ArrowRightLeft size={14} /> Tümünü taşı</button>}
              </div>
              <ul className="divide-y">
                {list.map(it => (
                  <li key={it.id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="flex-1">
                      <div className="font-medium text-slate-800">{it.product}</div>
                      {it.note && <div className="text-xs text-slate-500">{it.note}</div>}
                    </div>
                    <div className="text-right font-semibold tabular-nums text-slate-800">{fmtQty(it.quantity)} <span className="text-sm font-normal text-slate-500">{it.unit}</span></div>
                    {can.edit && (
                      <div className="flex gap-1">
                        <button className="btn-light btn-sm px-2" onClick={() => setEditing(it)} aria-label="Düzenle"><Pencil size={16} /></button>
                        <button className="btn-light btn-sm px-2" onClick={() => setMoving({ ids: [it.id], label: it.product })} aria-label="Taşı"><ArrowRightLeft size={16} /></button>
                        <button className="btn-light btn-sm px-2 text-red-600" onClick={() => removeItem(it)} aria-label="Sil"><Trash2 size={16} /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}

      <Modal open={adding} onClose={() => setAdding(false)} title={`Palet ${pallet.number} — Ürün ekle`}>
        <ItemForm initial={{ pallet_id: id }} submitText="Ekle" onCancel={() => setAdding(false)} onSubmit={async f => {
          await run(async () => { const pid = await resolvePalletId(db, f.pallet_id); await db.createItems([{ ...f, pallet_id: pid, source: 'manuel' }]) }, `${f.product} eklendi`)
          setAdding(false)
        }} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Ürünü düzenle">
        {editing && <ItemForm initial={editing} onCancel={() => setEditing(null)} onSubmit={async f => {
          await run(async () => { const pid = await resolvePalletId(db, f.pallet_id); await db.updateItem(editing.id, { ...f, pallet_id: pid }) }, 'Güncellendi')
          setEditing(null)
        }} />}
      </Modal>

      <MoveDialog moving={moving} onClose={() => setMoving(null)} fromId={id} />

      <Modal open={noteEdit != null} onClose={() => setNoteEdit(null)} title={`Palet ${pallet.number} notu`}>
        <form onSubmit={async e => { e.preventDefault(); await run(() => db.updatePallet(id, { note: noteEdit }), 'Not kaydedildi'); setNoteEdit(null) }} className="space-y-3">
          <textarea className="input min-h-24" value={noteEdit || ''} onChange={e => setNoteEdit(e.target.value)} placeholder="ör. Kamyon 34 ABC 123, Rotterdam" />
          <button className="btn-primary w-full">Kaydet</button>
        </form>
      </Modal>
    </div>
  )
}

function MoveDialog({ moving, onClose, fromId }) {
  const { db, run, palletById } = useStore()
  const [target, setTarget] = useState('')
  if (!moving) return null
  return (
    <Modal open onClose={onClose} title="Başka palete taşı">
      <div className="space-y-3">
        <div className="text-slate-700">{moving.label}</div>
        <PalletSelect value={target} onChange={setTarget} />
        <button className="btn-primary w-full" disabled={!target || target === fromId} onClick={async () => {
          await run(async () => {
            const pid = await resolvePalletId(db, target)
            for (const iid of moving.ids) await db.updateItem(iid, { pallet_id: pid })
          }, `Taşındı → Palet ${target.startsWith('new:') ? target.slice(4) : palletById[target]?.number}`)
          setTarget('')
          onClose()
        }}>Taşı</button>
      </div>
    </Modal>
  )
}
