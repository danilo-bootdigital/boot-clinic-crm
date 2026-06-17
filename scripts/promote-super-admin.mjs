// Promove um usuário a SUPER_ADMIN (dono do SaaS) pelo e-mail.
//
// O SUPER_ADMIN é quem acessa o painel /admin (gerenciar clínicas) e atravessa
// o limite de empresa. Continua pertencendo à própria clínica (companyId).
//
// Uso:
//   SUPER_ADMIN_EMAIL="danilo@bootdigital.com.br" npm run promote-super-admin
//   (default do e-mail: danilo@bootdigital.com.br)
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const EMAIL = process.env.SUPER_ADMIN_EMAIL || 'danilo@bootdigital.com.br'

async function main() {
  const user = await prisma.user.findFirst({ where: { email: EMAIL, deletedAt: null } })
  if (!user) {
    console.error(`Usuário não encontrado para o e-mail: ${EMAIL}`)
    process.exit(1)
  }
  if (user.role === 'SUPER_ADMIN') {
    console.log(`Usuário ${EMAIL} já é SUPER_ADMIN.`)
    return
  }
  await prisma.user.update({ where: { id: user.id }, data: { role: 'SUPER_ADMIN' } })
  console.log(`✅ ${EMAIL} promovido a SUPER_ADMIN.`)
}

main()
  .catch((e) => { console.error('Falhou:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
