// Sesli komut motoru
// 1) Sıralı okuma:  Palet → Firma → Ürün → Miktar → Birim
// 2) Serbest sıra:  mevcut kural tabanlı çözümleyici (parser.js)
// 3) İkisi aynı alanda farklı sonuç verirse alan "belirsiz" kalır; tahmin edilmez.
import { tokenize, findCompany, STOP, titleCaseTr, cleanProductWords, parseCommand, UNITS, trLower, lev, ASCII } from './parser.js'

export const FIELDS = ['pallet', 'company', 'product', 'quantity', 'unit']
export const FIELD_LABEL = { pallet: 'Palet', company: 'Firma', product: 'Ürün', quantity: 'Miktar', unit: 'Birim' }

const isFiller = t => t && (t.type === 'sep' || (t.type === 'word' && STOP.has(t.w)))

/** Sabit sıralı okuma. Sıra dışı kalan kelimeler `leftovers` içinde döner. */
export function parseOrdered(text, companies) {
  const t = tokenize(text)
  const r = { pallet: null, palletRef: null, company: null, companyRaw: null, companyHeard: null, companyAmbiguous: null, product: '', productRaw: '', quantity: null, unit: null, leftovers: [] }
  let i = 0
  const skip = () => { while (i < t.length && isFiller(t[i])) i++ }

  // 1) Palet
  skip()
  if (t[i]?.type === 'palet') {
    if (t[i + 1]?.type === 'num') { r.pallet = t[i + 1].v; i += 2 }
    else if (t[i + 1]?.type === 'word' && /^numara/.test(t[i + 1].w) && t[i + 2]?.type === 'num') { r.pallet = t[i + 2].v; i += 3 }
    else i++
  } else if (t[i]?.type === 'num' && t[i + 1]?.type === 'palet') { r.pallet = t[i].v; i += 2 }
  else if (t[i]?.type === 'word' && ['son', 'sonuncu', 'yeni', 'aynı', 'bu'].includes(t[i].w) && t[i + 1]?.type === 'palet') {
    r.palletRef = { son: 'last', sonuncu: 'last', yeni: 'new', aynı: 'current', bu: 'current' }[t[i].w]; i += 2
  }

  // 2) Firma
  skip()
  const cm = i < t.length ? findCompany(t, companies, { at: i, loose: true }) : null
  if (cm) {
    if (cm.ambiguous) r.companyAmbiguous = cm.ambiguous
    else { r.company = cm.company; r.companyRaw = t.slice(i, cm.end).map(x => x.w).join(' ') }
    i = cm.end
  } else {
    // Kayıtlı olmayan firma: "Demir firması" / "firma Demir"
    let k = i
    const parts = []
    while (k < t.length && k < i + 4 && t[k].type === 'word' && !STOP.has(t[k].w)) { parts.push(t[k].w); k++ }
    if (parts.length && t[k]?.type === 'firma') { r.companyHeard = titleCaseTr(parts.join(' ')); r.companyRaw = parts.join(' '); i = k + 1 }
    else if (t[i]?.type === 'firma' && t[i + 1]?.type === 'word') { r.companyHeard = titleCaseTr(t[i + 1].w); r.companyRaw = t[i + 1].w; i += 2 }
  }

  // 3) Ürün: miktara (sayıya) ya da birime kadar
  skip()
  const pw = []
  while (i < t.length && !(t[i].type === 'num' && !t[i].ord) && t[i].type !== 'unit') {
    if (t[i].type === 'word' && !STOP.has(t[i].w)) pw.push(t[i].w)
    else if (t[i].type === 'palet' || t[i].type === 'firma' || (t[i].type === 'num' && t[i].ord)) r.leftovers.push(t[i].w)
    i++
  }
  r.productRaw = pw.join(' ')
  r.product = titleCaseTr(cleanProductWords(pw).join(' '))

  // 4) Miktar
  skip()
  if (t[i]?.type === 'num' && !t[i].ord) { r.quantity = t[i].v; i++ }
  // 5) Birim
  skip()
  if (t[i]?.type === 'unit') { r.unit = t[i].v; i++ }

  for (; i < t.length; i++) if (!isFiller(t[i])) r.leftovers.push(t[i].w)
  return r
}

