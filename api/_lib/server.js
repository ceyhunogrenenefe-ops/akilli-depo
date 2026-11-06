// Sunucu yardımcıları: Supabase yönetici istemcisi, yetki kontrolü, e-posta ve WhatsApp gönderimi
import { createClient } from '@supabase/supabase-js'

export function admin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://fxikolkybrddsxzncvzz.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw httpError(500, 'Sunucu ayarı eksik: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

export function httpError(status, message) { const e = new Error(message); e.status = status; return e }

/** İsteği yapan kullanıcıyı ve rolünü doğrular */
export async function requireRole(req, sb, roles) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) throw httpError(401, 'Oturum bulunamadı')
  const { data: { user }, error } = await sb.auth.getUser(token)
  if (error || !user) throw httpError(401, 'Oturum geçersiz, tekrar giriş yapın')
  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !roles.includes(profile.role)) throw httpError(403, 'Bu işlem için yetkiniz yok')
  return profile
}

export function handler(fn) {
  return async (req, res) => {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Yalnızca POST' })
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
      const out = await fn(req, body)
      res.status(200).json(out)
    } catch (e) {
      console.error(e)
      res.status(e.status || 500).json({ error: e.message || 'Sunucu hatası' })
    }
  }
}

// ------------------------------------------------------------------ E-posta
// Öncelik: RESEND_API_KEY → SMTP (Gmail uygulama şifresi vb.)
export async function sendEmail({ to, subject, text, html, attachment }) {
  const from = process.env.EMAIL_FROM
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: from || 'Akıllı Depo <onboarding@resend.dev>', to: [to], subject, text, html,
        attachments: attachment ? [{ filename: attachment.filename, content: attachment.content.toString('base64') }] : undefined,
      }),
    })
    if (!r.ok) throw new Error(`Resend: ${(await r.text()).slice(0, 200)}`)
    return
  }
  if (process.env.SMTP_HOST) {
    const nodemailer = (await import('nodemailer')).default
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: Number(process.env.SMTP_PORT || 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
    await t.sendMail({ from: from || process.env.SMTP_USER, to, subject, text, html, attachments: attachment ? [attachment] : undefined })
    return
  }
  throw new Error('E-posta servisi ayarlı değil (RESEND_API_KEY veya SMTP_HOST)')
}

// ------------------------------------------------------------------ WhatsApp
// WHATSAPP_PROVIDER = meta | twilio | webhook
export async function sendWhatsApp({ to, text, shortText, fileUrl, fileName }) {
  const provider = (process.env.WHATSAPP_PROVIDER || '').toLowerCase()
  if (provider === 'meta') {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`
    const tpl = process.env.WHATSAPP_TEMPLATE
    // İşletme tarafından başlatılan mesajlar için onaylı şablon gerekir (başlık: DOKÜMAN, gövde: {{1}})
    const body = tpl
      ? {
          messaging_product: 'whatsapp', to, type: 'template',
          template: {
            name: tpl, language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'tr' },
            components: [
              { type: 'header', parameters: [{ type: 'document', document: { link: fileUrl, filename: fileName } }] },
              { type: 'body', parameters: [{ type: 'text', text: shortText.replace(/\s+/g, ' ').slice(0, 900) }] },
            ],
          },
        }
      : { messaging_product: 'whatsapp', to, type: 'document', document: { link: fileUrl, filename: fileName, caption: text.slice(0, 1000) } }
    const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!r.ok) throw new Error(`Meta WhatsApp: ${(await r.text()).slice(0, 200)}`)
    return
  }
  if (provider === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID
    const form = new URLSearchParams({ From: `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`, To: `whatsapp:+${to}`, Body: text.slice(0, 1550) })
    if (fileUrl) form.append('MediaUrl', fileUrl)
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form,
    })
    if (!r.ok) throw new Error(`Twilio: ${(await r.text()).slice(0, 200)}`)
    return
  }
  if (provider === 'webhook') {
    // Kendi WhatsApp ağ geçidiniz (ör. VPS'teki whatsapp-gateway): POST { to, text, fileUrl, fileName }
    const r = await fetch(process.env.WHATSAPP_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.WHATSAPP_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.WHATSAPP_WEBHOOK_TOKEN}` } : {}) },
      body: JSON.stringify({ to, text, fileUrl, fileName }),
    })
    if (!r.ok) throw new Error(`WhatsApp ağ geçidi: ${r.status} ${(await r.text()).slice(0, 150)}`)
    return
  }
  throw new Error('WhatsApp servisi ayarlı değil (WHATSAPP_PROVIDER)')
}
