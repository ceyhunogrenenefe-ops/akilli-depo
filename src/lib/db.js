// Veri katmanı: Supabase (kalıcı, çok kullanıcılı) veya Demo (tarayıcıda, tek kullanıcı)
import { createClient } from '@supabase/supabase-js'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
export const DEMO = !URL || !KEY
export const supabase = DEMO ? null : createClient(URL, KEY)

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2))
const now = () => new Date().toISOString()

// ---------------------------------------------------------------- Demo
const LS = 'akilli-depo-demo-v1'
function load() {
  try { const d = JSON.parse(localStorage.getItem(LS)); if (d) return d } catch { /* boş */ }
  const d = {
    companies: [
      { id: uid(), code: 'A', name: 'A Firması', contact_name: '', phone: '', email: '', created_at: now() },
      { id: uid(), code: 'B', name: 'B Firması', contact_name: '', phone: '', email: '', created_at: now() },
      { id: uid(), code: 'C', name: 'C Firması', contact_name: '', phone: '', email: '', created_at: now() },
    ],
    pallets: [], items: [], recipients: [], audit: [], notifications: [],
  }
  save(d)
  return d
}
function save(d) { localStorage.setItem(LS, JSON.stringify(d)) }
const DEMO_USER = { id: 'demo', email: 'demo@yerel', full_name: 'Demo Kullanıcı', role: 'admin', company_id: null }
const listeners = new Set()
function demoMutate(fn, audit) {
  const d = load()
  const r = fn(d)
  if (audit) d.audit.unshift({ id: d.audit.length + 1, at: now(), user_email: DEMO_USER.email, ...audit })
  d.audit = d.audit.slice(0, 2000)
  save(d)
  listeners.forEach(l => l())
  return r
}

const demo = {
  async session() { return DEMO_USER },
  async signIn() { return DEMO_USER },
  async signOut() {},
  subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb) },
  async loadAll() { const d = load(); return { companies: d.companies, pallets: d.pallets, items: d.items } },

  async createCompany(c) {
    return demoMutate(d => {
      if (d.companies.some(x => x.name.toLocaleLowerCase('tr') === c.name.toLocaleLowerCase('tr'))) throw new Error('Bu isimde bir firma zaten var')
      const row = { id: uid(), created_at: now(), ...c }; d.companies.push(row); return row
    }, { entity: 'company', action: 'ekle', after: c })
  },
  async updateCompany(id, patch) {
    return demoMutate(d => { const c = d.companies.find(x => x.id === id); const before = { ...c }; Object.assign(c, patch); return { before, c } },
      { entity: 'company', entity_id: id, action: 'guncelle', after: patch })
  },
  async deleteCompany(id) {
    const d0 = load()
    if (d0.items.some(i => i.company_id === id)) throw new Error('Bu firmaya ait ürünler var. Önce ürünleri silin veya başka firmaya aktarın.')
    const before = d0.companies.find(x => x.id === id)
    return demoMutate(d => { d.companies = d.companies.filter(x => x.id !== id) }, { entity: 'company', entity_id: id, action: 'sil', before })
  },

  async createPallet(number) {
    let row
    demoMutate(d => {
      const n = number ?? (Math.max(0, ...d.pallets.map(p => p.number)) + 1)
      if (d.pallets.some(p => p.number === n)) throw new Error(`Palet ${n} zaten var`)
      row = { id: uid(), number: n, status: 'acik', note: '', created_at: now() }
      d.pallets.push(row)
    })
    demoMutate(() => {}, { entity: 'pallet', entity_id: row.id, action: 'ekle', after: row })
    return row
  },
  async updatePallet(id, patch) {
    const before = load().pallets.find(p => p.id === id)
    return demoMutate(d => Object.assign(d.pallets.find(p => p.id === id), patch), { entity: 'pallet', entity_id: id, action: 'guncelle', before, after: { ...before, ...patch } })
  },
  async deletePallet(id) {
    const before = load().pallets.find(p => p.id === id)
    return demoMutate(d => { d.pallets = d.pallets.filter(p => p.id !== id); d.items = d.items.filter(i => i.pallet_id !== id) },
      { entity: 'pallet', entity_id: id, action: 'sil', before })
  },

  async createItems(rows) {
    const out = rows.map(r => ({ id: uid(), created_at: now(), updated_at: now(), note: '', source: 'manuel', ...r }))
    demoMutate(d => { d.items.push(...out) })
    for (const r of out) demoMutate(() => {}, { entity: 'item', entity_id: r.id, action: 'ekle', after: r })
    return out
  },
  async updateItem(id, patch) {
    const before = load().items.find(i => i.id === id)
    const action = patch.pallet_id && patch.pallet_id !== before.pallet_id ? 'tasi' : 'guncelle'
    return demoMutate(d => Object.assign(d.items.find(i => i.id === id), patch, { updated_at: now() }),
      { entity: 'item', entity_id: id, action, before, after: { ...before, ...patch } })
  },
  async deleteItems(ids) {
    const d0 = load()
    for (const id of ids) {
      const before = d0.items.find(i => i.id === id)
      demoMutate(d => { d.items = d.items.filter(i => i.id !== id) }, { entity: 'item', entity_id: id, action: 'sil', before })
    }
  },

  async audit(limit = 300) { return load().audit.slice(0, limit) },

  async recipients() { return load().recipients },
  async saveRecipient(r) {
    return demoMutate(d => {
      if (r.id) { Object.assign(d.recipients.find(x => x.id === r.id), r); return r }
      const row = { id: uid(), active: true, use_email: true, use_whatsapp: true, ...r }; d.recipients.push(row); return row
    }, { entity: 'recipient', action: r.id ? 'guncelle' : 'ekle', after: r })
  },
  async deleteRecipient(id) { return demoMutate(d => { d.recipients = d.recipients.filter(x => x.id !== id) }, { entity: 'recipient', entity_id: id, action: 'sil' }) },

  async users() { return [DEMO_USER] },
  async updateUser() { throw new Error('Demo modunda kullanıcı yönetimi yok') },
  async createUser() { throw new Error('Demo modunda kullanıcı yönetimi yok. Supabase bağlantısını kurun.') },
  async notifications() { return load().notifications },
  async sendNotifications() { throw new Error('Demo modunda otomatik gönderim yok. WhatsApp / e-posta bağlantı butonlarını kullanabilirsiniz.') },
}

