// Türkçe sesli komut çözümleyici
// "Birinci palete A firması için domates salçası 40 adet ekle"
//   → { pallet: 1, company: A Firması, product: "Domates Salçası", quantity: 40, unit: "adet" }

export function trLower(s = '') {
  return String(s).replace(/I/g, 'ı').replace(/İ/g, 'i').toLowerCase()
}
export function trUpperFirst(w) {
  if (!w) return w
  const f = w[0] === 'i' ? 'İ' : w[0] === 'ı' ? 'I' : w[0].toUpperCase()
  return f + w.slice(1)
}
export function titleCaseTr(s) {
  return trLower(s).split(/\s+/).filter(Boolean).map(trUpperFirst).join(' ')
}

const CARDINAL = {
  sıfır: 0, bir: 1, iki: 2, üç: 3, dört: 4, beş: 5, altı: 6, yedi: 7, sekiz: 8, dokuz: 9,
  on: 10, yirmi: 20, otuz: 30, kırk: 40, elli: 50, altmış: 60, yetmiş: 70, seksen: 80, doksan: 90,
  yüz: 100, bin: 1000,
}
const ORDINAL = {
  birinci: 1, ikinci: 2, üçüncü: 3, dördüncü: 4, beşinci: 5, altıncı: 6, yedinci: 7, sekizinci: 8,
  dokuzuncu: 9, onuncu: 10, yirminci: 20, otuzuncu: 30, kırkıncı: 40, ellinci: 50, altmışıncı: 60,
  yetmişinci: 70, sekseninci: 80, doksanıncı: 90, yüzüncü: 100, bininci: 1000,
}
// "palet bire", "ikiye", "dörde" gibi yönelme ekli sayılar
function cardinalWithSuffix(tok) {
  if (tok in CARDINAL) return CARDINAL[tok]
  const m = tok.match(/^(.+?)(?:y?[ea]|y?[ıiuü]|n?[ıiuü]n)$/)
  if (m) {
    let stem = m[1]
    if (stem in CARDINAL) return CARDINAL[stem]
    if (stem.endsWith('d') && (stem.slice(0, -1) + 't') in CARDINAL) return CARDINAL[stem.slice(0, -1) + 't']
  }
  return undefined
}

export const UNITS = {
  adet: 'adet', adt: 'adet', tane: 'adet', parça: 'adet',
  koli: 'koli', koliyi: 'koli', kolı: 'koli',
  kutu: 'kutu', paket: 'paket', kasa: 'kasa', çuval: 'çuval', torba: 'torba', poşet: 'poşet',
  şişe: 'şişe', teneke: 'teneke', bidon: 'bidon', kavanoz: 'kavanoz', sandık: 'sandık',
  balya: 'balya', rulo: 'rulo', düzine: 'düzine', bağ: 'bağ', varil: 'varil', galon: 'galon',
  kg: 'kg', kilo: 'kg', kilogram: 'kg', gram: 'gr', gr: 'gr', ton: 'ton',
  litre: 'litre', lt: 'litre', l: 'litre', metre: 'metre', m: 'metre',
}
export const UNIT_LIST = ['adet', 'koli', 'kutu', 'paket', 'kasa', 'çuval', 'torba', 'şişe', 'teneke', 'bidon', 'kavanoz', 'balya', 'rulo', 'kg', 'gr', 'ton', 'litre', 'metre']

// "A" harfinin okunuşları: be → b, ce → c ...
export const LETTER_NAMES = {
  a: 'a', be: 'b', ce: 'c', çe: 'ç', de: 'd', e: 'e', fe: 'f', ge: 'g', ğe: 'ğ', he: 'h', ha: 'h',
  ı: 'ı', i: 'i', je: 'j', ke: 'k', ka: 'k', le: 'l', me: 'm', ne: 'n', o: 'o', ö: 'ö', pe: 'p',
  re: 'r', se: 's', şe: 'ş', te: 't', u: 'u', ü: 'ü', ve: 'v', ye: 'y', ze: 'z',
}

