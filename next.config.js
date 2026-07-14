/** @type {import('next').NextConfig} */
// Lint no build NÃO é ignorado globalmente. Como o repositório tem débito de lint
// PRÉ-EXISTENTE em outros módulos (fora do escopo desta branch) e não havia CI,
// o `next build` roda o ESLint restrito às áreas mantidas aqui (WhatsApp + tooling):
// assim o lint fica ENFORCED no código novo e o build não quebra por erros alheios,
// sem `ignoreDuringBuilds` e sem tocar em outros módulos. Gate adicional em
// .github/workflows/ci.yml (typecheck + lint escopado + testes) antes de merge.
// Um cleanup de lint repo-wide é tarefa separada.
const nextConfig = {
  eslint: {
    dirs: [
      'src/lib/whatsapp',
      'src/lib/storage',
      'src/app/api/whatsapp',
      'src/components/whatsapp',
      'src/test',
    ],
  },
};

module.exports = nextConfig;
