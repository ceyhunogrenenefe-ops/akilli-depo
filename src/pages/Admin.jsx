import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Users, UserPlus, Database } from 'lucide-react'
import { useStore, ROLES } from '../store.jsx'
import { Modal, Empty, CompanySelect } from '../components/ui.jsx'
import { KIND } from '../lib/phone.js'

export default function Admin() {
  const { can } = useStore()
  const [tab, setTab] = useState(() => (location.hash.includes('kullanicilar') ? 'kullanicilar' : 'alicilar'))
  if (!can.admin) return <div className="card p-6 text-slate-600">Bu bölüm yalnızca yöneticiler içindir.</div>
  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto">
        {[['alicilar', 'Bildirim alıcıları'], ['kullanicilar', 'Kullanıcılar'], ['ses', 'Sesli komut'], ['sistem', 'Sistem']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`btn btn-sm ${tab === k ? 'bg-brand-700 text-white' : 'border border-slate-200 bg-white'}`}>{l}</button>
        ))}
      </div>
      {tab === 'alicilar' && <Recipients />}
      {tab === 'kullanicilar' && <UsersTab />}
      {tab === 'ses' && <Learned />}
      {tab === 'sistem' && <System />}
    </div>
  )
}

function Recipients() {
  const { db, toast, companyById } = useStore()
  const [list, setList] = useState(null)
  const [edit, setEdit] = useState(null)
  const load = () => db.recipients().then(setList).catch(e => toast(e.message, { type: 'error' }))
  useEffect(() => { load() }, []) // eslint-disable-line

  const remove = async r => {
    if (!window.confirm(`${r.name} silinsin mi?`)) return
    try { await db.deleteRecipient(r.id); toast('Silindi'); load() } catch (e) { toast(e.message, { type: 'error' }) }
  }
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600">Firma yetkilisi yalnızca kendi firmasının ürün listesini alır. Depo sorumlusu, yönetici ve personel tüm palet listesini alır.</div>
      <button className="btn-primary" onClick={() => setEdit({ kind: 'firma', use_email: true, use_whatsapp: true, active: true })}><Plus size={18} /> Alıcı ekle</button>
      {list == null ? <div className="text-slate-500">Yükleniyor…</div> : list.length === 0 ? <Empty icon={Users} title="Alıcı yok" /> : (
        <ul className="card divide-y">
          {list.map(r => (
            <li key={r.id} className={`flex items-center gap-3 px-4 py-3 ${r.active ? '' : 'opacity-50'}`}>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800">{r.name}</div>
                <div className="text-xs text-slate-500">{KIND[r.kind]}{r.kind === 'firma' && ` · ${companyById[r.company_id]?.name || '?'}`}</div>
                <div className="truncate text-xs text-slate-500">{[r.use_whatsapp && r.phone && `WhatsApp ${r.phone}`, r.use_email && r.email && `E-posta ${r.email}`].filter(Boolean).join(' · ') || 'iletişim bilgisi yok'}</div>
              </div>
              <button className="btn-light btn-sm px-2" onClick={() => setEdit(r)}><Pencil size={16} /></button>
              <button className="btn-light btn-sm px-2 text-red-600" onClick={() => remove(r)}><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {edit && <RecipientModal value={edit} onClose={saved => { setEdit(null); if (saved) load() }} />}
    </div>
  )
}

function RecipientModal({ value, onClose }) {
  const { db, toast, companyById } = useStore()
  const [f, setF] = useState({ name: '', email: '', phone: '', company_id: '', ...value })
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  const submit = async e => {
    e.preventDefault()
    try {
      const row = { ...f, company_id: f.kind === 'firma' ? f.company_id || null : null }
      await db.saveRecipient(row)
      toast('Kaydedildi')
      onClose(true)
    } catch (e2) { toast(e2.message, { type: 'error' }) }
  }
  const pickCompany = id => {
    const c = companyById[id]
    setF(s => ({ ...s, company_id: id, name: s.name || c?.contact_name || `${c?.name} yetkilisi`, phone: s.phone || c?.phone || '', email: s.email || c?.email || '' }))
  }
  return (
    <Modal open onClose={() => onClose(false)} title={value.id ? 'Alıcıyı düzenle' : 'Yeni alıcı'}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Tür</label>
          <select className="input" value={f.kind} onChange={e => set('kind', e.target.value)}>
            {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {f.kind === 'firma' && (
          <div>
            <label className="label">Firma</label>
            <CompanySelect value={f.company_id} onChange={pickCompany} />
          </div>
        )}
        <div>
          <label className="label">Ad Soyad</label>
          <input className="input" required value={f.name} onChange={e => set('name', e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">WhatsApp telefonu</label>
            <input className="input" inputMode="tel" value={f.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="+31 6 1234 5678" />
          </div>
          <div>
            <label className="label">E-posta</label>
            <input className="input" type="email" value={f.email || ''} onChange={e => set('email', e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.use_whatsapp} onChange={e => set('use_whatsapp', e.target.checked)} /> WhatsApp gönder</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.use_email} onChange={e => set('use_email', e.target.checked)} /> E-posta gönder</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.active} onChange={e => set('active', e.target.checked)} /> Aktif</label>
        </div>
        <button className="btn-primary w-full" disabled={f.kind === 'firma' && !f.company_id}>Kaydet</button>
      </form>
    </Modal>
  )
}

function UsersTab() {
  const { db, toast, DEMO, companyById, user } = useStore()
  const [list, setList] = useState(null)
  const [adding, setAdding] = useState(false)
  const load = () => db.users().then(setList).catch(e => toast(e.message, { type: 'error' }))
  useEffect(() => { load() }, []) // eslint-disable-line
  const upd = async (u, patch) => { try { await db.updateUser(u.id, patch); toast('Güncellendi'); load() } catch (e) { toast(e.message, { type: 'error' }) } }

  return (
    <div className="space-y-3">
      {DEMO && <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Demo modunda tek kullanıcı vardır. Çok kullanıcılı çalışma için Supabase bağlantısı gerekir.</div>}
      {!DEMO && <button className="btn-primary" onClick={() => setAdding(true)}><UserPlus size={18} /> Kullanıcı ekle</button>}
      <div className="text-sm text-slate-600">
        <b>Yönetici</b>: her şey · <b>Personel</b>: palet/ürün ekler, düzenler, bildirim gönderir · <b>Depo sorumlusu</b>: tüm listeleri görür ve indirir · <b>Firma yetkilisi</b>: yalnızca kendi firmasının ürünlerini görür.
      </div>
      {list && list.some(u => u.role === 'bekliyor') && (
        <div className="card border-amber-300 p-4 ring-2 ring-amber-100">
          <div className="mb-2 font-semibold text-slate-800">Onay bekleyen üyeler ({list.filter(u => u.role === 'bekliyor').length})</div>
          <ul className="space-y-3">
            {list.filter(u => u.role === 'bekliyor').map(u => <PendingUser key={u.id} u={u} onDone={load} />)}
          </ul>
        </div>
      )}
      {list && (
        <ul className="card divide-y">
          {list.filter(u => u.role !== 'bekliyor').map(u => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-slate-800">{u.full_name || u.email}</div>
                <div className="text-xs text-slate-500">{u.email}{u.phone ? ` · ${u.phone}` : ''}</div>
              </div>
              <select className="input w-auto py-1.5 text-sm" value={u.role} disabled={DEMO || u.id === user.id} onChange={e => upd(u, { role: e.target.value, company_id: e.target.value === 'firma' ? u.company_id : null })}>
                {Object.entries(ROLES).filter(([k]) => k !== 'bekliyor').map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              {u.role === 'firma' && (
                <div className="w-44"><CompanySelect value={u.company_id || ''} onChange={v => upd(u, { company_id: v })} className="py-1.5 text-sm" /></div>
              )}
              {u.role === 'firma' && !u.company_id && <span className="chip bg-red-100 text-red-700">firma seçin</span>}
              {u.role === 'firma' && u.company_id && <span className="text-xs text-slate-500">{companyById[u.company_id]?.name}</span>}
            </li>
          ))}
        </ul>
      )}
      {adding && <NewUser onClose={ok => { setAdding(false); if (ok) load() }} />}
    </div>
  )
}

function NewUser({ onClose }) {
  const { db, toast } = useStore()
  const [f, setF] = useState({ email: '', password: '', full_name: '', role: 'personel', company_id: '' })
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))
  return (
    <Modal open onClose={() => onClose(false)} title="Yeni kullanıcı">
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault(); setBusy(true)
        try { await db.createUser({ ...f, company_id: f.role === 'firma' ? f.company_id : null }); toast('Kullanıcı oluşturuldu'); onClose(true) }
        catch (e2) { toast(e2.message, { type: 'error' }) } finally { setBusy(false) }
      }}>
        <div><label className="label">Ad Soyad</label><input className="input" required value={f.full_name} onChange={e => set('full_name', e.target.value)} /></div>
        <div><label className="label">E-posta</label><input className="input" type="email" required value={f.email} onChange={e => set('email', e.target.value)} /></div>
        <div><label className="label">Geçici şifre</label><input className="input" required minLength={8} value={f.password} onChange={e => set('password', e.target.value)} /></div>
        <div>
          <label className="label">Rol</label>
          <select className="input" value={f.role} onChange={e => set('role', e.target.value)}>{Object.entries(ROLES).filter(([k]) => !['bekliyor', 'pasif'].includes(k)).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </div>
        {f.role === 'firma' && <div><label className="label">Firma</label><CompanySelect value={f.company_id} onChange={v => set('company_id', v)} /></div>}
        <button className="btn-primary w-full" disabled={busy || (f.role === 'firma' && !f.company_id)}>{busy ? 'Oluşturuluyor…' : 'Oluştur'}</button>
      </form>
    </Modal>
  )
}

function System() {
  const { DEMO, data, settings, setSettings } = useStore()
  return (
    <div className="space-y-3">
      <div className="card flex items-start gap-3 p-4">
        <Database className="text-brand-700" />
        <div className="text-sm text-slate-700">
          <div className="font-semibold">{DEMO ? 'Demo modu — veriler yalnızca bu tarayıcıda' : 'Supabase bağlı — veriler kalıcı ve çok kullanıcılı'}</div>
          <div>{data.pallets.length} palet · {data.items.length} ürün kalemi · {data.companies.length} firma</div>
          {DEMO && <div className="mt-1">Kalıcı veritabanı için <code>VITE_SUPABASE_URL</code> ve <code>VITE_SUPABASE_ANON_KEY</code> ortam değişkenlerini tanımlayın (KURULUM.md).</div>}
        </div>
      </div>
      <div className="card space-y-2 p-4 text-sm">
        <div className="font-semibold text-slate-800">Bu cihazdaki ses ayarları</div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.autoSave} onChange={e => setSettings({ autoSave: e.target.checked })} /> Net anlaşılan komutları onay sormadan kaydet (Geri Al ile geri alınabilir)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.speak} onChange={e => setSettings({ speak: e.target.checked })} /> Kayıttan sonra sesli geri bildirim</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={settings.continuous} onChange={e => setSettings({ continuous: e.target.checked })} /> Sürekli dinleme (her komuttan sonra mikrofon tekrar açılır)</label>
      </div>
      {DEMO && (
        <button className="btn-light text-red-700" onClick={() => { if (window.confirm('Demo verileri silinsin mi?')) { localStorage.removeItem('akilli-depo-demo-v1'); location.reload() } }}>
          Demo verilerini sıfırla
        </button>
      )}
    </div>
  )
}

function PendingUser({ u, onDone }) {
  const { db, toast } = useStore()
  const [role, setRole] = useState('personel')
  const [company, setCompany] = useState('')
  const [busy, setBusy] = useState(false)
  const act = async patch => {
    setBusy(true)
    try { await db.updateUser(u.id, patch); toast(patch.role === 'pasif' ? `${u.full_name || u.email} reddedildi` : `${u.full_name || u.email} onaylandı`); onDone() }
    catch (e) { toast(e.message, { type: 'error' }) } finally { setBusy(false) }
  }
  return (
    <li className="rounded-xl border border-slate-200 p-3">
      <div className="font-medium text-slate-800">{u.full_name || u.email}</div>
      <div className="text-xs text-slate-500">{u.email}{u.phone ? ` · ${u.phone}` : ''} · {new Date(u.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}</div>
      {u.request_note && <div className="mt-1 text-sm italic text-slate-600">“{u.request_note}”</div>}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <select className="input py-2 text-sm" value={role} onChange={e => setRole(e.target.value)}>
          {['personel', 'depo', 'firma', 'admin'].map(k => <option key={k} value={k}>{ROLES[k]}</option>)}
        </select>
        {role === 'firma' ? <CompanySelect value={company} onChange={setCompany} className="py-2 text-sm" /> : <div />}
      </div>
      <div className="mt-2 flex gap-2">
        <button className="btn-light btn-sm flex-1 text-red-700" disabled={busy} onClick={() => { if (window.confirm(`${u.full_name || u.email} reddedilsin mi?`)) act({ role: 'pasif', company_id: null }) }}>Reddet</button>
        <button className="btn-green btn-sm flex-1" disabled={busy || (role === 'firma' && !company)} onClick={() => act({ role, company_id: role === 'firma' ? company : null })}>Onayla</button>
      </div>
    </li>
  )
}

function Learned() {
  const { db, toast, companyById } = useStore()
  const [rows, setRows] = useState(null)
  const load = () => db.aliases().then(setRows).catch(e => { toast(e.message, { type: 'error' }); setRows([]) })
  useEffect(() => { load() }, []) // eslint-disable-line
  const del = async a => { try { await db.deleteAlias(a.kind, a.heard); load() } catch (e) { toast(e.message, { type: 'error' }) } }
  return (
    <div className="space-y-3">
      <div className="text-sm text-slate-600">Sesli girişte yaptığınız firma ve ürün düzeltmeleri burada birikir; sistem bir dahaki sefere duyduğunu bu eşleştirmelerle tanır. Yanlış öğrenileni silebilirsiniz.</div>
      {rows == null ? <div className="text-slate-500">Yükleniyor…</div> : rows.length === 0 ? <Empty title="Henüz öğrenilen düzeltme yok" /> : (
        <ul className="card divide-y">
          {rows.map(a => (
            <li key={a.kind + a.heard} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="chip bg-slate-100 text-slate-700">{a.kind === 'firma' ? 'Firma' : 'Ürün'}</span>
              <span className="flex-1">“{a.heard}” → <b>{a.kind === 'firma' ? (companyById[a.value]?.name || 'silinmiş firma') : a.value}</b> <span className="text-xs text-slate-500">({a.uses}×)</span></span>
              <button className="btn-light btn-sm px-2 text-red-600" onClick={() => del(a)} aria-label="Sil"><Trash2 size={16} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
