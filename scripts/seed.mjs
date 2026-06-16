// Seed mínimo: 1 empresa padrão + 1 usuário admin ligado ao Supabase Auth.
//
// A ligação correta (sem gambiarra) é: o id da linha em `users` é igual ao
// UID do usuário no Supabase Auth. O getCurrentUser() resolve o usuário pela
// sessão Supabase e a API busca prisma.user.findUnique({ where: { id: uid } }).
//
// MODO UID (recomendado, sem service role key):
//   Crie o usuário manualmente em Supabase → Authentication → Users (com e-mail
//   confirmado), copie o UID e rode:
//     SEED_ADMIN_UID="<uid>" npm run seed
//
// MODO SERVICE ROLE (opcional): se SUPABASE_SERVICE_ROLE_KEY estiver definida e
//   nenhum SEED_ADMIN_UID for informado, o script cria o usuário no Auth sozinho.
//
// Requer no ambiente: DATABASE_URL (já no .env). NEXT_PUBLIC_SUPABASE_URL só é
// usado no modo service role.
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const ADMIN_UID = process.env.SEED_ADMIN_UID
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'danilo@bootdigital.com.br'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD // usado apenas no modo service role
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Danilo (Admin)'
const COMPANY_NAME = process.env.SEED_COMPANY_NAME || 'Clínica Padrão'

// Resolve o UID do usuário admin no Supabase Auth.
async function resolveUid() {
  // Modo UID: usuário já criado manualmente no painel.
  if (ADMIN_UID) {
    console.log('Auth: usando UID informado ->', ADMIN_UID)
    return ADMIN_UID
  }

  // Modo service role (fallback): cria/recupera o usuário via admin API.
  if (SUPABASE_URL && SERVICE_ROLE) {
    const { createClient } = await import('@supabase/supabase-js')
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: created, error } = await admin.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
    })
    if (!error && created?.user) {
      console.log('Auth: usuário criado ->', created.user.id)
      return created.user.id
    }
    if (error && /already|registered|exists/i.test(error.message)) {
      let page = 1
      while (page <= 20) {
        const { data, error: listErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
        if (listErr) throw listErr
        const found = data.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase())
        if (found) { console.log('Auth: usuário já existia ->', found.id); return found.id }
        if (data.users.length < 1000) break
        page++
      }
    }
    throw error || new Error('Não foi possível criar/localizar o usuário no Supabase Auth')
  }

  console.error('\nERRO: informe o UID do usuário criado no Supabase Auth.')
  console.error('  1) Supabase → Authentication → Users → Add user (com e-mail confirmado)')
  console.error('  2) Copie o "User UID"')
  console.error('  3) Rode:  SEED_ADMIN_UID="<uid>" npm run seed\n')
  process.exit(1)
}

async function main() {
  const uid = await resolveUid()

  // Empresa padrão (idempotente por nome).
  let company = await prisma.company.findFirst({ where: { name: COMPANY_NAME } })
  if (!company) {
    company = await prisma.company.create({ data: { name: COMPANY_NAME } })
    console.log('DB: empresa criada ->', company.id)
  } else {
    console.log('DB: empresa já existia ->', company.id)
  }

  // Usuário admin com id = UID do Supabase Auth.
  await prisma.user.upsert({
    where: { id: uid },
    update: { email: ADMIN_EMAIL, name: ADMIN_NAME, role: 'OWNER', companyId: company.id },
    create: { id: uid, email: ADMIN_EMAIL, name: ADMIN_NAME, role: 'OWNER', companyId: company.id },
  })
  console.log('DB: usuário admin pronto ->', uid)

  console.log('\n✅ Seed concluído. Login:', ADMIN_EMAIL)
}

main()
  .catch((e) => { console.error('Seed falhou:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
