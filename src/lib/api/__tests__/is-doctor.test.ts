import { describe, it, expect } from 'vitest';
import { isMedico } from '@/lib/api/is-doctor';

describe('quem aparece como Médico(a) na agenda', () => {
  it('cadastro sem conta de acesso aparece (médico que não faz login)', () => {
    expect(isMedico({ userId: null })).toBe(true);
    expect(isMedico({})).toBe(true);
  });

  it('conta com papel DOCTOR aparece', () => {
    expect(isMedico({ userId: 'u1', user: { role: 'DOCTOR' } })).toBe(true);
  });

  it('dono, recepção, financeiro e super-admin NÃO aparecem', () => {
    // Casos reais encontrados em produção: OWNER e SUPER_ADMIN tinham virado
    // "médicos" porque o GET criava um registro com o nome de quem abria a tela.
    for (const role of ['OWNER', 'RECEPTION', 'FINANCE', 'MANAGER', 'MARKETING', 'ATTENDANCE', 'SUPER_ADMIN'] as const) {
      expect(isMedico({ userId: 'u1', user: { role } })).toBe(false);
    }
  });

  it('vínculo apontando para usuário inexistente não aparece', () => {
    expect(isMedico({ userId: 'u1', user: null })).toBe(false);
  });
});