const FIRMA_RE = /^(?:firma|şirket|sirket)[a-zçğıöşü]*$/
const PALET_RE = /^palet(?:e|i|in|ine|inde|ten|te|ler|lere|e|ye|ime|imize|imiz|im|numarası|numara|no)?$/
export const STOP = new Set([
  'ekle', 'ekleyin', 'ekler', 'misin', 'mısın', 'koy', 'koyun', 'yaz', 'yazın', 'kaydet', 'kaydedin', 'gir', 'girin',
  'lütfen', 'için', 'olarak', 'ile', 'de', 'da', 'ürün', 'ürünü', 'şunu', 'bunu', 'şimdi', 'tamam', 'ait', 'olan', 'bir', 've',
  'numaralı', 'numara', 'numarası', 'no', 'nolu', 'ekleyelim', 'ekliyorum', 'eklendi', 'ayrıca', 'sonra',
])

export function tokenize(raw) {
  let s = trLower(raw)
    .replace(/[’'`´]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/(\d+)\.(?=\s|$)/g, '$1 .ORD ')
    .replace(/[,;]/g, ' , ')
    .replace(/[!?:"()]/g, ' ')
    .replace(/\.(?!\d|ORD)/g, ' ')
  const words = s.split(/\s+/).filter(Boolean)
  const out = []
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (w === '.ORD') { const p = out[out.length - 1]; if (p && p.type === 'num') p.ord = true; continue }
    if (w === ',') { out.push({ type: 'sep', w }); continue }
    // Rakamlı sayı: 40, 2.5, 3e, 1inci, 2nci
    const dm = w.match(/^(\d+(?:\.\d+)?)(inci|ıncı|uncu|üncü|nci|ncı|ncu|ncü|ıncı|nd)?([a-zçğıöşü]*)$/)
    if (dm) {
      // "40kg", "10koli" gibi birleşik
      const rest = dm[3]
      const tok = { type: 'num', v: parseFloat(dm[1]), ord: !!dm[2], w }
      out.push(tok)
      if (rest && UNITS[rest]) out.push({ type: 'unit', v: UNITS[rest], w: rest })
      else if (rest && rest.length <= 3 && (!/^(e|a|ye|ya|i|ı|u|ü|de|da|te|ta|den|dan|ten|tan|in|ın|un|ün)$/.test(rest) || FIRMA_RE.test(words[i + 1] || ''))) out.push({ type: 'word', w: rest })
      continue
    }
    // Yazıyla sayı dizisi: "kırk", "yüz yirmi beş", "on ikinci"
    if (w in ORDINAL || cardinalWithSuffix(w) !== undefined) {
      let total = 0, group = 0, ord = false, j = i, any = false
      while (j < words.length) {
        const x = words[j]
        let val, isOrd = false
        if (x in ORDINAL) { val = ORDINAL[x]; isOrd = true }
        else if (x in CARDINAL) val = CARDINAL[x]
        else if (any === false) val = cardinalWithSuffix(x)
        else { const c = cardinalWithSuffix(x); if (c !== undefined && c < 10) { val = c } }
        if (val === undefined) break
        // "bir" tek başına ve arkasından birim/sayı gelmiyorsa ürün adının parçası olabilir: yine de sayı say
        if (val === 100) group = (group || 1) * 100
        else if (val === 1000) { total += (group || 1) * 1000; group = 0 }
        else group += val
        any = true
        j++
        if (isOrd) { ord = true; break }
        if (!(x in CARDINAL)) break // ekli sayı ("ikiye") diziyi bitirir
      }
      out.push({ type: 'num', v: total + group, ord, w: words.slice(i, j).join(' ') })
      i = j - 1
      continue
    }
    if (UNITS[w]) { out.push({ type: 'unit', v: UNITS[w], w }); continue }
    if (PALET_RE.test(w)) { out.push({ type: 'palet', w }); continue }
    if (FIRMA_RE.test(w)) { out.push({ type: 'firma', w }); continue }
    const glued = w.match(/^([a-zçğıöşü]{1,2})(firma[a-zçğıöşü]*)$/)
    if (glued) { out.push({ type: 'word', w: glued[1] }, { type: 'firma', w: glued[2] }); continue }
    if (w === 've') { out.push({ type: 'sep', w }); continue }
    out.push({ type: 'word', w })
  }
  return out
}

export function lev(a, b) {
  const m = a.length, n = b.length
  if (Math.abs(m - n) > 2) return 9
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[n]
}
export const ASCII = s => s.replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
// telaffuz/yazım farkı toleransı: "yilmaz" ≈ "yılmaz", "akdeniz" ≈ "akdenis"
function fuzzyEq(w, target) {
  if (!w || w.startsWith('#') || target.length < 4) return false
  const a = ASCII(w), b = ASCII(target)
  if (a === b) return true
  return lev(a, b) <= (b.length >= 7 ? 2 : 1)
}

export function normalizeName(s) {
  return trLower(s).replace(/[^a-zçğıöşü0-9\s]/g, ' ').replace(/\b(firması|firma|ltd|şti|a\.?ş|aş|san|tic)\b/g, ' ').replace(/\s+/g, ' ').trim()
}

// Belirteç dizisinde firma adını arar (en uzun eşleşme kazanır).
// opts.at verilirse yalnızca o konumdan başlayan eşleşmeler (sıralı mod).
// Aynı puanla iki farklı firma eşleşirse sonuç "belirsiz" (ambiguous) işaretlenir.
export function findCompany(tokens, companies, opts = {}) {
  const cands = []
  const words = tokens.map(t => t.type === 'word' || t.type === 'unit' || t.type === 'num' ? trLower(t.w) : t.type === 'firma' ? '#firma' : '#')
  const add = (c, start, end, score) => cands.push({ company: c, start, end, score })
  for (const c of companies) {
    const keys = new Set()
    const n = normalizeName(c.name)
    if (n) keys.add(n)
    for (const a of c.aliases || []) { const na = normalizeName(a); if (na) keys.add(na) }
    for (const k of keys) {
      const kw = k.split(' ')
      for (let i = 0; i + kw.length <= words.length; i++) {
        let ok = true, fuzzy = false
        for (let j = 0; j < kw.length; j++) {
          const w = words[i + j]
          const target = kw[j]
          if (w === target || (j === kw.length - 1 && w.startsWith(target) && w.length - target.length <= 4)) continue
          if (fuzzyEq(w, target)) { fuzzy = true; continue }
          ok = false; break
        }
        if (!ok) continue
        if (k.length <= 2 && words[i + kw.length] !== '#firma') continue
        let end = i + kw.length
        if (words[end] === '#firma') end++
        add(c, i, end, k.length - (fuzzy ? 0.5 : 0))
      }
    }
    if (c.code) {
      const code = trLower(c.code)
      const isCode = w => w === code || LETTER_NAMES[w] === code || w === code + 'dan' || w === code + 'den' || w === code + 'ya' || w === code + 'ye'
      for (let i = 0; i < words.length; i++) {
        if (words[i + 1] === '#firma' && isCode(words[i])) add(c, i, i + 2, 0.5)
        else if (words[i] === '#firma' && words[i + 1] && isCode(words[i + 1])) add(c, i, i + 2, 0.5)
        else if (words[i + 1] === 'için' && isCode(words[i]) && code.length <= 3) add(c, i, i + 2, 0.4)
        else if (opts.at === i && isCode(words[i]) && code.length <= 2 && (words[i + 1] === '#' || words[i + 1] === undefined || opts.loose)) add(c, i, i + 1, 0.3)
      }
    }
  }
  let list = opts.at != null ? cands.filter(x => x.start === opts.at) : cands
  if (!list.length) return null
  list.sort((a, b) => b.score - a.score || (b.end - b.start) - (a.end - a.start))
  const best = list[0]
  const rival = list.find(x => x.company.id !== best.company.id && x.score === best.score && x.start === best.start)
  return rival ? { ...best, ambiguous: [best.company, rival.company] } : best
}

export function cleanProductWords(words) {
  if (!words.length) return words
  const w = [...words]
  const last = w[w.length - 1]
  let m
  if ((m = last.match(/^(.+[ıiuü])(nı|ni|nu|nü)$/)) && /s[ıiuü]$/.test(m[1])) w[w.length - 1] = m[1]
  else if ((m = last.match(/^(.+[aeıioöuü])(yı|yi|yu|yü)$/)) && m[1].length >= 3) w[w.length - 1] = m[1]
  return w
}

function parseSegment(tokens, companies) {
  const used = new Array(tokens.length).fill(false)
  const res = { pallet: null, palletRef: null, company: null, companyHeard: null, quantity: null, unit: null, unitExplicit: false, product: '' }

  // 1) Palet
  for (let i = 0; i < tokens.length && res.pallet == null && !res.palletRef; i++) {
    const t = tokens[i]
    if (t.type !== 'palet') continue
    const prev = tokens[i - 1], next = tokens[i + 1], next2 = tokens[i + 2]
    if (prev && prev.type === 'num') { res.pallet = prev.v; used[i - 1] = used[i] = true; break }
    if (prev && prev.type === 'word' && ['son', 'sonuncu'].includes(prev.w)) { res.palletRef = 'last'; used[i - 1] = used[i] = true; break }
    if (prev && prev.type === 'word' && ['yeni'].includes(prev.w)) { res.palletRef = 'new'; used[i - 1] = used[i] = true; break }
    if (prev && prev.type === 'word' && ['bu', 'aynı', 'açık', 'aktif'].includes(prev.w)) { res.palletRef = 'current'; used[i - 1] = used[i] = true; break }
    if (next && next.type === 'num') { res.pallet = next.v; used[i] = used[i + 1] = true; break }
    if (next && next.type === 'word' && /^numara/.test(next.w) && next2 && next2.type === 'num') { res.pallet = next2.v; used[i] = used[i + 1] = used[i + 2] = true; break }
    used[i] = true
  }

  // 2) Firma
  const cm = findCompany(tokens, companies)
  if (cm && cm.ambiguous) {
    res.companyAmbiguous = cm.ambiguous
    for (let i = cm.start; i < cm.end; i++) used[i] = true
  } else if (cm) {
    res.company = cm.company
    res.companyRaw = tokens.slice(cm.start, cm.end).map(t => t.w).join(' ')
    for (let i = cm.start; i < cm.end; i++) used[i] = true
  } else {
    // "xyz firması" denmiş ama tanınmamış
    const fi = tokens.findIndex(t => t.type === 'firma')
    if (fi > 0) {
      let s = fi - 1
      const parts = []
      while (s >= 0 && tokens[s].type === 'word' && !STOP.has(tokens[s].w) && parts.length < 3) { parts.unshift(tokens[s].w); s-- }
      if (parts.length) {
        res.companyHeard = titleCaseTr(parts.map(p => LETTER_NAMES[p] && p.length <= 2 ? LETTER_NAMES[p] : p).join(' '))
        for (let k = s + 1; k <= fi; k++) used[k] = true
      } else used[fi] = true
    }
  }

  // 3) Miktar + birim
  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue
    const t = tokens[i]
    if (t.type === 'num' && !t.ord) {
      const next = tokens[i + 1]
      if (next && next.type === 'unit') { res.quantity = t.v; res.unit = next.v; res.unitExplicit = true; used[i] = used[i + 1] = true; break }
      // "domates salçası kırk" → birim yok
      if (res.quantity == null) { res.quantity = t.v; res.unit = 'adet'; used[i] = true; /* aramaya devam: birimli eşleşme öncelikli */ }
    }
  }
  if (res.quantity != null && !res.unitExplicit) {
    // birimli bir sayı daha varsa onu tercih et
    for (let i = 0; i < tokens.length - 1; i++) {
      if (tokens[i].type === 'num' && !tokens[i].ord && tokens[i + 1].type === 'unit' && !used[i + 1]) {
        res.quantity = tokens[i].v; res.unit = tokens[i + 1].v; res.unitExplicit = true; used[i + 1] = used[i] = true; break
      }
    }
  }

  // 4) Ürün adı = kalan kelimeler
  const productWords = []
  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue
    const t = tokens[i]
    if (t.type === 'word' && !STOP.has(t.w)) productWords.push(t.w)
    else if (t.type === 'unit' && !res.unitExplicit) productWords.push(t.w)
  }
  res.product = titleCaseTr(cleanProductWords(productWords).join(' '))
  return res
}

/**
 * @param {string} text  konuşmadan gelen metin
 * @param {Array<{id,name,code}>} companies
 * @returns {{ items: Array, confident: boolean, text: string }}
 */
export function parseCommand(text, companies = []) {
  const tokens = tokenize(text)
  // ayırıcılara göre böl
  let segs = [[]]
  for (const t of tokens) {
    if (t.type === 'sep') { if (segs[segs.length - 1].length) segs.push([]) }
    else segs[segs.length - 1].push(t)
  }
  segs = segs.filter(s => s.length)
  const hasQty = seg => seg.some(t => t.type === 'num' && !t.ord && !isPalletNum(seg, t))
  // miktarı olmayan parçaları komşusuyla birleştir
  const merged = []
  let carry = []
  for (let i = 0; i < segs.length; i++) {
    const seg = [...carry, ...segs[i]]
    carry = []
    if (hasQty(seg) || i === segs.length - 1) merged.push(seg)
    else carry = seg
  }
  // son parçada miktar yoksa ve önceki varsa: ürün adının devamıdır ("tuz ve baharat")
  if (merged.length > 1 && !hasQty(merged[merged.length - 1])) {
    const last = merged.pop()
    const onlyWords = last.every(t => t.type === 'word')
    if (onlyWords) merged[merged.length - 1].push({ type: 'word', w: '&' }, ...last)
    else merged.push(last)
  }

  const parsed = merged.map(seg => parseSegment(seg, companies))
  // eksik palet/firmayı önceki (yoksa sonraki) parçadan tamamla
  const firstPal = parsed.find(p => p.pallet != null || p.palletRef)
  const firstCo = parsed.find(p => p.company)
  let lastPal = null, lastCo = null
  for (const p of parsed) {
    if (p.pallet != null || p.palletRef) lastPal = p
    else if (lastPal || firstPal) { const src = lastPal || firstPal; p.pallet = src.pallet; p.palletRef = src.palletRef; p.palletInherited = true }
    if (p.company) lastCo = p
    else if (!p.companyHeard && !p.companyAmbiguous && (lastCo || firstCo)) { p.company = (lastCo || firstCo).company; p.companyInherited = true }
  }

  const items = parsed
    .filter(p => p.product || p.quantity != null)
    .map(p => {
      const issues = []
      if (p.pallet == null && !p.palletRef) issues.push('palet')
      if (!p.company) issues.push(p.companyAmbiguous ? 'firma_belirsiz' : p.companyHeard ? 'firma_bilinmiyor' : 'firma')
      if (!p.product) issues.push('urun')
      if (p.quantity == null) issues.push('miktar')
      else if (!p.unitExplicit) issues.push('birim')
      return {
        pallet: p.pallet,
        palletRef: p.palletRef,
        companyId: p.company?.id ?? null,
        companyName: p.company?.name ?? p.companyHeard ?? null,
        companyHeard: p.companyHeard,
        companyRaw: p.companyRaw || null,
        companyAmbiguous: p.companyAmbiguous || null,
        unitExplicit: p.unitExplicit,
        product: p.product.replace(/ &(?= )/g, ' ve'),
        quantity: p.quantity,
        unit: p.unit || 'adet',
        issues,
      }
    })
  return { text, items, confident: items.length > 0 && items.every(i => i.issues.length === 0) }

  function isPalletNum(seg, t) {
    const i = seg.indexOf(t)
    return (seg[i + 1] && seg[i + 1].type === 'palet') || (seg[i - 1] && seg[i - 1].type === 'palet') ||
      (seg[i - 1] && seg[i - 1].type === 'word' && /^numara/.test(seg[i - 1].w) && seg[i - 2]?.type === 'palet')
  }
}

export const ISSUE_TEXT = {
  palet: 'Palet numarası anlaşılamadı',
  firma: 'Firma anlaşılamadı',
  firma_bilinmiyor: 'Bu firma kayıtlı değil',
  firma_belirsiz: 'Birden fazla firmaya benziyor',
  urun: 'Ürün adı anlaşılamadı',
  miktar: 'Miktar anlaşılamadı',
  birim: 'Birim söylenmedi, "adet" varsayıldı',
}

export function fmtQty(n) {
  const x = Number(n)
  return Number.isInteger(x) ? String(x) : x.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
}
