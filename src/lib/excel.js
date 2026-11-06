// Excel rapor oluşturucu — tarayıcıda ve sunucuda (Vercel API) ortak kullanılır
import ExcelJS from 'exceljs'
import { fmt, fileName } from './summary.js'
export { fmt, fileName }

const NAVY = 'FF1F3A5F', LIGHT = 'FFE8EEF5', BAND = 'FFF5F7FA', WHITE = 'FFFFFFFF', GRAY = 'FFBFC8D4'
const STATUS = { acik: 'Açık', tamamlandi: 'Tamamlandı', gonderildi: 'Gönderildi' }
const UNIT_ORDER = ['adet', 'koli', 'kutu', 'paket', 'kasa', 'çuval', 'torba', 'şişe', 'teneke', 'bidon', 'kavanoz', 'balya', 'rulo', 'kg', 'gr', 'ton', 'litre', 'metre']
const thin = { style: 'thin', color: { argb: GRAY } }
const border = { top: thin, left: thin, bottom: thin, right: thin }
const NUM = '#,##0.##'
const collator = new Intl.Collator('tr')

function unitsOf(items) {
  const s = new Set(items.map(i => i.unit))
  return [...s].sort((a, b) => (UNIT_ORDER.indexOf(a) + 1 || 99) - (UNIT_ORDER.indexOf(b) + 1 || 99) || collator.compare(a, b))
}
function colLetter(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26) } return s }

