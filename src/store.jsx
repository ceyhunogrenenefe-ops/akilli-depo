import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { db, DEMO } from './lib/db.js'

const Ctx = createContext(null)
export const useStore = () => useContext(Ctx)

const SETTINGS_KEY = 'akilli-depo-ayarlar-v2'
const DEFAULT_SETTINGS = { autoSave: false, speak: true, continuous: true, inherit: false, ai: false }

export function StoreProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = yükleniyor, null = giriş yok
  const [data, setData] = useState({ companies: [], pallets: [], items: [] })
  const [loading, setLoading] = useState(false)
  const [toasts, setToasts] = useState([])
  const [activePalletId, setActivePalletIdState] = useState(() => localStorage.getItem('akilli-depo-aktif-palet') || null)
  const [settings, setSettingsState] = useState(() => {
    try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY)) } } catch { return DEFAULT_SETTINGS }
  })
  const toastId = useRef(0)

  const setSettings = s => { const n = { ...settings, ...s }; setSettingsState(n); localStorage.setItem(SETTINGS_KEY, JSON.stringify(n)) }
  const setActivePalletId = id => { setActivePalletIdState(id); id ? localStorage.setItem('akilli-depo-aktif-palet', id) : localStorage.removeItem('akilli-depo-aktif-palet') }

  const toast = useCallback((text, opts = {}) => {
    const id = ++toastId.current
    setToasts([{ id, text, type: opts.type || 'ok', action: opts.action }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), opts.duration || (opts.action ? 7000 : 3500))
  }, [])
  const dismissToast = id => setToasts(t => t.filter(x => x.id !== id))
  const clearToasts = () => setToasts([])

  const reload = useCallback(async () => {
    setLoading(true)
    try { setData(await db.loadAll()) } catch (e) { toast(e.message, { type: 'error' }) } finally { setLoading(false) }
  }, [toast])

  useEffect(() => { db.session().then(setUser).catch(() => setUser(null)) }, [])
  useEffect(() => {
    if (!user) return
    reload()
    return db.subscribe(reload)
  }, [user, reload])

  // aktif palet silinmişse temizle
  useEffect(() => {
    if (activePalletId && data.pallets.length && !data.pallets.some(p => p.id === activePalletId)) setActivePalletId(null)
  }, [data.pallets]) // eslint-disable-line

  // Tüm değişiklik işlemleri: hata bildirimi + yeniden yükleme
  const run = useCallback(async (fn, okText) => {
    try {
      const r = await fn()
      await reload()
      if (okText) toast(okText)
      return r
    } catch (e) {
      toast(e.message || String(e), { type: 'error' })
      throw e
    }
  }, [reload, toast])

  const derived = useMemo(() => {
    const companyById = Object.fromEntries(data.companies.map(c => [c.id, c]))
    const palletById = Object.fromEntries(data.pallets.map(p => [p.id, p]))
    const palletByNumber = Object.fromEntries(data.pallets.map(p => [p.number, p]))
    const itemsByPallet = {}
    for (const i of data.items) (itemsByPallet[i.pallet_id] ||= []).push(i)
    const nextPalletNumber = Math.max(0, ...data.pallets.map(p => p.number)) + 1
    return { companyById, palletById, palletByNumber, itemsByPallet, nextPalletNumber }
  }, [data])

  const role = user?.role
  const can = {
    edit: role === 'admin' || role === 'personel',
    admin: role === 'admin',
    notify: role === 'admin' || role === 'personel',
    history: role === 'admin' || role === 'personel',
  }

  const value = {
    DEMO, db, user, setUser, data, ...derived, loading, reload, run, toast, toasts, dismissToast, clearToasts,
    activePalletId, setActivePalletId, settings, setSettings, can,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const STATUS = {
  acik: { label: 'Açık', cls: 'bg-sky-100 text-sky-800' },
  tamamlandi: { label: 'Tamamlandı', cls: 'bg-amber-100 text-amber-800' },
  gonderildi: { label: 'Gönderildi', cls: 'bg-emerald-100 text-emerald-800' },
}
export const ROLES = {
  admin: 'Yönetici',
  personel: 'Personel',
  depo: 'Depo sorumlusu',
  firma: 'Firma yetkilisi',
  bekliyor: 'Onay bekliyor',
  pasif: 'Erişim kapalı',
}
