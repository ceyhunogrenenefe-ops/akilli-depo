import { describe, it, expect } from 'vitest'
import { parseCommand } from './parser.js'

const companies = [
  { id: 'a', code: 'A', name: 'A Firması' },
  { id: 'b', code: 'B', name: 'B Firması' },
  { id: 'c', code: 'C', name: 'C Firması' },
  { id: 'y', code: 'Y', name: 'Yılmaz Gıda' },
]
const one = (t) => parseCommand(t, companies).items[0]

describe('sesli komut', () => {
  it('örnek 1: birinci palete A firması için domates salçası 40 adet ekle', () => {
    const r = parseCommand('Birinci palete A firması için domates salçası 40 adet ekle.', companies)
    expect(r.confident).toBe(true)
    expect(r.items[0]).toMatchObject({ pallet: 1, companyId: 'a', product: 'Domates Salçası', quantity: 40, unit: 'adet' })
  })
  it('örnek 2: ikinci palete B firmasından 25 koli makarna ekle', () => {
    expect(one('İkinci palete B firmasından 25 koli makarna ekle.')).toMatchObject({ pallet: 2, companyId: 'b', product: 'Makarna', quantity: 25, unit: 'koli', issues: [] })
  })
  it('rakamlı sıra: 3. palete', () => {
    expect(one('3. palete C firması için 12 kasa ayran')).toMatchObject({ pallet: 3, companyId: 'c', product: 'Ayran', quantity: 12, unit: 'kasa' })
  })
  it('palet sonra numara: palet 5 e', () => {
    expect(one("palet 5'e A firması 10 paket çay")).toMatchObject({ pallet: 5, companyId: 'a', product: 'Çay', quantity: 10, unit: 'paket' })
  })
  it('yazıyla sayı: kırk adet', () => {
    expect(one('birinci palete a firması için domates salçası kırk adet ekle')).toMatchObject({ pallet: 1, quantity: 40, unit: 'adet', product: 'Domates Salçası' })
  })
  it('bileşik sayı: yüz yirmi beş koli', () => {
    expect(one('dördüncü palete be firmasından yüz yirmi beş koli makarna')).toMatchObject({ pallet: 4, companyId: 'b', quantity: 125, unit: 'koli' })
  })
  it('bileşik sıra sayısı: on ikinci palet', () => {
    expect(one('on ikinci palete ce firması için 5 çuval un')).toMatchObject({ pallet: 12, companyId: 'c', product: 'Un', quantity: 5, unit: 'çuval' })
  })
  it('palet bire', () => {
    expect(one('palet bire A firması 3 koli zeytin')).toMatchObject({ pallet: 1, quantity: 3, unit: 'koli', product: 'Zeytin' })
  })
  it('isimle firma', () => {
    expect(one('2. palete Yılmaz Gıda için 30 kg peynir')).toMatchObject({ pallet: 2, companyId: 'y', product: 'Peynir', quantity: 30, unit: 'kg' })
  })
  it('isimle firma, ekli', () => {
    expect(one('2. palete yılmaz gıdadan 30 kg peynir')).toMatchObject({ companyId: 'y', product: 'Peynir' })
  })
  it('ondalık miktar', () => {
    expect(one('1. palete A firması 2,5 ton şeker')).toMatchObject({ quantity: 2.5, unit: 'ton', product: 'Şeker' })
  })
  it('birim yoksa adet + uyarı', () => {
    const it1 = one('birinci palete A firması için domates salçası 40')
    expect(it1).toMatchObject({ quantity: 40, unit: 'adet' })
    expect(it1.issues).toContain('birim')
  })
  it('firma eksikse onay ister', () => {
    const r = parseCommand('birinci palete 40 adet salça', companies)
    expect(r.confident).toBe(false)
    expect(r.items[0].issues).toContain('firma')
  })
  it('bilinmeyen firma', () => {
    const r = parseCommand('birinci palete Demir firması için 40 adet salça', companies)
    expect(r.items[0].issues).toContain('firma_bilinmiyor')
    expect(r.items[0].companyHeard).toBe('Demir')
    expect(r.items[0].product).toBe('Salça')
  })
  it('palet eksikse onay ister', () => {
    const r = parseCommand('A firması için 40 adet salça', companies)
    expect(r.items[0].issues).toContain('palet')
  })
  it('çoklu ürün aynı cümlede', () => {
    const r = parseCommand('birinci palete A firması için 40 adet salça ve 20 koli makarna ekle', companies)
    expect(r.items).toHaveLength(2)
    expect(r.items[1]).toMatchObject({ pallet: 1, companyId: 'a', product: 'Makarna', quantity: 20, unit: 'koli' })
  })
  it('çoklu ürün farklı firma', () => {
    const r = parseCommand('üçüncü palete A firması için 10 koli çay, B firması için 5 koli şeker', companies)
    expect(r.items.map(i => [i.pallet, i.companyId, i.product, i.quantity])).toEqual([[3, 'a', 'Çay', 10], [3, 'b', 'Şeker', 5]])
  })
  it('ürün adında "ve"', () => {
    const r = parseCommand('birinci palete A firması için 10 koli tuz ve baharat', companies)
    expect(r.items).toHaveLength(1)
    expect(r.items[0].product).toBe('Tuz ve Baharat')
  })
  it('son palet', () => {
    expect(one('son palete B firması 8 kutu kibrit')).toMatchObject({ palletRef: 'last', companyId: 'b', product: 'Kibrit' })
  })
  it('miktar önce', () => {
    expect(one('Birinci palete A firması için 40 adet domates salçası')).toMatchObject({ product: 'Domates Salçası', quantity: 40 })
  })
  it('birleşik yazılmış birim', () => {
    expect(one('1. palete A firması 40kg pirinç')).toMatchObject({ quantity: 40, unit: 'kg', product: 'Pirinç' })
  })
  it('rakam + inci', () => {
    expect(one('2nci palete A firması 4 koli su')).toMatchObject({ pallet: 2, product: 'Su', quantity: 4 })
  })
  it('tane = adet', () => {
    expect(one('1. palete B firması 6 tane bidon yağ')).toMatchObject({ quantity: 6, unit: 'adet' })
  })
})
