#!/usr/bin/env node
// Guard de migrations — evita aplicar migrations em bancos REMOTOS (produção)
// por engano a partir da máquina local.
//
// Contexto: `MIGRATE_DATABASE_URL` no .env aponta para o Supabase de produção
// (é o role com DDL). Um `prisma migrate deploy/dev/reset` local, portanto,
// escreve DIRETO em produção. Este wrapper intercepta os comandos MUTANTES e
// só deixa passar contra host remoto se `ALLOW_PROD_MIGRATE=1` for explícito.
//
// Comandos somente-leitura (status/diff/validate/generate) passam sempre.
//
// Uso (via npm scripts):
//   npm run db:migrate            -> migrate dev   (bloqueado em remoto)
//   npm run db:migrate:deploy     -> migrate deploy (bloqueado em remoto)
//   npm run db:migrate:status     -> migrate status (livre)
//   npm run db:migrate:local      -> usa LOCAL_DATABASE_URL (container docker)
//   npm run db:migrate:prod       -> ALLOW_PROD_MIGRATE=1 (intenção explícita)
//
// Precedência de env: tanto o Node (--env-file) quanto o Prisma NÃO sobrescrevem
// variáveis já definidas no ambiente. Então exportar MIGRATE_DATABASE_URL (ou usar
// --local) redireciona o alvo com segurança.

import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);

// --local: aponta para o banco de desenvolvimento (LOCAL_DATABASE_URL).
const localIdx = argv.indexOf('--local');
const useLocal = localIdx !== -1;
if (useLocal) argv.splice(localIdx, 1);

if (useLocal) {
  const local = process.env.LOCAL_DATABASE_URL;
  if (!local) {
    console.error('\n❌ --local requer LOCAL_DATABASE_URL no .env.');
    console.error('   Ex.: LOCAL_DATABASE_URL="postgresql://postgres:test@localhost:55433/bootclinic?schema=public"');
    console.error('   Suba um Postgres descartável:');
    console.error('   docker run -d --name bootclinic-localdb -e POSTGRES_PASSWORD=test -e POSTGRES_DB=bootclinic -p 55433:5432 postgres:15\n');
    process.exit(1);
  }
  process.env.MIGRATE_DATABASE_URL = local;
  process.env.DATABASE_URL = local;
}

const target = process.env.MIGRATE_DATABASE_URL || process.env.DATABASE_URL || '';
let host = '(desconhecido)';
try { host = new URL(target).host; } catch { /* URL malformada — segue e deixa o prisma reclamar */ }

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const hostname = host.split(':')[0];
const isLocal = LOCAL_HOSTS.has(hostname);

// Comando mutante = escreve schema/dados.
const MUTATING = [
  ['migrate', 'dev'], ['migrate', 'deploy'], ['migrate', 'reset'], ['migrate', 'resolve'],
  ['db', 'push'], ['db', 'execute'], ['db', 'seed'],
];
const isMutating = MUTATING.some(([a, b]) => argv[0] === a && argv[1] === b);

const allowProd = process.env.ALLOW_PROD_MIGRATE === '1';

if (isMutating && !isLocal && !allowProd) {
  console.error('\n🛑 Migration MUTANTE bloqueada contra host REMOTO.');
  console.error(`   Alvo (MIGRATE_DATABASE_URL): ${hostname}`);
  console.error(`   Comando: prisma ${argv.join(' ')}`);
  console.error('\n   Para testar em banco LOCAL (recomendado):');
  console.error('     npm run db:migrate:local -- ' + argv.join(' '));
  console.error('\n   Se você REALMENTE quer aplicar em produção (intencional):');
  console.error('     npm run db:migrate:prod            # = ALLOW_PROD_MIGRATE=1 migrate deploy');
  console.error('     ALLOW_PROD_MIGRATE=1 npm run db:migrate:deploy\n');
  process.exit(1);
}

const banner = isLocal
  ? `▶ prisma ${argv.join(' ')}  → LOCAL (${hostname})`
  : `⚠️  prisma ${argv.join(' ')}  → REMOTO/PRODUÇÃO (${hostname}) — ALLOW_PROD_MIGRATE=1`;
console.error('\n' + banner + '\n');

const bin = process.platform === 'win32' ? 'prisma.cmd' : 'prisma';
const res = spawnSync('node_modules/.bin/' + bin, argv, { stdio: 'inherit', env: process.env });
process.exit(res.status ?? 1);
