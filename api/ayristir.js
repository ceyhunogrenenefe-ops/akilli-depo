// POST /api/ayristir  { text, companies: string[], units: string[], products: string[] }
// Karışık sırayla söylenmiş bir komutu yapay zekâ ile alanlara ayırır.
// ANTHROPIC_API_KEY tanımlı değilse 501 döner ve uygulama yerel çözümleyiciyle devam eder.
import { createClient } from '@supabase/supabase-js'

const SB_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://fxikolkybrddsxzncvzz.supabase.co'
const SB_ANON = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ4aWtvbGt5YnJkZHN4em5jdnp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NzQxMzUsImV4cCI6MjEwOTU1MDEzNX0.3-yErB6RUz33YX5A4ifbX8cQNf_V3Kek0zC3QwsZxH8'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Yalnızca POST' })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return res.status(501).json({ error: 'Yapay zekâ ayrıştırma kapalı (ANTHROPIC_API_KEY yok)' })

  // Yetki: yalnızca giriş yapmış yönetici/personel
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const sb = createClient(SB_URL, SB_ANON, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: { user } } = await sb.auth.getUser(token)
  if (!user) return res.status(401).json({ error: 'Oturum geçersiz' })
  const { data: me } = await sb.from('profiles').select('role').eq('id', user.id).single()
  if (!me || !['admin', 'personel'].includes(me.role)) return res.status(403).json({ error: 'Yetki yok' })

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
  const text = String(body.text || '').slice(0, 500)
  const companies = (body.companies || []).slice(0, 200)
  const units = (body.units || []).slice(0, 50)
  const products = (body.products || []).slice(0, 300)

  const system = `Bir depo uygulaması için Türkçe sesli komutları alanlara ayırıyorsun.
Alanlar: pallet (palet numarası, tam sayı), company (yalnızca listedeki firma adlarından biri, birebir yazımıyla), product (ürün adı; listede benzeri varsa onun yazımı), quantity (sayı), unit (yalnızca birim listesinden biri).
Kural: Emin olmadığın veya söylenmemiş alanı null bırak. Asla tahmin etme, varsayılan değer koyma.
Yalnızca JSON döndür: {"pallet":..,"company":..,"product":..,"quantity":..,"unit":..}`
  const user_msg = `Firmalar: ${JSON.stringify(companies)}
Birimler: ${JSON.stringify(units)}
Kayıtlı ürünler: ${JSON.stringify(products)}
Komut: "${text}"`

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-haiku-5-5', max_tokens: 200, system, messages: [{ role: 'user', content: user_msg }] }),
    })
    if (!r.ok) return res.status(502).json({ error: `Yapay zekâ hatası: ${r.status}` })
    const j = await r.json()
    const out = (j.content || []).map(c => c.text || '').join('')
    const m = out.match(/\{[\s\S]*\}/)
    if (!m) return res.status(502).json({ error: 'Yanıt okunamadı' })
    const p = JSON.parse(m[0])
    // Güvenlik: listede olmayan firma/birimi kabul etme
    if (p.company && !companies.includes(p.company)) p.company = null
    if (p.unit && !units.includes(p.unit)) p.unit = null
    if (p.pallet != null && !Number.isInteger(Number(p.pallet))) p.pallet = null
    if (p.quantity != null && !(Number(p.quantity) > 0)) p.quantity = null
    return res.status(200).json(p)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
