// POST /api/users  { email, password, full_name, role, company_id }  — yalnızca yönetici
import { admin, requireRole, handler, httpError } from './_lib/server.js'

export default handler(async (req, body) => {
  const sb = admin()
  await requireRole(req, sb, ['admin'])
  const { email, password, full_name, role = 'personel', company_id = null } = body
  if (!email || !password) throw httpError(400, 'E-posta ve şifre gerekli')
  if (!['admin', 'personel', 'depo', 'firma'].includes(role)) throw httpError(400, 'Geçersiz rol')
  if (role === 'firma' && !company_id) throw httpError(400, 'Firma yetkilisi için firma seçin')

  const { data, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name, role } })
  if (error) throw httpError(400, /already/i.test(error.message) ? 'Bu e-posta ile kayıtlı kullanıcı var' : error.message)
  const { error: e2 } = await sb.from('profiles').upsert({ id: data.user.id, email, full_name, role, company_id: role === 'firma' ? company_id : null })
  if (e2) throw httpError(500, e2.message)
  return { id: data.user.id }
})