function fromFree(it) {
  return {
    pallet: it.pallet ?? null, palletRef: it.palletRef ?? null,
    company: it.companyId ? { id: it.companyId, name: it.companyName } : null,
    companyRaw: it.companyRaw, companyHeard: it.companyHeard, companyAmbiguous: it.companyAmbiguous,
    product: it.product || '', productRaw: trLower(it.product || ''),
    quantity: it.quantity ?? null, unit: it.unitExplicit ? it.unit : null, leftovers: [],
  }
}

const normProduct = s => ASCII(trLower(s || '')).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

/** Söylenen ürün adını kayıtlı ürünlerle eşleştirir (önce öğrenilmiş düzeltmeler). */
export function canonicalProduct(name, products = [], productAliases = {}) {
  const n = normProduct(name)
  if (!n) return { product: name }
  if (productAliases[n]) return { product: productAliases[n], matchedFrom: name, learned: true }
  const exact = products.find(p => normProduct(p) === n)
  if (exact) return { product: exact }
  const max = n.length >= 9 ? 2 : n.length >= 5 ? 1 : 0
  if (!max) return { product: name }
  const close = products.filter(p => lev(normProduct(p), n) <= max)
  if (close.length === 1) return { product: close[0], matchedFrom: name }
  return { product: name }
}

const same = (f, a, b) => {
  if (f === 'company') return a?.id === b?.id
  if (f === 'product') return normProduct(a) === normProduct(b)
  return a === b
}
const has = (f, v) => f === 'product' ? !!(v && v.trim()) : v != null && v !== ''

/**
 * Bir konuşmayı alanlara ayırır.
 * @returns {Array<Result>} genelde tek satır; "ve" ile birden fazla ürün söylenirse birden çok
 */
export function analyze(text, { companies = [], products = [], productAliases = {} } = {}) {
  const o = parseOrdered(text, companies)
  // Sıralı okuma eksiksiz ve artık kelime yoksa: doğrudan ona güven
  if (!o.leftovers.length && !missingFields(o).length && !o.companyAmbiguous) return [finish({ ...o, mode: 'sirali' }, products, productAliases)]

  const free = parseCommand(text, companies).items
  if (free.length > 1 && o.leftovers.length) return free.map(x => finish({ ...fromFree(x), mode: 'serbest' }, products, productAliases))

  const f = free[0] ? fromFree(free[0]) : null
  const orderedClean = o.leftovers.length === 0
  const primary = orderedClean || !f ? o : f
  const secondary = primary === o ? f : o
  const r = { ...primary, mode: primary === o ? 'sirali' : 'serbest', conflicts: [] }

  if (secondary) {
    for (const fld of FIELDS) {
      const a = r[fld], b = secondary[fld]
      if (has(fld, a) && has(fld, b) && !same(fld, a, b)) {
        // Sıralı okuma temizse ve serbest okuma yalnızca kelime sınırında farklıysa sıralıya güven
        if (primary === o && fld === 'product' && normProduct(b).includes(normProduct(a))) continue
        r.conflicts.push({ field: fld, options: [a, b] })
        r[fld] = fld === 'product' ? '' : null
      } else if (!has(fld, a) && has(fld, b) && !(fld === 'unit' && primary === o && r.quantity == null)) {
        r[fld] = b
      }
    }
    if (!r.palletRef && secondary.palletRef && r.pallet == null) r.palletRef = secondary.palletRef
    if (!r.company && !r.companyHeard && secondary.companyHeard) { r.companyHeard = secondary.companyHeard; r.companyRaw = secondary.companyRaw }
    if (!r.company && !r.companyAmbiguous && secondary.companyAmbiguous) r.companyAmbiguous = secondary.companyAmbiguous
  }
  return [finish(r, products, productAliases)]
}

