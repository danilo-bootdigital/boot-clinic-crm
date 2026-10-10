#!/usr/bin/env node
// Runner do seed da DOS CLINIC: empacota index.ts com esbuild (resolve o alias
// "@/" do tsconfig e reaproveita os serviços reais de src/lib) e executa o
// bundle com o .env do app. Dependências npm ficam externas (node_modules).
//
//   npm run seed:dos-clinic [-- --yes | --verify | --reset --yes]
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..', '..');
const outfile = join(appRoot, 'node_modules', '.cache', 'seed-dos-clinic', 'seed.cjs');

await build({
  entryPoints: [join(here, 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  packages: 'external',
  tsconfig: join(appRoot, 'tsconfig.json'),
  outfile,
  logLevel: 'warning',
});

const r = spawnSync(
  process.execPath,
  // --experimental-websocket: o supabase-js exige WebSocket global no Node 20.
  ['--experimental-websocket', '--no-warnings', '--env-file=.env', outfile, ...process.argv.slice(2)],
  // NODE_ENV=production desliga o log de queries do Prisma client do app.
  { cwd: appRoot, stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } },
);
process.exit(r.status ?? 1);
