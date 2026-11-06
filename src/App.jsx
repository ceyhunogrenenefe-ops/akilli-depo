import { useState } from 'react'
import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, LogOut, Warehouse, CheckCircle2, AlertTriangle, Settings } from 'lucide-react'
import { useStore, ROLES } from './store.jsx'
import Home from './pages/Home.jsx'
import Voice from './pages/Voice.jsx'
import Pallets from './pages/Pallets.jsx'
import PalletDetail from './pages/PalletDetail.jsx'
import Companies from './pages/Companies.jsx'
import ExcelPage from './pages/ExcelPage.jsx'
import Notify from './pages/Notify.jsx'
import History from './pages/History.jsx'
import Admin from './pages/Admin.jsx'

export default function App() {
  const { user } = useStore()
  if (user === undefined) return <div className="flex h-screen items-center justify-center text-slate-500">Yükleniyor…</div>
  if (!user) return <Login />
  if (user.role === 'bekliyor' || user.role === 'pasif') return <Waiting />
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/ses" element={<Voice />} />
        <Route path="/paletler" element={<Pallets />} />
        <Route path="/palet/:id" element={<PalletDetail />} />
        <Route path="/firmalar" element={<Companies />} />
        <Route path="/excel" element={<ExcelPage />} />
        <Route path="/bildirim" element={<Notify />} />
        <Route path="/gecmis" element={<History />} />
        <Route path="/yonetim" element={<Admin />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </Layout>
  )
}

const TITLES = {
  '/ses': 'Sesle Ürün Ekle', '/paletler': 'Palet Listesi', '/firmalar': 'Firmalar', '/excel': 'Excel İndir',
  '/bildirim': 'Bildirim Gönder', '/gecmis': 'Geçmiş İşlemler', '/yonetim': 'Yönetim',
}