function finish(r, products, productAliases) {
  const out = { ...r, conflicts: r.conflicts || [], productSpoken: r.product }
  if (out.product) {
    const c = canonicalProduct(out.product, products, productAliases)
    out.product = c.product
    if (c.matchedFrom && normProduct(c.matchedFrom) !== normProduct(c.product)) out.productMatchedFrom = c.matchedFrom
    if (c.learned) out.productLearned = true
  }
  return out
}

export function missingFields(r) {
  const m = []
  if (r.pallet == null && !r.palletRef && !r.pallet_id) m.push('pallet')
  if (!r.company && !r.company_id) m.push('company')
  if (!(r.product && String(r.product).trim())) m.push('product')
  if (!(Number(String(r.quantity ?? '').replace(',', '.')) > 0)) m.push('quantity')
  if (!r.unit) m.push('unit')
  return m
}

// ------------------------------------------------------------- Sesle düzeltme
// "miktar 50 olsun", "düzelt firma B", "birim koli olacak", "ürün makarna olsun", "palet 3 olsun"
const FIELD_WORD = [
  [/^paleti?$|^palet numarası$/, 'pallet'],
  [/^(firma|firmayı|firması|şirket|şirketi)$/, 'company'],
  [/^(ürün|ürünü|urun|urunu|ürün adı|ürün adını)$/, 'product'],
  [/^(miktar|miktarı|miktarını|adet sayısı|sayı|sayısı)$/, 'quantity'],
  [/^(birim|birimi|birimini)$/, 'unit'],
]
export function parseCorrection(text, companies = []) {
  let s = trLower(text).replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim()
  const pre = s.match(/^(düzelt|değiştir|hayır|yanlış)\s+/)
  if (pre) s = s.slice(pre[0].length)
  const suf = s.match(/\s+(olsun|olacak|yap|yapın|olarak düzelt|olarak değiştir|düzelt)$/)
  if (suf) s = s.slice(0, s.length - suf[0].length)
  if (!pre && !suf) return null
  for (const [re, field] of FIELD_WORD) {
    const words = s.split(' ')
    for (const n of [2, 1]) {
      const head = words.slice(0, n).join(' ')
      if (!re.test(head)) continue
      const rest = words.slice(n).join(' ')
      if (!rest) return null
      const v = correctionValue(field, rest, companies)
      return v ? { field, ...v } : null
    }
  }
  return null
}
function correctionValue(field, rest, companies) {
  const t = tokenize(rest)
  if (field === 'pallet') { const n = t.find(x => x.type === 'num'); return n ? { value: n.v } : null }
  if (field === 'quantity') {
    const n = t.find(x => x.type === 'num'); if (!n) return null
    const u = t.find(x => x.type === 'unit')
    return { value: n.v, unit: u?.v }
  }
  if (field === 'unit') { const u = t.find(x => x.type === 'unit'); return u ? { value: u.v } : null }
  if (field === 'company') {
    const cm = findCompany(t, companies, { at: 0, loose: true })
    if (!cm || cm.ambiguous) return null
    return { value: cm.company, heard: rest }
  }
  if (field === 'product') {
    const w = t.filter(x => x.type === 'word' && !STOP.has(x.w)).map(x => x.w)
    return w.length ? { value: titleCaseTr(cleanProductWords(w).join(' ')) } : null
  }
  return null
}

/** Konuşma yeni bir kayda mı başlıyor? (Sıralı düzende palet ilk söylenir.) */
export function startsWithPallet(text) {
  const t = tokenize(text).filter(x => !isFiller(x))
  return t[0]?.type === 'palet' || (t[0]?.type === 'num' && t[1]?.type === 'palet') ||
    (t[0]?.type === 'word' && ['son', 'yeni'].includes(t[0].w) && t[1]?.type === 'palet')
}

export const UNIT_WORDS = UNITS
export { normProduct }
