// Smoke COMPLETO do módulo Pacientes (autônomo): bootstrap de empresa+usuário
// temporário (via service role) → exercita CRUD + timeline + tags + anexos +
// arquivar/restaurar + verifica AuditLog + isolamento. Limpa tudo no fim.
// Uso: BASE_URL=http://localhost:3997 node --env-file=.env scripts/patients-smoke.mjs
globalThis.WebSocket = globalThis.WebSocket || class { close() {} }
import { createServerClient } from '@supabase/ssr'
import { PrismaClient } from '@prisma/client'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const BASE = process.env.BASE_URL || 'http://localhost:3997'
if (!SERVICE) { console.error('Requer SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const ok = (m) => console.log('  ✅', m)
const fail = (m) => { console.error('  ❌', m); process.exitCode = 1 }
const prisma = new PrismaClient()
const EMAIL = 'pac.smoke@example.com'
const PASS = 'PacSmoke123!'

function makeClient() {
  const jar = new Map()
  const sb = createServerClient(URL, ANON, { cookies: { getAll: () => Array.from(jar, ([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } })
  const ch = () => Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
  const req = async (method, path, body, isForm) => {
    const headers = { Cookie: ch() }
    let payload
    if (isForm) { payload = body }
    else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
    const res = await fetch(BASE + path, { method, headers, body: payload })
    let json = null; try { json = await res.json() } catch {}
    return { status: res.status, json }
  }
  return { sb, req }
}

async function main() {
  // ---- bootstrap empresa + super-admin temporário ----
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })
  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const old = list.data?.users?.find((u) => u.email?.toLowerCase() === EMAIL)
  if (old) await admin.auth.admin.deleteUser(old.id).catch(() => {})
  await prisma.user.deleteMany({ where: { email: EMAIL } }).catch(() => {})
  const created = await admin.auth.admin.createUser({ email: EMAIL, password: PASS, email_confirm: true })
  const uid = created.data.user.id
  const company = await prisma.company.create({ data: { name: 'Pacientes Smoke (temp)', status: 'ACTIVE' } })
  await prisma.user.create({ data: { id: uid, email: EMAIL, name: 'Pac Smoke', role: 'SUPER_ADMIN', companyId: company.id } })
  const companyId = company.id
  console.log('\n== BOOTSTRAP =='); ok(`empresa+usuário temp (${companyId})`)

  const teardown = async () => {
    await prisma.patientAttachment.deleteMany({ where: { patient: { companyId } } }).catch(() => {})
    await prisma.patient.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.tag.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.auditLog.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.user.deleteMany({ where: { id: uid } }).catch(() => {})
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {})
    await admin.auth.admin.deleteUser(uid).catch(() => {})
    await prisma.$disconnect()
  }

  try {
    const c = makeClient()
    const login = await c.sb.auth.signInWithPassword({ email: EMAIL, password: PASS })
    if (login.error) throw new Error('login: ' + login.error.message)
    ok('login')

    console.log('\n== CRIAR (com novos campos) ==')
    const cpf = '123.456.' + String(Math.floor(100 + Math.random() * 899)) + '-00'
    const create = await c.req('POST', '/api/patients', {
      name: 'Paciente Smoke', cpf, birthDate: '1990-05-10', gender: 'MALE',
      phone: '(11) 99999-0000', email: 'paciente.smoke@example.com', origin: 'OTHER',
      address: 'Rua Teste, 100', city: 'São Paulo', state: 'SP', zipCode: '01000-000',
      insurance: 'Amil', insuranceNumber: '99887766', notes: 'Observação inicial',
    })
    if (create.status !== 201) throw new Error('criar: ' + create.status + ' ' + JSON.stringify(create.json))
    const pid = create.json.id
    ok(`paciente criado (${pid})`)

    console.log('\n== LISTAR / VISUALIZAR ==')
    const listP = await c.req('GET', '/api/patients?limit=100')
    listP.json?.patients?.some((p) => p.id === pid) ? ok('aparece na lista') : fail('não apareceu na lista')
    const get = await c.req('GET', `/api/patients/${pid}`)
    get.status === 200 && get.json.city === 'São Paulo' && get.json.insurance === 'Amil'
      ? ok('GET [id] traz dados completos (endereço/convênio)') : fail('GET [id] sem novos campos: ' + JSON.stringify(get.json))

    console.log('\n== EDITAR ==')
    const upd = await c.req('PUT', `/api/patients/${pid}`, { phone: '(11) 98888-7777', notes: 'Observação editada' })
    upd.status === 200 && upd.json.phone === '(11) 98888-7777' ? ok('editado') : fail('editar: ' + JSON.stringify(upd.json))

    console.log('\n== TIMELINE ==')
    const tlGet = await c.req('GET', `/api/patients/${pid}/timeline`)
    Array.isArray(tlGet.json) && tlGet.json.length >= 2 ? ok(`timeline tem eventos (${tlGet.json.length}: criado+editado)`) : fail('timeline vazia: ' + JSON.stringify(tlGet.json))
    const note = await c.req('POST', `/api/patients/${pid}/timeline`, { content: 'Ligação de retorno', type: 'PHONE_CALL' })
    note.status === 201 ? ok('anotação manual criada') : fail('criar nota: ' + note.status)

    console.log('\n== TAGS ==')
    const addTag = await c.req('POST', `/api/patients/${pid}/tags`, { name: 'VIP' })
    addTag.status === 201 ? ok('tag VIP atribuída') : fail('add tag: ' + JSON.stringify(addTag.json))
    const tagsGet = await c.req('GET', `/api/patients/${pid}/tags`)
    const tagId = tagsGet.json?.[0]?.id
    tagsGet.json?.some((t) => t.name === 'VIP') ? ok('tag aparece') : fail('tag não apareceu')
    const delTag = await c.req('DELETE', `/api/patients/${pid}/tags/${tagId}`)
    delTag.status === 200 ? ok('tag removida') : fail('del tag: ' + delTag.status)

    console.log('\n== ANEXOS (Supabase Storage) ==')
    const fd = new FormData()
    fd.append('file', new Blob(['conteudo de teste do anexo'], { type: 'text/plain' }), 'teste.txt')
    const up = await c.req('POST', `/api/patients/${pid}/attachments`, fd, true)
    if (up.status === 201) {
      ok('upload OK (' + (up.json.url ? 'com signed URL' : 'sem URL') + ')')
      const attGet = await c.req('GET', `/api/patients/${pid}/attachments`)
      const attId = attGet.json?.[0]?.id
      attGet.json?.length >= 1 ? ok('anexo listado') : fail('anexo não listado')
      const delAtt = await c.req('DELETE', `/api/patients/${pid}/attachments/${attId}`)
      delAtt.status === 200 ? ok('anexo removido') : fail('del anexo: ' + delAtt.status)
    } else {
      fail('upload anexo: ' + up.status + ' ' + JSON.stringify(up.json))
    }

    console.log('\n== ARQUIVAR / RESTAURAR ==')
    const arch = await c.req('DELETE', `/api/patients/${pid}`)
    arch.status === 200 ? ok('arquivado (soft delete)') : fail('arquivar: ' + arch.status)
    const activeList = await c.req('GET', '/api/patients?limit=100')
    !activeList.json?.patients?.some((p) => p.id === pid) ? ok('sumiu da lista de ativos') : fail('ainda em ativos')
    const archList = await c.req('GET', '/api/patients?limit=100&archived=true')
    archList.json?.patients?.some((p) => p.id === pid) ? ok('aparece em arquivados') : fail('não aparece em arquivados')
    const restore = await c.req('POST', `/api/patients/${pid}/restore`)
    restore.status === 200 && restore.json.status === 'ACTIVE' ? ok('restaurado (ACTIVE)') : fail('restaurar: ' + JSON.stringify(restore.json))

    console.log('\n== AUDITORIA (AuditLog) ==')
    const audits = await prisma.auditLog.findMany({ where: { companyId, entityId: pid }, select: { action: true } })
    const actions = new Set(audits.map((a) => a.action))
    const want = ['CREATE', 'UPDATE', 'ADD_TAG', 'REMOVE_TAG', 'UPLOAD_ATTACHMENT', 'DELETE_ATTACHMENT', 'ARCHIVE', 'RESTORE']
    const missing = want.filter((w) => !actions.has(w))
    missing.length === 0 ? ok(`auditoria registrou todas as ações (${want.length})`) : fail('faltam ações na auditoria: ' + missing.join(','))

    console.log('\n== ISOLAMENTO (multiempresa) ==')
    // paciente de OUTRA empresa não deve ser acessível
    const other = await prisma.company.findFirst({ where: { id: { not: companyId }, deletedAt: null } })
    if (other) {
      const otherPat = await prisma.patient.findFirst({ where: { companyId: other.id, deletedAt: null } })
      if (otherPat) {
        const cross = await c.req('GET', `/api/patients/${otherPat.id}`)
        cross.status === 404 ? ok('paciente de outra empresa → 404 (isolado)') : fail('VAZAMENTO: status ' + cross.status)
      } else { console.log('  ⚠️  outra empresa sem pacientes para testar isolamento') }
    } else { console.log('  ⚠️  só existe a empresa temp; isolamento não testável agora') }

  } finally {
    console.log('\n== CLEANUP ==')
    await teardown()
    ok('temp removido')
  }

  console.log(process.exitCode ? '\n⚠️  Patients smoke com falhas.' : '\n🎉 Patients smoke: CRUD + timeline + tags + anexos + arquivar/restaurar + auditoria + isolamento OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