// ---------------------------------------------------------------- Supabase
async function q(p) { const { data, error } = await p; if (error) throw new Error(trError(error)); return data }
function trError(e) {
  const m = e.message || String(e)
  if (/items_company_id_fkey|violates foreign key.*items/.test(m)) return 'Bu firmaya ait ürünler var. Önce ürünleri silin veya başka firmaya aktarın.'
  if (/companies_name_uq/.test(m)) return 'Bu isimde bir firma zaten var'
  if (/pallets_number_key/.test(m)) return 'Bu numarada bir palet zaten var'
  if (/row-level security/.test(m)) return 'Bu işlem için yetkiniz yok'
  return m
}
async function api(path, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.error || `Sunucu hatası (${r.status})`)
  return j
}

const sb = {
  async session() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return null
    const p = await q(supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle())
    return p || { id: session.user.id, email: session.user.email, role: 'personel' }
  },
  async signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message === 'Invalid login credentials' ? 'E-posta veya şifre hatalı' : error.message)
    return sb.session()
  },
  async signOut() { await supabase.auth.signOut() },
  subscribe(cb) {
    let t
    const deb = () => { clearTimeout(t); t = setTimeout(cb, 250) }
    const ch = supabase.channel('depo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, deb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pallets' }, deb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'companies' }, deb)
      .subscribe()
    return () => supabase.removeChannel(ch)
  },
  async loadAll() {
    const [companies, pallets, items] = await Promise.all([
      q(supabase.from('companies').select('*').order('code', { nullsFirst: false }).order('name')),
      q(supabase.from('pallets').select('*').order('number')),
      q(supabase.from('items').select('*').order('created_at')),
    ])
    return { companies, pallets, items }
  },
  createCompany: c => q(supabase.from('companies').insert(c).select().single()),
  updateCompany: (id, patch) => q(supabase.from('companies').update(patch).eq('id', id)),
  deleteCompany: id => q(supabase.from('companies').delete().eq('id', id)),
  createPallet: number => q(supabase.rpc('create_pallet', { p_number: number ?? null })),
  updatePallet: (id, patch) => q(supabase.from('pallets').update(patch).eq('id', id)),
  deletePallet: id => q(supabase.from('pallets').delete().eq('id', id)),
  createItems: rows => q(supabase.from('items').insert(rows).select()),
  updateItem: (id, patch) => q(supabase.from('items').update(patch).eq('id', id)),
  deleteItems: ids => q(supabase.from('items').delete().in('id', ids)),
  audit: (limit = 300) => q(supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(limit)),
  recipients: () => q(supabase.from('recipients').select('*').order('kind').order('name')),
  saveRecipient: r => r.id
    ? q(supabase.from('recipients').update(r).eq('id', r.id))
    : q(supabase.from('recipients').insert(r).select().single()),
  deleteRecipient: id => q(supabase.from('recipients').delete().eq('id', id)),
  users: () => q(supabase.from('profiles').select('*').order('created_at')),
  updateUser: (id, patch) => q(supabase.from('profiles').update(patch).eq('id', id)),
  createUser: body => api('/api/users', body),
  notifications: () => q(supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200)),
  sendNotifications: body => api('/api/notify', body),
}

export const db = DEMO ? demo : sb
