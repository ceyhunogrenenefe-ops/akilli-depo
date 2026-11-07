import { describe, it, expect } from 'vitest'
import { analyze, parseOrdered, parseCorrection, missingFields, startsWithPallet, canonicalProduct } from './voice.js'

const companies = [
  { id: 'a', code: 'A', name: 'A Firması' },
  { id: 'b', code: 'B', name: 'B Firması' },
  { id: 'c', code: 'C', name: 'C Firması' },
  { id: 'y', code: null, name: 'Yılmaz Gıda' },
  { id: 'd', code: null, name: 'Demirtaş Ticaret' },
]
const products = ['Domates Salçası', 'Makarna', 'Ayçiçek Yağı', 'Beyaz Peynir']
const one = (t, extra = {}) => analyze(t, { companies, products, ...extra })[0]
const flat = r => ({ pallet: r.pallet, company: r.company?.id ?? null, product: r.product, quantity: r.quantity, unit: r.unit })

describe('sıralı sesli giriş: Palet → Firma → Ürün → Miktar → Birim', () => {
  const ok = { pallet: 1, company: 'a', product: 'Domates Salçası', quantity: 40, unit: 'adet' }
  it('virgüllü örnek', () => expect(flat(one('Palet 1, A firması, domates salçası, 40, adet.'))).toEqual(ok))
  it('virgülsüz (telefonun yazdığı gibi)', () => expect(flat(one('palet 1 A firması domates salçası 40 adet'))).toEqual(ok))
  it('yazıyla sayılar', () => expect(flat(one('palet bir a firması domates salçası kırk adet'))).toEqual(ok))
  it('yapışık "1A"', () => expect(flat(one('Palet 1A firması domates salçası 40 adet'))).toEqual(ok))
  it('firma kelimesi olmadan kod', () => expect(flat(one('palet 1 A domates salçası 40 adet'))).toEqual(ok))
  it('firma tam adıyla', () => expect(flat(one('palet 2 Yılmaz Gıda beyaz peynir 30 kilo'))).toEqual({ pallet: 2, company: 'y', product: 'Beyaz Peynir', quantity: 30, unit: 'kg' }))
  it('iki kelimelik ürün ve birim', () => expect(flat(one('palet 3 B firması ayçiçek yağı 12 koli'))).toEqual({ pallet: 3, company: 'b', product: 'Ayçiçek Yağı', quantity: 12, unit: 'koli' }))
  it('birinci palet', () => expect(one('birinci palet C firması makarna 25 koli').pallet).toBe(1))
  it('ürün adında sayı/firma karışmaz', () => {
    const r = one('palet 4 A firması makarna 15 paket')
    expect(r.product).toBe('Makarna'); expect(r.company.id).toBe('a'); expect(r.pallet).toBe(4)
  })
  it('sıralı mod kullanıldı', () => expect(one('palet 1 A firması domates salçası 40 adet').mode).toBe('sirali'))
})

describe('karışık sıra', () => {
  it('A firmasına ait 40 adet domates salçasını birinci palete ekle', () => {
    expect(flat(one('A firmasına ait 40 adet domates salçasını birinci palete ekle.'))).toEqual({ pallet: 1, company: 'a', product: 'Domates Salçası', quantity: 40, unit: 'adet' })
  })
  it('İkinci palete B firmasından 25 koli makarna ekle', () => {
    expect(flat(one('İkinci palete B firmasından 25 koli makarna ekle'))).toEqual({ pallet: 2, company: 'b', product: 'Makarna', quantity: 25, unit: 'koli' })
  })
})

describe('tahmin etmez: eksik/belirsiz bilgi', () => {
  it('birim söylenmezse birim eksik (adet varsayılmaz)', () => {
    const r = one('palet 1 A firması domates salçası 40')
    expect(r.unit).toBeNull(); expect(missingFields(r)).toEqual(['unit'])
  })
  it('firma söylenmezse firma eksik', () => expect(missingFields(one('palet 1 domates salçası 40 adet'))).toEqual(['company']))
  it('palet söylenmezse palet eksik', () => expect(missingFields(one('A firması domates salçası 40 adet'))).toEqual(['pallet']))
  it('miktar yoksa', () => expect(missingFields(one('palet 1 A firması domates salçası adet'))).toEqual(['quantity']))
  it('kayıtlı olmayan firma', () => {
    const r = one('palet 1 Kaya firması zeytin 10 koli')
    expect(r.company).toBeNull(); expect(r.companyHeard).toBe('Kaya'); expect(r.product).toBe('Zeytin')
  })
  it('iki firmaya eşit benzeyen ad belirsiz kalır', () => {
    const cs = [{ id: 'k1', name: 'Kaya Gıda' }, { id: 'k2', name: 'Kaye Gıda' }]
    const r = analyze('palet 1 kayo gıda peynir 3 koli', { companies: cs })[0]
    expect(r.company).toBeNull(); expect(r.companyAmbiguous).toHaveLength(2)
  })
})

describe('kayıtlı ürün adlarını tanır', () => {
  it('küçük telaffuz farkı → kayıtlı ad', () => expect(one('palet 1 A firması domatez salçası 40 adet').product).toBe('Domates Salçası'))
  it('öğrenilmiş düzeltme önceliklidir', () => {
    expect(one('palet 1 A firması salça 40 adet', { productAliases: { salca: 'Domates Salçası' } }).product).toBe('Domates Salçası')
  })
  it('benzemeyen ad olduğu gibi kalır', () => expect(canonicalProduct('Zeytin', products).product).toBe('Zeytin'))
})

describe('sesle düzeltme', () => {
  it('miktar 50 olsun', () => expect(parseCorrection('miktar 50 olsun', companies)).toMatchObject({ field: 'quantity', value: 50 }))
  it('düzelt firma B', () => expect(parseCorrection('düzelt firma B', companies).value.id).toBe('b'))
  it('firma yılmaz gıda olsun', () => expect(parseCorrection('firma yılmaz gıda olsun', companies).value.id).toBe('y'))
  it('birim koli olacak', () => expect(parseCorrection('birim koli olacak', companies)).toMatchObject({ field: 'unit', value: 'koli' }))
  it('palet 3 olsun', () => expect(parseCorrection('palet 3 olsun', companies)).toMatchObject({ field: 'pallet', value: 3 }))
  it('ürün makarna olsun', () => expect(parseCorrection('ürün makarna olsun', companies)).toMatchObject({ field: 'product', value: 'Makarna' }))
  it('miktar 30 koli olsun → birim de', () => expect(parseCorrection('miktar 30 koli olsun', companies)).toMatchObject({ value: 30, unit: 'koli' }))
  it('normal komut düzeltme sayılmaz', () => expect(parseCorrection('palet 1 A firması makarna 10 koli', companies)).toBeNull())
})

describe('yeni kayıt başlangıcı', () => {
  it('palet ile başlayan', () => expect(startsWithPallet('palet 2 B firması')).toBe(true))
  it('ikinci palet', () => expect(startsWithPallet('ikinci palet')).toBe(true))
  it('miktar ile başlayan değil', () => expect(startsWithPallet('40 adet')).toBe(false))
})
