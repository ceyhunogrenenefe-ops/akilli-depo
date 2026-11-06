// Telefon numarasını WhatsApp için uluslararası biçime çevirir: "0532 111 22 33" → "905321112233"
export function normalizePhone(p, defaultCountry = '90') {
  if (!p) return ''
  let d = String(p).replace(/[^\d+]/g, '')
  if (d.startsWith('+')) return d.slice(1)
  if (d.startsWith('00')) return d.slice(2)
  if (d.startsWith('0')) return defaultCountry + d.slice(1)
  if (d.length === 10 && d.startsWith('5')) return defaultCountry + d
  return d
}

export const KIND = {
  firma: 'Firma yetkilisi',
  depo: 'Depo sorumlusu (Hollanda)',
  yonetici: 'Yönetici (ben)',
  personel: 'Yetkili personel',
}

/** Alıcının göreceği ürün kapsamı: firma yetkilisi yalnızca kendi firmasını görür */
export function scopeFor(recipient) {
  return recipient.kind === 'firma' ? recipient.company_id : null
}
