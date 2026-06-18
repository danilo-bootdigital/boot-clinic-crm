// Smoke COMPLETO do Módulo Clínico Documental (autônomo): bootstrap de empresa +
// usuários temporários por papel (OWNER/DOCTOR/FINANCE/MARKETING) via service role
// → exercita Anamnese + Prontuário + Contratos + Orçamentos + Imagens + Documentos
// (upload no bucket clinical-media) + verifica AuditLog + RBAC por papel + isolamento.
// Limpa tudo no fim.
// Uso: BASE_URL=http://localhost:3997 node --env-file=.env scripts/clinico-smoke.mjs
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
const PASS = 'ClinSmoke123!'
const PREFIX = 'clin.smoke'

function makeClient() {
  const jar = new Map()
  const sb = createServerClient(URL, ANON, { cookies: { getAll: () => Array.from(jar, ([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } })
  const ch = () => Array.from(jar, ([n, v]) => `${n}=${encodeURIComponent(v)}`).join('; ')
  const req = async (method, path, body, isForm) => {
    const headers = { Cookie: ch() }
    let payload
    if (isForm) payload = body
    else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body) }
    const res = await fetch(BASE + path, { method, headers, body: payload })
    let json = null; try { json = await res.json() } catch {}
    return { status: res.status, json }
  }
  return { sb, req }
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')
  const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

  const company = await prisma.company.create({ data: { name: 'Clínico Smoke (temp)', status: 'ACTIVE' } })
  const companyId = company.id
  const uids = []

  // cria usuário Auth + DB com um papel; devolve cliente logado.
  async function makeUser(role) {
    const email = `${PREFIX}.${role.toLowerCase()}@example.com`
    const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const old = list.data?.users?.find((u) => u.email?.toLowerCase() === email)
    if (old) await admin.auth.admin.deleteUser(old.id).catch(() => {})
    await prisma.user.deleteMany({ where: { email } }).catch(() => {})
    const created = await admin.auth.admin.createUser({ email, password: PASS, email_confirm: true })
    const uid = created.data.user.id
    uids.push(uid)
    await prisma.user.create({ data: { id: uid, email, name: `Smoke ${role}`, role, companyId } })
    const c = makeClient()
    const login = await c.sb.auth.signInWithPassword({ email, password: PASS })
    if (login.error) throw new Error(`login ${role}: ` + login.error.message)
    return c
  }

  console.log('\n== BOOTSTRAP =='); ok(`empresa temp (${companyId})`)

  const teardown = async () => {
    const w = { companyId }
    await prisma.patientAnamnesisAnswer.deleteMany({ where: w }).catch(() => {})
    await prisma.anamnesisQuestion.deleteMany({ where: w }).catch(() => {})
    await prisma.patientAnamnesis.deleteMany({ where: w }).catch(() => {})
    await prisma.anamnesisTemplate.deleteMany({ where: w }).catch(() => {})
    await prisma.medicalRecordAttachment.deleteMany({ where: w }).catch(() => {})
    await prisma.medicalRecord.deleteMany({ where: w }).catch(() => {})
    await prisma.patientContract.deleteMany({ where: w }).catch(() => {})
    await prisma.contractTemplate.deleteMany({ where: w }).catch(() => {})
    await prisma.clinicalQuoteItem.deleteMany({ where: w }).catch(() => {})
    await prisma.clinicalQuote.deleteMany({ where: w }).catch(() => {})
    await prisma.patientImage.deleteMany({ where: w }).catch(() => {})
    await prisma.patientDocument.deleteMany({ where: w }).catch(() => {})
    await prisma.patient.deleteMany({ where: w }).catch(() => {})
    await prisma.auditLog.deleteMany({ where: w }).catch(() => {})
    await prisma.user.deleteMany({ where: { companyId } }).catch(() => {})
    await prisma.company.delete({ where: { id: companyId } }).catch(() => {})
    for (const uid of uids) await admin.auth.admin.deleteUser(uid).catch(() => {})
    await prisma.$disconnect()
  }

  try {
    const owner = await makeUser('OWNER')
    ok('login OWNER')

    // paciente alvo
    console.log('\n== PACIENTE ==')
    const cpf = '321.654.' + String(Math.floor(100 + Math.random() * 899)) + '-00'
    const cp = await owner.req('POST', '/api/patients', { name: 'Paciente Clínico', cpf, birthDate: '1985-03-20', gender: 'FEMALE', phone: '(11) 97777-0000', origin: 'OTHER' })
    if (cp.status !== 201) throw new Error('criar paciente: ' + cp.status + ' ' + JSON.stringify(cp.json))
    const pid = cp.json.id
    ok(`paciente criado (${pid})`)

    console.log('\n== ANAMNESE ==')
    const tpl = await owner.req('POST', '/api/clinico/anamnese-templates', {
      name: 'Anamnese Geral ' + Date.now(), specialty: 'Clínica',
      questions: [{ label: 'Fuma?', type: 'BOOLEAN', required: true, order: 0 }, { label: 'Alergias', type: 'TEXTAREA', order: 1 }],
    })
    tpl.status === 201 && tpl.json.questions?.length === 2 ? ok('modelo de anamnese criado (2 perguntas)') : fail('modelo anamnese: ' + JSON.stringify(tpl.json))
    const tplId = tpl.json.id
    const an = await owner.req('POST', `/api/patients/${pid}/anamneses`, {
      title: 'Anamnese inicial', templateId: tplId, status: 'FILLED',
      answers: [{ label: 'Fuma?', value: 'Não' }, { label: 'Alergias', value: 'Dipirona' }],
    })
    an.status === 201 && an.json.answers?.length === 2 ? ok('anamnese preenchida (2 respostas)') : fail('anamnese: ' + JSON.stringify(an.json))
    const anId = an.json.id
    const anRev = await owner.req('PUT', `/api/clinico/anamneses/${anId}`, { status: 'REVIEWED' })
    anRev.status === 200 && anRev.json.status === 'REVIEWED' ? ok('anamnese marcada REVIEWED') : fail('revisar anamnese: ' + JSON.stringify(anRev.json))
    const anList = await owner.req('GET', `/api/patients/${pid}/anamneses`)
    anList.json?.some((a) => a.id === anId) ? ok('anamnese listada no paciente') : fail('anamnese não listada')
    const anGlobal = await owner.req('GET', '/api/clinico/anamneses')
    anGlobal.json?.some((a) => a.id === anId && a.patientName) ? ok('anamnese na lista global (com nome do paciente)') : fail('anamnese global sem nome')

    console.log('\n== PRONTUÁRIO ==')
    const rec = await owner.req('POST', `/api/patients/${pid}/medical-records`, { type: 'EVOLUTION', title: 'Primeira consulta', content: 'Paciente estável.' })
    rec.status === 201 ? ok('registro de prontuário criado') : fail('prontuário: ' + JSON.stringify(rec.json))
    const recList = await owner.req('GET', `/api/patients/${pid}/medical-records`)
    recList.json?.[0]?.createdByName ? ok('prontuário lista com nome do autor') : fail('prontuário sem autor')

    console.log('\n== CONTRATOS ==')
    const ctpl = await owner.req('POST', '/api/clinico/contract-templates', { name: 'Contrato Padrão ' + Date.now(), content: 'Eu, {{nome_paciente}} (CPF {{cpf}}), aceito o procedimento por {{valor}}.' })
    ctpl.status === 201 ? ok('modelo de contrato criado') : fail('modelo contrato: ' + JSON.stringify(ctpl.json))
    const ctr = await owner.req('POST', `/api/patients/${pid}/contracts`, { title: 'Contrato 1', templateId: ctpl.json.id, content: 'Eu, Paciente Clínico (CPF ' + cpf + '), aceito o procedimento por R$ 500.00.', value: 500, variables: { nome_paciente: 'Paciente Clínico', cpf } })
    ctr.status === 201 ? ok('contrato gerado') : fail('contrato: ' + JSON.stringify(ctr.json))
    const ctrSign = await owner.req('PUT', `/api/clinico/contracts/${ctr.json.id}`, { status: 'SIGNED' })
    ctrSign.status === 200 && ctrSign.json.signedAt ? ok('contrato assinado (signedAt carimbado)') : fail('assinar contrato: ' + JSON.stringify(ctrSign.json))

    console.log('\n== ORÇAMENTOS ==')
    const q = await owner.req('POST', `/api/patients/${pid}/quotes`, { title: 'Orçamento 1', discount: 50, items: [{ description: 'Limpeza', quantity: 2, unitPrice: 100 }, { description: 'Avaliação', quantity: 1, unitPrice: 150 }] })
    // subtotal = 2*100 + 150 = 350; total = 350 - 50 = 300
    q.status === 201 && q.json.subtotal === 350 && q.json.total === 300 ? ok('orçamento criado (subtotal 350, total 300)') : fail('orçamento totais: ' + JSON.stringify(q.json))
    const qAppr = await owner.req('PUT', `/api/clinico/quotes/${q.json.id}`, { status: 'APPROVED' })
    qAppr.status === 200 && qAppr.json.approvedAt ? ok('orçamento aprovado') : fail('aprovar orçamento: ' + JSON.stringify(qAppr.json))

    console.log('\n== IMAGENS / DOCUMENTOS (bucket clinical-media) ==')
    const imgFd = new FormData()
    imgFd.append('file', new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }), 'foto.png')
    imgFd.append('category', 'BEFORE')
    const upImg = await owner.req('POST', `/api/patients/${pid}/images`, imgFd, true)
    let imgId
    if (upImg.status === 201) { ok('upload imagem OK (' + (upImg.json.url ? 'signed URL' : 'sem URL') + ')'); imgId = upImg.json.id }
    else fail('upload imagem: ' + upImg.status + ' ' + JSON.stringify(upImg.json))
    const docFd = new FormData()
    docFd.append('file', new Blob(['laudo de teste'], { type: 'text/plain' }), 'laudo.txt')
    docFd.append('category', 'EXAM'); docFd.append('title', 'Laudo X')
    const upDoc = await owner.req('POST', `/api/patients/${pid}/documents`, docFd, true)
    let docId
    if (upDoc.status === 201) { ok('upload documento OK'); docId = upDoc.json.id }
    else fail('upload documento: ' + upDoc.status + ' ' + JSON.stringify(upDoc.json))
    if (imgId) { const d = await owner.req('DELETE', `/api/clinico/images/${imgId}`); d.status === 200 ? ok('imagem removida') : fail('del imagem: ' + d.status) }
    if (docId) { const d = await owner.req('DELETE', `/api/clinico/documents/${docId}`); d.status === 200 ? ok('documento removido') : fail('del documento: ' + d.status) }

    console.log('\n== AUDITORIA ==')
    const audits = await prisma.auditLog.findMany({ where: { companyId }, select: { action: true, entityType: true } })
    const has = (a, e) => audits.some((x) => x.action === a && x.entityType === e)
    const checks = [
      ['CREATE', 'ANAMNESIS'], ['UPDATE', 'ANAMNESIS'], ['CREATE', 'MEDICAL_RECORD'],
      ['CREATE', 'CONTRACT'], ['UPDATE', 'CONTRACT'], ['CREATE', 'QUOTE'], ['UPDATE', 'QUOTE'],
      ['UPLOAD_ATTACHMENT', 'PATIENT_IMAGE'], ['UPLOAD_ATTACHMENT', 'PATIENT_DOCUMENT'],
      ['DELETE_ATTACHMENT', 'PATIENT_IMAGE'], ['DELETE_ATTACHMENT', 'PATIENT_DOCUMENT'],
    ]
    const missing = checks.filter(([a, e]) => !has(a, e))
    missing.length === 0 ? ok(`auditoria registrou todas as ações (${checks.length})`) : fail('faltam na auditoria: ' + missing.map((m) => m.join('/')).join(', '))

    console.log('\n== RBAC POR PAPEL ==')
    // FINANCE: vê orçamento/contrato, NÃO vê prontuário/anamnese.
    const finance = await makeUser('FINANCE')
    const fAcc = await finance.req('GET', '/api/clinico/access')
    fAcc.json?.orcamentos === 'view' && fAcc.json?.prontuario === 'none' ? ok('FINANCE: access orcamentos=view, prontuario=none') : fail('FINANCE access: ' + JSON.stringify(fAcc.json))
    const fPront = await finance.req('GET', '/api/clinico/medical-records')
    fPront.status === 403 ? ok('FINANCE bloqueado no prontuário (403)') : fail('FINANCE prontuário deveria 403, veio ' + fPront.status)
    const fQuote = await finance.req('GET', '/api/clinico/quotes')
    fQuote.status === 200 ? ok('FINANCE acessa orçamentos (200)') : fail('FINANCE orçamentos: ' + fQuote.status)

    // MARKETING: sem acesso clínico.
    const mkt = await makeUser('MARKETING')
    const mAcc = await mkt.req('GET', '/api/clinico/access')
    Object.values(mAcc.json || {}).every((v) => v === 'none') ? ok('MARKETING: nenhum acesso clínico') : fail('MARKETING access: ' + JSON.stringify(mAcc.json))
    const mAn = await mkt.req('GET', '/api/clinico/anamneses')
    mAn.status === 403 ? ok('MARKETING bloqueado em anamneses (403)') : fail('MARKETING anamneses deveria 403, veio ' + mAn.status)

    // DOCTOR: edita prontuário, vê (não edita) contratos.
    const doctor = await makeUser('DOCTOR')
    const dRec = await doctor.req('POST', `/api/patients/${pid}/medical-records`, { type: 'OBSERVATION', title: 'Obs do médico', content: 'ok' })
    dRec.status === 201 ? ok('DOCTOR cria registro de prontuário (201)') : fail('DOCTOR prontuário: ' + dRec.status)
    const dCtrView = await doctor.req('GET', `/api/patients/${pid}/contracts`)
    dCtrView.status === 200 ? ok('DOCTOR vê contratos (200)') : fail('DOCTOR ver contratos: ' + dCtrView.status)
    const dCtrEdit = await doctor.req('POST', `/api/patients/${pid}/contracts`, { title: 'x', content: 'y' })
    dCtrEdit.status === 403 ? ok('DOCTOR bloqueado ao CRIAR contrato (403)') : fail('DOCTOR criar contrato deveria 403, veio ' + dCtrEdit.status)

    console.log('\n== ISOLAMENTO (multiempresa) ==')
    const other = await prisma.company.findFirst({ where: { id: { not: companyId }, deletedAt: null } })
    if (other) {
      const otherAn = await prisma.patientAnamnesis.findFirst({ where: { companyId: other.id, deletedAt: null } })
      if (otherAn) {
        const cross = await owner.req('GET', `/api/clinico/anamneses/${otherAn.id}`)
        cross.status === 404 ? ok('anamnese de outra empresa → 404 (isolado)') : fail('VAZAMENTO anamnese: status ' + cross.status)
      } else { console.log('  ⚠️  outra empresa sem anamnese para testar isolamento') }
    } else { console.log('  ⚠️  só existe a empresa temp; isolamento não testável agora') }

  } finally {
    console.log('\n== CLEANUP ==')
    await teardown()
    ok('temp removido')
  }

  console.log(process.exitCode ? '\n⚠️  Clínico smoke com falhas.' : '\n🎉 Clínico smoke: anamnese + prontuário + contratos + orçamentos + imagens + documentos + auditoria + RBAC + isolamento OK.')
}
main().catch((e) => { console.error('Smoke falhou:', e); process.exit(1) })
