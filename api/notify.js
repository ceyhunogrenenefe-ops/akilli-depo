// POST /api/notify  { palletIds: string[], recipientIds: string[], note?: string }
// Her alıcıya kendi kapsamındaki Excel'i (firma → yalnız kendi ürünleri, diğerleri → tüm liste)
// e-posta eki ve/veya WhatsApp dokümanı olarak gönderir.
import { admin, requireRole, handler, httpError, sendEmail, sendWhatsApp } from './_lib/server.js'
import { buildWorkbook } from '../src/lib/excel.js'
import { textSummary, fileName, fmt } from '../src/lib/summary.js'
import { normalizePhone, scopeFor } from '../src/lib/phone.js'

export const config = { maxDuration: 60 }

export default handler(async (req, body) => {
  const sb = admin()
  const me = await requireRole(req, sb, ['admin', 'personel'])
  const { palletIds = [], recipientIds = [], note = '' } = body
  if (!palletIds.length) throw httpError(400, 'Palet seçilmedi')
  if (!recipientIds.length) throw httpError(400, 'Alıcı seçilmedi')

  const [{ data: companies }, { data: pallets }, { data: items }, { data: recipients }] = await Promise.all([
    sb.from('companies').select('*'),
    sb.from('pallets').select('*').in('id', palletIds),
    sb.from('items').select('*').in('pallet_id', palletIds),
    sb.from('recipients').select('*').in('id', recipientIds).eq('active', true),
  ])
  const data = { companies, pallets, items }
  const palletNos = pallets.map(p => p.number).sort((a, b) => a - b)
  const dateStr = new Date().toLocaleDateString('tr-TR', { dateStyle: 'long', timeZone: 'Europe/Istanbul' })
  const coName = id => companies.find(c => c.id === id)?.name
  const results = []
  const log = []
  const cache = new Map() // aynı kapsam için dosyayı bir kez üret

  for (const r of recipients) {
    const companyId = scopeFor(r)
    const key = companyId || 'ALL'
    if (!cache.has(key)) {
      const title = companyId ? `${coName(companyId)} — Palet Ürün Listesi` : 'Palet Listesi — Genel Rapor'
      const { workbook, rows } = buildWorkbook({ ...data, companyId, palletIds, title })
      if (!rows.length) { cache.set(key, null) } else {
        const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
        const fname = fileName(companyId ? `${coName(companyId)} Palet Listesi` : 'Palet Listesi Genel')
        const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}/${fname}`
        const up = await sb.storage.from('raporlar').upload(path, buffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        if (up.error) throw httpError(500, `Dosya yüklenemedi: ${up.error.message}`)
        const { data: signed } = await sb.storage.from('raporlar').createSignedUrl(path, 60 * 60 * 24 * 7)
        cache.set(key, { buffer, fname, url: signed.signedUrl, rows })
      }
    }
    const file = cache.get(key)
    const base = { recipient: r.name }
    const start = results.length
    if (!file) { results.push({ ...base, channel: '-', status: 'atlandi', error: 'Seçili paletlerde bu firmaya ait ürün yok' }); continue }

    const header = `Merhaba ${r.name},\n${dateStr} — Palet ${palletNos.join(', ')} listesi${companyId ? ` (${coName(companyId)} ürünleri)` : ''}:`
    let text = textSummary({ ...data, companyId, palletIds, header })
    if (note.trim()) text += `\n\nNot: ${note.trim()}`
    const totalLine = `Palet ${palletNos.join(', ')} · ${file.rows.length} kalem`
    const subject = `Palet listesi — Palet ${palletNos.join(', ')}${companyId ? ` — ${coName(companyId)}` : ''}`

    if (r.use_email && r.email) {
      try {
        await sendEmail({ to: r.email, subject, text: `${text}\n\nExcel dosyası ektedir.`, html: htmlMail(header, file.rows, !companyId, note), attachment: { filename: file.fname, content: file.buffer } })
        results.push({ ...base, channel: 'email', status: 'gonderildi' })
      } catch (e) { results.push({ ...base, channel: 'email', status: 'hata', error: e.message }) }
    }
    if (r.use_whatsapp && r.phone) {
      const waText = (text.length > 1400 ? text.slice(0, 1400) + '\n… (devamı Excel dosyasında)' : text) + `\n\nExcel: ${file.url}`
      try {
        await sendWhatsApp({ to: normalizePhone(r.phone), text: waText, shortText: `${r.name}, ${dateStr} ${totalLine}${companyId ? ' (' + coName(companyId) + ')' : ''}`, fileUrl: file.url, fileName: file.fname })
        results.push({ ...base, channel: 'whatsapp', status: 'gonderildi' })
      } catch (e) { results.push({ ...base, channel: 'whatsapp', status: 'hata', error: e.message }) }
    }
    if (!(r.use_email && r.email) && !(r.use_whatsapp && r.phone)) results.push({ ...base, channel: '-', status: 'atlandi', error: 'İletişim bilgisi yok' })
    for (const x of results.slice(start)) {
      log.push({ created_by: me.id, recipient_id: r.id, recipient_name: r.name, channel: x.channel, status: x.status, error: x.error || null, pallet_numbers: palletNos, file_url: file.url })
    }
  }
  if (log.length) await sb.from('notifications').insert(log)
  return { results }
})

function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])) }
function htmlMail(header, rows, showCompany, note) {
  const th = 'style="background:#1f3a5f;color:#fff;padding:6px 10px;text-align:left;font-size:13px"'
  const td = 'style="border-bottom:1px solid #e2e8f0;padding:6px 10px;font-size:13px"'
  const body = rows.map(r => `<tr><td ${td}>Palet ${r.palletNo}</td>${showCompany ? `<td ${td}>${esc(r.companyName)}</td>` : ''}<td ${td}>${esc(r.product)}</td><td ${td} align="right">${fmt(r.quantity)}</td><td ${td}>${esc(r.unit)}</td></tr>`).join('')
  return `<div style="font-family:Arial,sans-serif;color:#1e293b">
<p>${esc(header).replace(/\n/g, '<br>')}</p>
<table cellspacing="0" style="border-collapse:collapse;min-width:420px">
<tr><th ${th}>Palet</th>${showCompany ? `<th ${th}>Firma</th>` : ''}<th ${th}>Ürün</th><th ${th}>Miktar</th><th ${th}>Birim</th></tr>${body}</table>
${note?.trim() ? `<p><b>Not:</b> ${esc(note)}</p>` : ''}
<p style="color:#64748b;font-size:12px">Ayrıntılı Excel raporu ektedir. — Akıllı Depo</p></div>`
}
