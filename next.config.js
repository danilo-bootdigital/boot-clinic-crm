/** @type {import('next').NextConfig} */
// Lint é um gate SEPARADO (`npm run lint`), não parte do build. O repositório tem
// débito de lint pré-existente em outros módulos (fora do escopo do WhatsApp); sem
// isto, `next build` falharia por esses erros alheios. `npm run lint` continua
// executando o ESLint de verdade.
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
};

module.exports = nextConfig;