function Layout({ children }) {
  const { user, db, setUser, DEMO, toasts, dismissToast, can } = useStore()
  const loc = useLocation()
  const nav = useNavigate()
  const home = loc.pathname === '/'
  const title = TITLES[loc.pathname] || (loc.pathname.startsWith('/palet/') ? 'Palet' : 'Akıllı Depo')
  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-brand-700 text-white shadow" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 py-3">
          {home
            ? <Link to="/" className="flex items-center gap-2 font-semibold"><Warehouse size={22} /> Akıllı Depo</Link>
            : <>
                <button className="rounded-lg p-1.5 hover:bg-white/10" onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))} aria-label="Geri"><ArrowLeft size={22} /></button>
                <span className="font-semibold">{title}</span>
              </>}
          <div className="ml-auto flex items-center gap-1">
            {DEMO && <span className="chip bg-amber-300 text-amber-950">DEMO</span>}
            {can.admin && <Link to="/yonetim" className="rounded-lg p-1.5 hover:bg-white/10" aria-label="Yönetim"><Settings size={20} /></Link>}
            <span className="hidden text-sm text-white/80 sm:inline">{user.full_name || user.email} · {ROLES[user.role]}</span>
            {!DEMO && <button className="rounded-lg p-1.5 hover:bg-white/10" onClick={async () => { await db.signOut(); setUser(null) }} aria-label="Çıkış"><LogOut size={20} /></button>}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-3 py-4">{children}</main>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}>
        {toasts.map(t => (
          <div key={t.id} className={`pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-lg ${t.type === 'error' ? 'bg-red-600' : t.type === 'warn' ? 'bg-amber-600' : 'bg-slate-900'}`}>
            {t.type === 'error' || t.type === 'warn' ? <AlertTriangle size={20} className="shrink-0" /> : <CheckCircle2 size={20} className="shrink-0 text-emerald-400" />}
            <div className="flex-1 text-sm">{t.text}</div>
            {t.action && <button className="rounded-lg bg-white/15 px-3 py-1 text-sm font-semibold" onClick={() => { t.action.fn(); dismissToast(t.id) }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </div>
  )
}

function Login() {
  const { db, setUser, DEMO } = useStore()
  const [mode, setMode] = useState('giris')
  const [f, setF] = useState({ email: '', password: '', password2: '', full_name: '', phone: '', request_note: '' })
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    setBusy(true); setErr(''); setInfo('')
    try {
      if (mode === 'giris') { setUser(await db.signIn(f.email.trim(), f.password)); return }
      if (f.password.length < 6) throw new Error('Şifre en az 6 karakter olmalı')
      if (f.password !== f.password2) throw new Error('Şifreler aynı değil')
      const r = await db.signUp({ email: f.email.trim(), password: f.password, full_name: f.full_name.trim(), phone: f.phone.trim(), request_note: f.request_note.trim() })
      if (r.needsEmailConfirm) { setInfo('Kaydınız alındı. E-postanıza gelen doğrulama bağlantısına tıklayın; ardından yönetici onayından sonra giriş yapabilirsiniz.'); setMode('giris') }
      else setUser(r.user)
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  const tab = (k, l) => (
    <button type="button" onClick={() => { setMode(k); setErr('') }} className={`flex-1 rounded-lg py-2 text-sm font-semibold ${mode === k ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>{l}</button>
  )

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-700 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-6">
        <div className="flex items-center gap-2 text-xl font-semibold text-brand-700"><Warehouse /> Akıllı Depo</div>
        {!DEMO && <div className="flex gap-1 rounded-xl bg-slate-100 p-1">{tab('giris', 'Giriş Yap')}{tab('uye', 'Üye Ol')}</div>}
        {mode === 'uye' && (
          <>
            <div><label className="label">Ad Soyad</label><input className="input" required value={f.full_name} onChange={e => set('full_name', e.target.value)} autoComplete="name" /></div>
            <div><label className="label">Telefon</label><input className="input" inputMode="tel" value={f.phone} onChange={e => set('phone', e.target.value)} placeholder="05xx xxx xx xx" autoComplete="tel" /></div>
          </>
        )}
        <div><label className="label">E-posta</label><input className="input" type="email" autoComplete="email" value={f.email} onChange={e => set('email', e.target.value)} required /></div>
        <div><label className="label">Şifre</label><input className="input" type="password" autoComplete={mode === 'uye' ? 'new-password' : 'current-password'} value={f.password} onChange={e => set('password', e.target.value)} required /></div>
        {mode === 'uye' && (
          <>
            <div><label className="label">Şifre (tekrar)</label><input className="input" type="password" autoComplete="new-password" value={f.password2} onChange={e => set('password2', e.target.value)} required /></div>
            <div>
              <label className="label">Görev / firma (isteğe bağlı)</label>
              <input className="input" value={f.request_note} onChange={e => set('request_note', e.target.value)} placeholder="ör. Depo personeli · B Firması yetkilisi" />
            </div>
            <p className="text-xs text-slate-500">Kaydınız yönetici onayından sonra aktif olur.</p>
          </>
        )}
        {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
        {info && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{info}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Lütfen bekleyin…' : mode === 'giris' ? 'Giriş Yap' : 'Üye Ol'}</button>
      </form>
    </div>
  )
}

function Waiting() {
  const { user, db, setUser } = useStore()
  const [busy, setBusy] = useState(false)
  const pasif = user.role === 'pasif'
  const check = async () => { setBusy(true); try { setUser(await db.session()) } finally { setBusy(false) } }
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-700 p-4">
      <div className="card w-full max-w-sm space-y-3 p-6 text-center">
        <Warehouse className="mx-auto text-brand-700" size={36} />
        <div className="text-lg font-semibold text-slate-800">{pasif ? 'Hesabınıza erişim kapalı' : 'Kaydınız alındı — onay bekleniyor'}</div>
        <p className="text-sm text-slate-600">
          {pasif
            ? `${user.email} hesabının erişimi yönetici tarafından kapatıldı.`
            : `${user.full_name || user.email}, hesabınız yönetici onayladığında açılacak. Onaylandıktan sonra “Durumu kontrol et”e basın.`}
        </p>
        {!pasif && <button className="btn-primary w-full" disabled={busy} onClick={check}>{busy ? 'Kontrol ediliyor…' : 'Durumu kontrol et'}</button>}
        <button className="btn-light w-full" onClick={async () => { await db.signOut(); setUser(null) }}>Çıkış</button>
      </div>
    </div>
  )
}
