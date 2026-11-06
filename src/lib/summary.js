// Metin özeti (WhatsApp / e-posta gövdesi) — ExcelJS gerektirmez
const collator = new Intl.Collator('tr')
const UNIT_ORDER = ['adet', 'koli', 'kutu', 'paket', 'kasa', 'çuval', 'torba', 'şişe', 'teneke', 'bidon', 'kavanoz', 'balya', 'rulo', 'kg', 'gr', 'ton', 'litre', 'metre']
function unitsOf(items) {
  const s = new Set(items.map(i => i.unit))
  return [...s].sort((a, b) => (UNIT_ORDER.indexOf(a) + 1 || 99) - (UNIT_ORDER.indexOf(b) + 1 || 99) || collator.compare(a, b))
}
export function fmt(n) {
  const x = Number(n)
  return Number.isInteger(x) ? x.toLocaleString('tr-TR') : x.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
}
export function fileName(prefix) {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  const safe = prefix.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/İ/g, 'I').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `${safe}_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`
}

/** Metin özeti: WhatsApp / e-posta gövdesi için */
export function textSummary({ companies, pallets, items, companyId = null, palletIds = null, header }) {
  const { rows, pallets: used } = buildWorkbookLite({ companies, pallets, items, companyId, palletIds })
  const lines = []
  if (header) lines.push(header, '')
  for (const no of used) {
    lines.push(`*PALET ${no}*`)
    const pr = rows.filter(r => r.palletNo === no)
    for (const cid of [...new Set(pr.map(r => r.company_id))]) {
      const cr = pr.filter(r => r.company_id === cid)
      if (!companyId) lines.push(`  ${cr[0].companyName}:`)
      for (const x of cr) lines.push(`${companyId ? '  ' : '    '}• ${x.product} — ${fmt(x.quantity)} ${x.unit}`)
    }
    lines.push('')
  }
  const tot = unitsOf(rows).map(u => `${fmt(rows.filter(x => x.unit === u).reduce((a, b) => a + b.quantity, 0))} ${u}`).join(', ')
  lines.push(`Toplam: ${tot || '—'}  (${used.length} palet, ${rows.length} kalem)`)
  return lines.join('\n')
}
function buildWorkbookLite({ companies, pallets, items, companyId, palletIds }) {
  const coById = Object.fromEntries(companies.map(c => [c.id, c]))
  const palById = Object.fromEntries(pallets.map(p => [p.id, p]))
  let rows = items.filter(i => palById[i.pallet_id] && coById[i.company_id])
  if (companyId) rows = rows.filter(i => i.company_id === companyId)
  if (palletIds && palletIds.length) { const s = new Set(palletIds); rows = rows.filter(i => s.has(i.pallet_id)) }
  rows = rows.map(i => ({ ...i, palletNo: palById[i.pallet_id].number, companyName: coById[i.company_id].name, quantity: Number(i.quantity) }))
    .sort((a, b) => a.palletNo - b.palletNo || collator.compare(a.companyName, b.companyName) || collator.compare(a.product, b.product))
  return { rows, pallets: [...new Set(rows.map(r => r.palletNo))] }
}
