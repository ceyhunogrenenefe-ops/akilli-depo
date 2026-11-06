import { describe, it, expect, vi } from 'vitest'
import ExcelJS from 'exceljs'

const sent = { email: [], wa: [] }
const inserted = []
const T = {
  companies: [{ id: 'a', name: 'A Firması' }, { id: 'b', name: 'B Firması' }],
  pallets: [{ id: 'p1', number: 1, status: 'tamamlandi' }, { id: 'p2', number: 2, status: 'acik' }],
  items: [
    { pallet_id: 'p1', company_id: 'a', product: 'Domates Salçası', quantity: 40, unit: 'adet' },
    { pallet_id: 'p1', company_id: 'b', product: 'Makarna', quantity: 25, unit: 'koli' },
    { pallet_id: 'p2', company_id: 'b', product: 'Un', quantity: 5, unit: 'çuval' },
  ],
  recipients: [
    { id: 'r1', name: 'A Yetkili', kind: 'firma', company_id: 'a', email: 'a@x.com', phone: '0532 000 00 00', use_email: true, use_whatsapp: true, active: true },
    { id: 'r2', name: 'Jan', kind: 'depo', email: 'jan@nl', phone: '+31 6 1', use_email: true, use_whatsapp: true, active: true },
    { id: 'r3', name: 'C Yetkili', kind: 'firma', company_id: 'c', email: 'c@x', use_email: true, use_whatsapp: false, active: true },
  ],
}
function q(table) {
  let rows = [...T[table]]
  const b = {
    select: () => b,
    in: (k, v) => { rows = rows.filter(r => v.includes(r[k])); return b },
    eq: (k, v) => { rows = rows.filter(r => r[k] === v); return b },
    then: (res) => res({ data: rows }),
  }
  return b
}
const fakeSb = {
  from: t => t === 'notifications' ? { insert: r => { inserted.push(...r); return Promise.resolve({}) } } : q(t),
  storage: { from: () => ({ upload: async () => ({}), createSignedUrl: async p => ({ data: { signedUrl: 'https://x/' + p } }) }) },
}
vi.mock('./_lib/server.js', () => ({
  admin: () => fakeSb,
  requireRole: async () => ({ id: 'u1', role: 'personel' }),
  httpError: (s, m) => Object.assign(new Error(m), { status: s }),
  handler: fn => fn,
  sendEmail: async m => { sent.email.push(m) },
  sendWhatsApp: async m => { sent.wa.push(m) },
}))

describe('notify', () => {
  it('firma yalnızca kendi ürünlerini, depo tüm listeyi alır', async () => {
    const { default: fn } = await import('./notify.js')
    const out = await fn({ headers: {} }, { palletIds: ['p1', 'p2'], recipientIds: ['r1', 'r2', 'r3'], note: 'Kamyon 34 ABC' })
    const aMail = sent.email.find(m => m.to === 'a@x.com')
    expect(aMail.text).toContain('Domates Salçası')
    expect(aMail.text).not.toContain('Makarna')
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(aMail.attachment.content)
    const detail = wb.getWorksheet('Detay').getSheetValues().slice(2).map(r => r[3])
    expect(detail).toEqual(['Domates Salçası'])
    const janMail = sent.email.find(m => m.to === 'jan@nl')
    expect(janMail.text).toContain('Makarna'); expect(janMail.text).toContain('Un'); expect(janMail.text).toContain('Kamyon 34 ABC')
    expect(sent.wa.map(w => w.to).sort()).toEqual(['316 1'.replace(' ', ''), '905320000000'].sort())
    expect(out.results.find(r => r.recipient === 'C Yetkili').status).toBe('atlandi')
    expect(inserted.length).toBe(4)
  })
})