function headerRow(ws, rowNum, values) {
  const r = ws.getRow(rowNum)
  values.forEach((v, i) => {
    const c = r.getCell(i + 1)
    c.value = v
    c.font = { bold: true, color: { argb: WHITE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: true }
    c.border = border
  })
  r.height = 22
}
function titleBlock(ws, title, subtitle, width) {
  ws.mergeCells(1, 1, 1, width)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { bold: true, size: 16, color: { argb: NAVY } }
  ws.getRow(1).height = 26
  ws.mergeCells(2, 1, 2, width)
  const s = ws.getCell(2, 1)
  s.value = subtitle
  s.font = { size: 10, color: { argb: 'FF5B6B7F' } }
}
function pageSetup(ws, landscape = false) {
  ws.pageSetup = { paperSize: 9, orientation: landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
  ws.headerFooter = { oddFooter: '&L&8&D &T&R&8Sayfa &P / &N' }
}

/**
 * @param {object} p
 * @param {Array} p.companies
 * @param {Array} p.pallets
 * @param {Array} p.items
 * @param {string|null} [p.companyId]  verilirse yalnızca o firmanın raporu
 * @param {string[]|null} [p.palletIds] verilirse yalnızca bu paletler
 * @param {string} [p.title]
 */
export function buildWorkbook({ companies, pallets, items, companyId = null, palletIds = null, title }) {
  const coById = Object.fromEntries(companies.map(c => [c.id, c]))
  const palById = Object.fromEntries(pallets.map(p => [p.id, p]))
  let rows = items.filter(i => palById[i.pallet_id] && coById[i.company_id])
  if (companyId) rows = rows.filter(i => i.company_id === companyId)
  if (palletIds && palletIds.length) { const s = new Set(palletIds); rows = rows.filter(i => s.has(i.pallet_id)) }
  rows = rows.map(i => ({ ...i, palletNo: palById[i.pallet_id].number, companyName: coById[i.company_id].name, quantity: Number(i.quantity) }))
    .sort((a, b) => a.palletNo - b.palletNo || collator.compare(a.companyName, b.companyName) || collator.compare(a.product, b.product))
  const usedPallets = [...new Set(rows.map(r => r.palletNo))]
  const usedCompanies = [...new Set(rows.map(r => r.company_id))].map(id => coById[id]).sort((a, b) => collator.compare(a.name, b.name))
  const units = unitsOf(rows)
  const company = companyId ? coById[companyId] : null
  const dateStr = new Date().toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })
  const mainTitle = title || (company ? `${company.name} — Palet Ürün Listesi` : 'Palet Listesi — Genel Rapor')

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Akıllı Depo'
  wb.created = new Date()

  // ------------------------------------------------ 1) Özet
  const ws = wb.addWorksheet('Özet', { views: [{ showGridLines: false }] })
  const width = Math.max(4, units.length + 2)
  titleBlock(ws, mainTitle, `Oluşturma: ${dateStr}`, width)
  const info = [
    ['Palet sayısı', usedPallets.length],
    ['Paletler', usedPallets.map(n => `Palet ${n}`).join(', ') || '—'],
    company ? ['Firma', company.name] : ['Firma sayısı', usedCompanies.length],
    ['Ürün satırı', rows.length],
  ]
  info.forEach(([k, v], i) => {
    const r = ws.getRow(4 + i)
    r.getCell(1).value = k; r.getCell(1).font = { bold: true, color: { argb: NAVY } }
    r.getCell(2).value = v
    r.getCell(2).alignment = { horizontal: 'left' }
    ws.mergeCells(4 + i, 2, 4 + i, width)
  })
  let r0 = 4 + info.length + 1

  if (!company) {
    // Firma × birim toplam tablosu
    ws.getCell(r0, 1).value = 'Firma Toplamları'; ws.getCell(r0, 1).font = { bold: true, size: 12, color: { argb: NAVY } }
    r0++
    headerRow(ws, r0, ['Firma', ...units.map(u => u.toLocaleUpperCase('tr')), 'Ürün çeşidi'])
    const first = r0 + 1
    usedCompanies.forEach((c, idx) => {
      const r = ws.getRow(first + idx)
      const cr = rows.filter(x => x.company_id === c.id)
      r.getCell(1).value = c.name
      units.forEach((u, j) => { const s = cr.filter(x => x.unit === u).reduce((a, b) => a + b.quantity, 0); r.getCell(j + 2).value = s || null; r.getCell(j + 2).numFmt = NUM })
      r.getCell(units.length + 2).value = new Set(cr.map(x => x.product)).size
      for (let k = 1; k <= units.length + 2; k++) { const c2 = r.getCell(k); c2.border = border; if (idx % 2) c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }; if (k > 1) c2.alignment = { horizontal: 'center' } }
    })
    const last = first + usedCompanies.length - 1
    const tr = ws.getRow(last + 1)
    tr.getCell(1).value = 'GENEL TOPLAM'
    units.forEach((u, j) => {
      const L = colLetter(j + 2)
      const res = rows.filter(x => x.unit === u).reduce((a, b) => a + b.quantity, 0)
      tr.getCell(j + 2).value = usedCompanies.length ? { formula: `SUM(${L}${first}:${L}${last})`, result: res } : 0
      tr.getCell(j + 2).numFmt = NUM
    })
    for (let k = 1; k <= units.length + 2; k++) { const c2 = tr.getCell(k); c2.font = { bold: true }; c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }; c2.border = border; if (k > 1) c2.alignment = { horizontal: 'center' } }
    r0 = last + 3
  }

  if (company) {
    ws.getCell(r0, 1).value = 'Genel Toplam'; ws.getCell(r0, 1).font = { bold: true, size: 12, color: { argb: NAVY } }
    r0++
    headerRow(ws, r0, ['Birim', 'Toplam'])
    units.forEach((u, idx) => {
      const r = ws.getRow(r0 + 1 + idx)
      r.getCell(1).value = u
      r.getCell(2).value = rows.filter(x => x.unit === u).reduce((a, b) => a + b.quantity, 0)
      r.getCell(2).numFmt = NUM; r.getCell(2).alignment = { horizontal: 'center' }
      for (let k = 1; k <= 2; k++) { const c = r.getCell(k); c.border = border; c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } } }
    })
    r0 += units.length + 3
  }

  // Ürün toplamları
  ws.getCell(r0, 1).value = 'Ürün Toplamları'; ws.getCell(r0, 1).font = { bold: true, size: 12, color: { argb: NAVY } }
  r0++
  const prodHead = company ? ['Ürün', 'Toplam', 'Birim', 'Paletler'] : ['Firma', 'Ürün', 'Toplam', 'Birim', 'Paletler']
  headerRow(ws, r0, prodHead)
  const agg = new Map()
  for (const x of rows) {
    const k = `${x.company_id}|${x.product.toLocaleLowerCase('tr')}|${x.unit}`
    const a = agg.get(k) || { company: x.companyName, product: x.product, unit: x.unit, total: 0, pallets: new Set() }
    a.total += x.quantity; a.pallets.add(x.palletNo); agg.set(k, a)
  }
  ;[...agg.values()].sort((a, b) => collator.compare(a.company, b.company) || collator.compare(a.product, b.product)).forEach((a, idx) => {
    const vals = company ? [a.product, a.total, a.unit, [...a.pallets].sort((x, y) => x - y).join(', ')] : [a.company, a.product, a.total, a.unit, [...a.pallets].sort((x, y) => x - y).join(', ')]
    const r = ws.getRow(r0 + 1 + idx)
    vals.forEach((v, j) => { const c = r.getCell(j + 1); c.value = v; c.border = border; if (typeof v === 'number') { c.numFmt = NUM; c.alignment = { horizontal: 'center' } } if (idx % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } } })
  })
  const widths = company ? [34, 12, 10, 20] : [26, 30, 12, 10, 20]
  for (let i = 1; i <= Math.max(widths.length, units.length + 2); i++) ws.getColumn(i).width = widths[i - 1] || 12
  pageSetup(ws)

  // ------------------------------------------------ 2) Palet listesi (yazdırılabilir, palet → firma → ürün)
  const pl = wb.addWorksheet('Palet Listesi', { views: [{ showGridLines: false }] })
  titleBlock(pl, mainTitle, `Oluşturma: ${dateStr}`, 4)
  pl.columns = [{ width: 28 }, { width: 38 }, { width: 12 }, { width: 10 }]
  let r = 4
  for (const no of usedPallets) {
    const pal = pallets.find(p => p.number === no)
    const pr = rows.filter(x => x.palletNo === no)
    pl.mergeCells(r, 1, r, 4)
    const h = pl.getCell(r, 1)
    h.value = `PALET ${no}   ·   ${STATUS[pal.status] || ''}${pal.note ? '   ·   ' + pal.note : ''}`
    h.font = { bold: true, size: 13, color: { argb: WHITE } }
    h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
    pl.getRow(r).height = 22
    r++
    headerRow(pl, r, ['Firma', 'Ürün', 'Miktar', 'Birim'])
    pl.getRow(r).eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } }; c.font = { bold: true, color: { argb: NAVY } } })
    r++
    const cos = [...new Set(pr.map(x => x.company_id))]
    for (const cid of cos) {
      const cr = pr.filter(x => x.company_id === cid)
      cr.forEach((x, idx) => {
        const row = pl.getRow(r)
        row.getCell(1).value = idx === 0 ? x.companyName : ''
        row.getCell(1).font = { bold: true }
        row.getCell(2).value = x.product
        row.getCell(3).value = x.quantity; row.getCell(3).numFmt = NUM; row.getCell(3).alignment = { horizontal: 'center' }
        row.getCell(4).value = x.unit; row.getCell(4).alignment = { horizontal: 'center' }
        for (let k = 1; k <= 4; k++) row.getCell(k).border = border
        r++
      })
    }
    const totals = unitsOf(pr).map(u => `${fmt(pr.filter(x => x.unit === u).reduce((a, b) => a + b.quantity, 0))} ${u}`).join('  ·  ')
    pl.mergeCells(r, 1, r, 2)
    pl.getCell(r, 1).value = `Palet ${no} toplamı`
    pl.mergeCells(r, 3, r, 4)
    pl.getCell(r, 3).value = totals
    pl.getRow(r).eachCell(c => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } } })
    pl.getCell(r, 3).alignment = { horizontal: 'center' }
    r += 2
  }
  if (!usedPallets.length) pl.getCell(4, 1).value = 'Kayıtlı ürün yok.'
  pageSetup(pl)

  // ------------------------------------------------ 3) Detay (filtrelenebilir düz tablo)
  const dt = wb.addWorksheet('Detay', { views: [{ state: 'frozen', ySplit: 1 }] })
  dt.columns = [
    { header: 'Palet No', key: 'palletNo', width: 10 },
    { header: 'Firma', key: 'companyName', width: 24 },
    { header: 'Ürün', key: 'product', width: 34 },
    { header: 'Miktar', key: 'quantity', width: 11 },
    { header: 'Birim', key: 'unit', width: 9 },
    { header: 'Not', key: 'note', width: 24 },
    { header: 'Kayıt', key: 'created', width: 18 },
  ]
  headerRow(dt, 1, dt.columns.map(c => c.header))
  rows.forEach((x, idx) => {
    const row = dt.addRow({ ...x, note: x.note || '', created: x.created_at ? new Date(x.created_at).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '' })
    row.getCell(4).numFmt = NUM
    row.eachCell({ includeEmpty: true }, c => { c.border = border; if (idx % 2) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } } })
    row.getCell(1).alignment = { horizontal: 'center' }; row.getCell(4).alignment = { horizontal: 'center' }; row.getCell(5).alignment = { horizontal: 'center' }
  })
  dt.autoFilter = { from: 'A1', to: `G${Math.max(1, rows.length + 1)}` }
  pageSetup(dt, true)

  return { workbook: wb, rows, pallets: usedPallets, units, companies: usedCompanies }
}


