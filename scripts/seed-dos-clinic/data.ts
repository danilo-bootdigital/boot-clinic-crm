// =====================================================================
// DOS CLINIC — dataset demonstrativo (100% fictício).
//
// Datas escritas na referência original (âncora 06/10/2026, America/Sao_Paulo).
// O seed desloca tudo para DEMO_ANCHOR_DATE quando informado (ver index.ts).
//
// Regras de dado sintético:
//  - CPF/CNPJ são gerados com dígito verificador INVÁLIDO de propósito
//    (index.ts → fakeCpf/fakeCnpj): não podem pertencer a ninguém real.
//  - E-mails usam domínios reservados (example.com / dosclinic.demo).
//  - Nenhuma conta de canal (WhatsApp/Instagram) é criada para a clínica,
//    então nada aqui pode virar mensagem real.
// =====================================================================

export const ANCHOR_REF = '2026-10-06';

export const COMPANY = {
  name: 'DOS CLINIC',
  // Base do CNPJ; os dígitos verificadores são calculados e invalidados no seed.
  cnpjBase: '418825700001',
  address: 'Alameda das Magnólias, 820 — 3º andar, Jardim Europa, São Paulo/SP — CEP 01449-020',
  phone: '1132198500',
  email: 'contato@dosclinic.demo',
  plan: 'pro',
};

export const OWNER = { email: 'user@bootclinic.com.br', name: 'Gabriel Dossi' };

// ---- Equipe -----------------------------------------------------------------
// key → usado pelo restante do dataset. `prof` = também é profissional da agenda.
export const STAFF = [
  { key: 'AND', name: 'Dr. André Lacerda', email: 'andre.lacerda@dosclinic.demo', role: 'DOCTOR', phone: '11991284410',
    prof: { crm: 'CRM-SP 184.552', specialties: ['Nutrologia', 'Clínica Médica'] } },
  { key: 'BEA', name: 'Dra. Beatriz Monteiro', email: 'beatriz.monteiro@dosclinic.demo', role: 'DOCTOR', phone: '11992377128',
    prof: { crm: 'CRM-SP 201.337', specialties: ['Endocrinologia', 'Clínica Médica'] } },
  { key: 'LAR', name: 'Larissa Prado', email: 'larissa.prado@dosclinic.demo', role: 'DOCTOR', phone: '11993468291',
    prof: { crm: 'CRN-3 48213', specialties: ['Nutrição Clínica'] } },
  { key: 'JES', name: 'Jéssica Nunes', email: 'jessica.nunes@dosclinic.demo', role: 'RECEPTION', phone: '11994551037' },
  { key: 'DIE', name: 'Diego Arantes', email: 'diego.arantes@dosclinic.demo', role: 'ATTENDANCE', phone: '11995642284' },
  { key: 'REN', name: 'Renata Castilho', email: 'renata.castilho@dosclinic.demo', role: 'FINANCE', phone: '11996733519' },
] as const;

// Profissional SEM login (a arquitetura permite: Professional.userId é opcional).
export const PROF_ONLY = [
  { key: 'CAR', name: 'Carolina Rezende', email: 'carolina.rezende@dosclinic.demo', phone: '11997824406',
    crm: 'CRBM-1 12.874', specialties: ['Estética Avançada'] },
];

export const PERMISSIONS: Record<string, Record<string, 'none' | 'view' | 'edit'>> = {
  DOCTOR: { patients: 'edit', clinico: 'edit', telemedicina: 'edit', crm: 'none', agenda: 'edit', followup: 'edit', whatsapp: 'view', automacoes: 'none', financeiro: 'none', dashboard: 'view', configuracoes: 'none' },
  RECEPTION: { patients: 'edit', clinico: 'view', telemedicina: 'view', crm: 'view', agenda: 'edit', followup: 'edit', whatsapp: 'edit', automacoes: 'none', financeiro: 'view', dashboard: 'view', configuracoes: 'none' },
  ATTENDANCE: { patients: 'edit', clinico: 'none', telemedicina: 'none', crm: 'edit', agenda: 'edit', followup: 'edit', whatsapp: 'edit', automacoes: 'edit', financeiro: 'none', dashboard: 'view', configuracoes: 'none' },
  FINANCE: { patients: 'view', clinico: 'none', telemedicina: 'none', crm: 'view', agenda: 'view', followup: 'edit', whatsapp: 'none', automacoes: 'none', financeiro: 'edit', dashboard: 'view', configuracoes: 'none' },
};

// Horários de atendimento (ProfessionalSchedule): dia da semana 1=seg … 5=sex.
export const SCHEDULES: Record<string, [number, string, string][]> = {
  AND: [[1, '08:00', '18:00'], [2, '08:00', '18:00'], [3, '08:00', '18:00'], [4, '08:00', '18:00'], [5, '08:00', '14:00']],
  BEA: [[1, '09:00', '19:00'], [2, '09:00', '19:00'], [3, '13:00', '19:00'], [4, '09:00', '19:00'], [5, '09:00', '19:00']],
  LAR: [[1, '08:00', '19:00'], [2, '08:00', '19:00'], [3, '08:00', '19:00'], [4, '08:00', '19:00'], [5, '08:00', '17:00']],
  CAR: [[1, '08:00', '18:00'], [2, '08:00', '18:00'], [3, '08:00', '18:00'], [4, '08:00', '18:00'], [5, '08:00', '18:00']],
};

export const SCHEDULE_BLOCKS = [
  { prof: 'BEA', date: '2026-10-23', start: '13:00', end: '19:00', reason: 'Congresso Brasileiro de Endocrinologia (tarde)' },
  { prof: 'AND', date: '2026-10-16', start: '08:00', end: '10:00', reason: 'Reunião clínica mensal da equipe' },
];

export const SPECIALTIES = [
  { name: 'Clínica Médica', description: 'Avaliação clínica geral e check-up integrado' },
  { name: 'Nutrologia', description: 'Diagnóstico e tratamento de distúrbios nutricionais e metabólicos' },
  { name: 'Endocrinologia', description: 'Hormônios, tireoide, metabolismo e controle de peso' },
  { name: 'Nutrição Clínica', description: 'Planos alimentares, reeducação e acompanhamento nutricional' },
  { name: 'Estética Avançada', description: 'Protocolos faciais e corporais minimamente invasivos' },
];

export const ROOMS = [
  { name: 'Sala 01 — Consultório Médico', description: 'Consultório do Dr. André Lacerda' },
  { name: 'Sala 02 — Nutrição', description: 'Consultório de nutrição com balança de bioimpedância' },
  { name: 'Sala 03 — Avaliação', description: 'Avaliação corporal e consultas de endocrinologia' },
  { name: 'Sala 04 — Procedimentos', description: 'Procedimentos estéticos faciais e corporais' },
  { name: 'Sala Telemedicina', description: 'Estação reservada para teleconsultas' },
];
export const ROOM_OF: Record<string, string> = {
  AND: 'Sala 01 — Consultório Médico', BEA: 'Sala 03 — Avaliação', LAR: 'Sala 02 — Nutrição', CAR: 'Sala 04 — Procedimentos',
};
export const SPEC_OF: Record<string, string> = {
  AND: 'Nutrologia', BEA: 'Endocrinologia', LAR: 'Nutrição Clínica', CAR: 'Estética Avançada',
};

// Tabela de serviços (preço de referência dos itens de orçamento).
export const SERVICES: Record<string, number> = {
  'Consulta Médica Inicial': 450,
  'Consulta de Retorno': 250,
  'Consulta de Nutrologia': 520,
  'Consulta de Endocrinologia': 480,
  'Avaliação Corporal (bioimpedância)': 290,
  'Consulta Nutricional': 320,
  'Retorno Nutricional': 210,
  'Avaliação Estética': 260,
  'Procedimento Estético Facial': 1480,
  'Procedimento Estético Corporal (sessão)': 690,
  'Acompanhamento Mensal': 590,
  'Teleconsulta': 380,
  'Check-up Integrado': 1350,
};

export const TAGS: [string, string][] = [
  ['Novo paciente', '#3B82F6'], ['Retorno', '#8B5CF6'], ['VIP', '#F59E0B'], ['Nutrologia', '#10B981'],
  ['Endocrinologia', '#0EA5E9'], ['Estética', '#EC4899'], ['Nutrição', '#22C55E'], ['Acompanhamento', '#6366F1'],
  ['Lead Instagram', '#E1306C'], ['Google Ads', '#EA4335'], ['Indicação', '#14B8A6'], ['Site', '#64748B'],
  ['Evento', '#A855F7'], ['Paciente antigo', '#78716C'],
];

// ---- Pacientes ---------------------------------------------------------------
// created = data/hora de cadastro (BRT). by = quem cadastrou (STAFF key ou OWNER).
export interface PatientSeed {
  key: string; name: string; gender: 'MALE' | 'FEMALE'; birth: string;
  origin: 'GOOGLE' | 'FACEBOOK' | 'INSTAGRAM' | 'REFERRAL' | 'WALK_IN' | 'PHONE' | 'WHATSAPP' | 'OTHER';
  city: string; state: string; zip: string; address: string;
  job: string; marital: string; insurance?: string; insuranceNumber?: string;
  emergency: string; created: string; by: string; tags: string[];
  status?: 'ACTIVE' | 'INACTIVE'; extra?: string;
}

export const PATIENTS: PatientSeed[] = [
  { key: 'P01', name: 'Mariana Almeida', gender: 'FEMALE', birth: '1991-04-12', origin: 'INSTAGRAM', city: 'São Paulo', state: 'SP', zip: '04016-002', address: 'Rua das Hortênsias, 215 — Ap. 42, Vila Mariana', job: 'Arquiteta', marital: 'Casada', emergency: 'Felipe Almeida (marido) · (11) 98877-1203', created: '2026-10-02 10:12', by: 'DIE', tags: ['Novo paciente', 'Nutrologia', 'Lead Instagram', 'Acompanhamento'], extra: 'Prefere contato por WhatsApp no período da tarde.' },
  { key: 'P02', name: 'Carlos Henrique Martins', gender: 'MALE', birth: '1978-09-03', origin: 'GOOGLE', city: 'São Paulo', state: 'SP', zip: '05415-030', address: 'Rua Ferreira de Araújo, 1120 — Pinheiros', job: 'Engenheiro civil', marital: 'Casado', insurance: 'Bradesco Saúde', insuranceNumber: '884 2207 1193 0045', emergency: 'Luciana Martins (esposa) · (11) 97761-4432', created: '2026-09-08 14:37', by: 'DIE', tags: ['Endocrinologia', 'Google Ads', 'Acompanhamento', 'VIP'] },
  { key: 'P03', name: 'Juliana Ferreira', gender: 'FEMALE', birth: '1986-01-22', origin: 'REFERRAL', city: 'São Paulo', state: 'SP', zip: '04538-132', address: 'Rua Jesuíno Arruda, 386 — Itaim Bibi', job: 'Advogada', marital: 'Solteira', emergency: 'Sandra Ferreira (mãe) · (11) 98102-5567', created: '2026-09-10 09:21', by: 'JES', tags: ['Nutrologia', 'Nutrição', 'Indicação', 'Acompanhamento'], extra: 'Indicada pela paciente Patrícia Gomes Silveira.' },
  { key: 'P04', name: 'Ana Paula Ribeiro', gender: 'FEMALE', birth: '1983-07-30', origin: 'GOOGLE', city: 'Santo André', state: 'SP', zip: '09030-110', address: 'Rua das Figueiras, 940 — Jardim', job: 'Gerente comercial', marital: 'Divorciada', insurance: 'SulAmérica', insuranceNumber: '5521 0098 4410', emergency: 'Rafael Ribeiro (irmão) · (11) 97654-8812', created: '2026-09-12 16:05', by: 'DIE', tags: ['Estética', 'Google Ads', 'VIP'] },
  { key: 'P05', name: 'Rodrigo Fernandes', gender: 'MALE', birth: '1975-11-14', origin: 'WHATSAPP', city: 'São Paulo', state: 'SP', zip: '01310-200', address: 'Rua Bela Cintra, 1550 — Consolação', job: 'Empresário', marital: 'Casado', emergency: 'Cristiane Fernandes (esposa) · (11) 99210-3348', created: '2026-09-25 11:48', by: 'JES', tags: ['Novo paciente'] },
  { key: 'P06', name: 'Camila Rocha', gender: 'FEMALE', birth: '1994-02-08', origin: 'INSTAGRAM', city: 'São Paulo', state: 'SP', zip: '05022-000', address: 'Rua Turiassu, 777 — Perdizes', job: 'Designer gráfica', marital: 'Solteira', emergency: 'Helena Rocha (mãe) · (11) 98345-9910', created: '2026-09-18 19:02', by: 'DIE', tags: ['Nutrologia', 'Lead Instagram', 'Acompanhamento'] },
  { key: 'P07', name: 'Lucas Moreira', gender: 'MALE', birth: '1989-05-19', origin: 'OTHER', city: 'Osasco', state: 'SP', zip: '06013-000', address: 'Av. dos Autonomistas, 2300 — Centro', job: 'Analista de sistemas', marital: 'Casado', emergency: 'Bruna Moreira (esposa) · (11) 97520-6671', created: '2026-09-03 08:55', by: 'JES', tags: ['Endocrinologia', 'Site'], extra: 'Chegou pelo formulário do site.' },
  { key: 'P08', name: 'Fernanda Costa', gender: 'FEMALE', birth: '1980-12-01', origin: 'REFERRAL', city: 'São Paulo', state: 'SP', zip: '04104-020', address: 'Rua Tutóia, 470 — Paraíso', job: 'Professora universitária', marital: 'Casada', insurance: 'Unimed', insuranceNumber: '0 032 487720011 4', emergency: 'Marcos Costa (marido) · (11) 98660-2214', created: '2026-09-15 10:30', by: 'JES', tags: ['Nutrição', 'Indicação'] },
  { key: 'P09', name: 'Patrícia Gomes Silveira', gender: 'FEMALE', birth: '1972-06-25', origin: 'WALK_IN', city: 'São Paulo', state: 'SP', zip: '01426-001', address: 'Al. Lorena, 1890 — Jardim Paulista', job: 'Psicóloga', marital: 'Casada', insurance: 'Bradesco Saúde', insuranceNumber: '884 3310 0721 0012', emergency: 'Ricardo Silveira (marido) · (11) 99102-7745', created: '2026-09-01 09:10', by: 'JES', tags: ['Paciente antigo', 'Retorno', 'VIP', 'Acompanhamento'], extra: 'Paciente da clínica desde 2024 — cadastro migrado para o Boot Clinic.' },
  { key: 'P10', name: 'Thiago Barbosa', gender: 'MALE', birth: '1992-10-10', origin: 'INSTAGRAM', city: 'Campinas', state: 'SP', zip: '13025-050', address: 'Rua Coronel Quirino, 1010 — Cambuí', job: 'Personal trainer', marital: 'Solteiro', emergency: 'Marta Barbosa (mãe) · (19) 98123-4410', created: '2026-09-24 20:15', by: 'DIE', tags: ['Nutrologia', 'Lead Instagram'], extra: 'Atendimento preferencialmente por telemedicina (mora em Campinas).' },
  { key: 'P11', name: 'Bianca Cardoso Lima', gender: 'FEMALE', birth: '1997-03-15', origin: 'GOOGLE', city: 'São Paulo', state: 'SP', zip: '04571-010', address: 'Rua Gil Eanes, 312 — Brooklin', job: 'Jornalista', marital: 'Solteira', emergency: 'Paulo Lima (pai) · (11) 97433-1180', created: '2026-09-26 13:44', by: 'DIE', tags: ['Estética', 'Google Ads', 'Novo paciente'] },
  { key: 'P12', name: 'Eduardo Nogueira', gender: 'MALE', birth: '1968-08-21', origin: 'REFERRAL', city: 'São Paulo', state: 'SP', zip: '05674-010', address: 'Rua Jacques Félix, 95 — Morumbi', job: 'Diretor financeiro', marital: 'Casado', insurance: 'SulAmérica', insuranceNumber: '5521 0077 1290', emergency: 'Regina Nogueira (esposa) · (11) 99554-0021', created: '2026-09-29 10:05', by: 'JES', tags: ['Endocrinologia', 'Indicação', 'VIP'] },
  { key: 'P13', name: 'Luana Mendes', gender: 'FEMALE', birth: '1999-09-09', origin: 'INSTAGRAM', city: 'São Paulo', state: 'SP', zip: '03310-000', address: 'Rua Itapura, 640 — Tatuapé', job: 'Estudante de Direito', marital: 'Solteira', emergency: 'Rosana Mendes (mãe) · (11) 98712-3301', created: '2026-09-20 18:22', by: 'DIE', tags: ['Lead Instagram', 'Nutrologia'] },
  { key: 'P14', name: 'Gustavo Pereira Alves', gender: 'MALE', birth: '1985-04-04', origin: 'GOOGLE', city: 'São Paulo', state: 'SP', zip: '04710-000', address: 'Rua Verbo Divino, 1488 — Chácara Santo Antônio', job: 'Consultor de TI', marital: 'Casado', emergency: 'Aline Alves (esposa) · (11) 98234-7756', created: '2026-09-22 09:58', by: 'DIE', tags: ['Google Ads', 'Endocrinologia'] },
  { key: 'P15', name: 'Vanessa Teixeira', gender: 'FEMALE', birth: '1990-01-30', origin: 'FACEBOOK', city: 'Guarulhos', state: 'SP', zip: '07090-010', address: 'Rua Dom Pedro II, 288 — Centro', job: 'Enfermeira', marital: 'Casada', emergency: 'Júlio Teixeira (marido) · (11) 97880-5512', created: '2026-09-16 15:30', by: 'DIE', tags: ['Estética'] },
  { key: 'P16', name: 'Renato Siqueira', gender: 'MALE', birth: '1971-02-17', origin: 'WALK_IN', city: 'São Paulo', state: 'SP', zip: '01451-000', address: 'Av. Brigadeiro Faria Lima, 2020 — Jardim Paulistano', job: 'Médico veterinário', marital: 'Casado', insurance: 'Unimed', insuranceNumber: '0 032 551190087 2', emergency: 'Clara Siqueira (esposa) · (11) 99007-6623', created: '2026-10-01 16:40', by: 'JES', tags: ['Novo paciente', 'Endocrinologia'] },
  { key: 'P17', name: 'Aline Cristina Duarte', gender: 'FEMALE', birth: '1987-11-23', origin: 'WHATSAPP', city: 'São Paulo', state: 'SP', zip: '02012-000', address: 'Rua Voluntários da Pátria, 2450 — Santana', job: 'Contadora', marital: 'Casada', emergency: 'Sérgio Duarte (marido) · (11) 98451-2290', created: '2026-09-27 10:16', by: 'JES', tags: ['Nutrologia', 'Novo paciente'] },
  { key: 'P18', name: 'Marcelo Antunes', gender: 'MALE', birth: '1982-03-08', origin: 'OTHER', city: 'São Paulo', state: 'SP', zip: '04029-000', address: 'Rua Domingos de Morais, 2780 — Vila Mariana', job: 'Publicitário', marital: 'Solteiro', emergency: 'Teresa Antunes (mãe) · (11) 97341-6620', created: '2026-09-19 17:25', by: 'DIE', tags: ['Evento', 'Endocrinologia'], extra: 'Conheceu a clínica no evento "Saúde em Movimento" (set/2026).' },
  { key: 'P19', name: 'Priscila Carvalho', gender: 'FEMALE', birth: '1993-06-14', origin: 'INSTAGRAM', city: 'São Paulo', state: 'SP', zip: '05417-010', address: 'Rua Cardeal Arcoverde, 1745 — Pinheiros', job: 'Fisioterapeuta', marital: 'Casada', emergency: 'Leandro Carvalho (marido) · (11) 98990-1147', created: '2026-10-03 11:08', by: 'DIE', tags: ['Lead Instagram', 'Novo paciente', 'Nutrologia'] },
  { key: 'P20', name: 'Felipe Santana', gender: 'MALE', birth: '1996-12-27', origin: 'GOOGLE', city: 'Sorocaba', state: 'SP', zip: '18035-000', address: 'Rua Padre Luiz, 410 — Centro', job: 'Desenvolvedor de software', marital: 'Solteiro', emergency: 'Cláudio Santana (pai) · (15) 99812-0094', created: '2026-10-02 21:30', by: 'DIE', tags: ['Google Ads', 'Novo paciente'], extra: 'Primeira consulta por teleconsulta.' },
  { key: 'P21', name: 'Débora Pinheiro', gender: 'FEMALE', birth: '1979-10-05', origin: 'REFERRAL', city: 'São Paulo', state: 'SP', zip: '04094-050', address: 'Rua Sena Madureira, 1300 — Vila Clementino', job: 'Farmacêutica', marital: 'Viúva', emergency: 'Gabriela Pinheiro (filha) · (11) 98777-3401', created: '2026-09-23 08:40', by: 'JES', tags: ['Nutrição', 'Indicação'] },
  { key: 'P22', name: 'Roberto Vasconcelos', gender: 'MALE', birth: '1964-05-11', origin: 'WALK_IN', city: 'São Paulo', state: 'SP', zip: '01239-030', address: 'Rua Itacolomi, 600 — Higienópolis', job: 'Professor aposentado', marital: 'Casado', insurance: 'Bradesco Saúde', insuranceNumber: '884 1102 5530 0078', emergency: 'Marli Vasconcelos (esposa) · (11) 99341-2208', created: '2026-09-04 14:12', by: 'JES', tags: ['Paciente antigo', 'Retorno'] },
  { key: 'P23', name: 'Isabela Freitas', gender: 'FEMALE', birth: '2001-08-18', origin: 'INSTAGRAM', city: 'São Paulo', state: 'SP', zip: '05436-030', address: 'Rua Girassol, 455 — Vila Madalena', job: 'Influenciadora digital', marital: 'Solteira', emergency: 'Mônica Freitas (mãe) · (11) 98612-0743', created: '2026-10-04 12:47', by: 'DIE', tags: ['Lead Instagram', 'Estética', 'Novo paciente'] },
  { key: 'P24', name: 'Henrique Batista', gender: 'MALE', birth: '1988-02-02', origin: 'GOOGLE', city: 'São Bernardo do Campo', state: 'SP', zip: '09750-000', address: 'Rua Marechal Deodoro, 1290 — Centro', job: 'Supervisor de logística', marital: 'Casado', emergency: 'Patrícia Batista (esposa) · (11) 97765-4019', created: '2026-09-30 07:52', by: 'DIE', tags: ['Google Ads', 'Nutrição'] },
  { key: 'P25', name: 'Letícia Moura', gender: 'FEMALE', birth: '1995-07-07', origin: 'WHATSAPP', city: 'São Paulo', state: 'SP', zip: '04003-002', address: 'Rua Abílio Soares, 900 — Paraíso', job: 'Analista de RH', marital: 'Solteira', emergency: 'Vera Moura (mãe) · (11) 98003-6672', created: '2026-10-01 13:15', by: 'JES', tags: ['Nutrição', 'Novo paciente'] },
  { key: 'P26', name: 'Daniel Carvalho Prado', gender: 'MALE', birth: '1984-09-29', origin: 'OTHER', city: 'São Paulo', state: 'SP', zip: '04505-001', address: 'Rua Afonso Braz, 520 — Vila Nova Conceição', job: 'Arquiteto', marital: 'Casado', emergency: 'Fernanda Prado (esposa) · (11) 99652-8813', created: '2026-09-28 09:34', by: 'DIE', tags: ['Site', 'Nutrição'] },
  { key: 'P27', name: 'Simone Arruda', gender: 'FEMALE', birth: '1970-04-16', origin: 'REFERRAL', city: 'São Paulo', state: 'SP', zip: '01311-000', address: 'Av. Paulista, 1500 — Ap. 101, Bela Vista', job: 'Corretora de imóveis', marital: 'Divorciada', emergency: 'Lucas Arruda (filho) · (11) 98450-2271', created: '2026-09-11 10:50', by: 'JES', tags: ['Endocrinologia', 'Indicação'] },
  { key: 'P28', name: 'Bruno Tavares', gender: 'MALE', birth: '1991-11-11', origin: 'FACEBOOK', city: 'São Paulo', state: 'SP', zip: '03122-020', address: 'Rua dos Trilhos, 1300 — Mooca', job: 'Chef de cozinha', marital: 'Solteiro', emergency: 'Rita Tavares (mãe) · (11) 97210-5568', created: '2026-09-29 18:03', by: 'DIE', tags: ['Nutrologia'] },
  { key: 'P29', name: 'Natália Quintana', gender: 'FEMALE', birth: '1998-01-05', origin: 'INSTAGRAM', city: 'São Paulo', state: 'SP', zip: '05009-000', address: 'Rua Cayowaá, 1088 — Perdizes', job: 'Dentista', marital: 'Solteira', emergency: 'Ivo Quintana (pai) · (11) 98840-7712', created: '2026-10-05 20:41', by: 'DIE', tags: ['Lead Instagram', 'Estética', 'Novo paciente'] },
  { key: 'P30', name: 'Sérgio Lopes Medeiros', gender: 'MALE', birth: '1959-06-03', origin: 'WALK_IN', city: 'São Paulo', state: 'SP', zip: '01418-100', address: 'Rua Pamplona, 1700 — Jardim Paulista', job: 'Advogado', marital: 'Casado', insurance: 'SulAmérica', insuranceNumber: '5521 0034 8876', emergency: 'Neide Medeiros (esposa) · (11) 99231-5580', created: '2026-09-05 15:20', by: 'JES', tags: ['Paciente antigo', 'Retorno', 'Endocrinologia'] },
  { key: 'P31', name: 'Tatiane Ramos', gender: 'FEMALE', birth: '1986-03-27', origin: 'GOOGLE', city: 'São Paulo', state: 'SP', zip: '04563-000', address: 'Rua Barão do Triunfo, 1600 — Campo Belo', job: 'Gerente de projetos', marital: 'Casada', emergency: 'André Ramos (marido) · (11) 98567-3390', created: '2026-09-21 12:09', by: 'DIE', tags: ['Estética', 'Google Ads'] },
  { key: 'P32', name: 'Paulo Victor Andrade', gender: 'MALE', birth: '1993-08-12', origin: 'WHATSAPP', city: 'São Paulo', state: 'SP', zip: '02402-000', address: 'Rua Alfredo Pujol, 760 — Santana', job: 'Representante comercial', marital: 'Casado', emergency: 'Juliana Andrade (esposa) · (11) 97601-4423', created: '2026-10-05 09:27', by: 'JES', tags: ['Novo paciente', 'Nutrologia'] },
  { key: 'P33', name: 'Gabriela Fontes', gender: 'FEMALE', birth: '1990-05-24', origin: 'OTHER', city: 'São Paulo', state: 'SP', zip: '04117-091', address: 'Rua Tumiaru, 210 — Vila Mariana', job: 'Fotógrafa', marital: 'Solteira', emergency: 'Lígia Fontes (irmã) · (11) 98321-6654', created: '2026-10-03 16:18', by: 'DIE', tags: ['Evento', 'Estética'], extra: 'Cadastro feito no stand da clínica no evento "Saúde em Movimento".' },
  { key: 'P34', name: 'Vinícius Salgado', gender: 'MALE', birth: '1987-12-19', origin: 'REFERRAL', city: 'Barueri', state: 'SP', zip: '06454-000', address: 'Al. Rio Negro, 585 — Alphaville', job: 'Gerente de vendas', marital: 'Casado', emergency: 'Daniela Salgado (esposa) · (11) 99887-0031', created: '2026-10-04 10:55', by: 'JES', tags: ['Indicação', 'Nutrologia'] },
  { key: 'P35', name: 'Cláudia Bastos', gender: 'FEMALE', birth: '1966-02-09', origin: 'PHONE', city: 'São Paulo', state: 'SP', zip: '05303-000', address: 'Rua Carlos Weber, 900 — Vila Leopoldina', job: 'Empresária', marital: 'Casada', insurance: 'Unimed', insuranceNumber: '0 032 663012245 9', emergency: 'Hugo Bastos (marido) · (11) 99712-0446', created: '2026-09-24 11:35', by: 'JES', tags: ['Endocrinologia', 'Retorno'] },
  { key: 'P36', name: 'Amanda Figueiredo', gender: 'FEMALE', birth: '2000-04-01', origin: 'INSTAGRAM', city: 'São Paulo', state: 'SP', zip: '01455-000', address: 'Rua Tabapuã, 1220 — Itaim Bibi', job: 'Estudante de Medicina', marital: 'Solteira', emergency: 'Carla Figueiredo (mãe) · (11) 98221-9005', created: '2026-10-01 19:46', by: 'DIE', tags: ['Lead Instagram', 'Nutrição'] },
  { key: 'P37', name: 'Leonardo Machado', gender: 'MALE', birth: '1979-07-15', origin: 'GOOGLE', city: 'São Paulo', state: 'SP', zip: '04794-000', address: 'Av. Nações Unidas, 18800 — Santo Amaro', job: 'Gerente bancário', marital: 'Casado', insurance: 'Bradesco Saúde', insuranceNumber: '884 5520 3304 0019', emergency: 'Sílvia Machado (esposa) · (11) 99430-1172', created: '2026-10-02 14:03', by: 'DIE', tags: ['Google Ads', 'Endocrinologia', 'Novo paciente'] },
  { key: 'P38', name: 'Helena Prates', gender: 'FEMALE', birth: '1975-10-31', origin: 'REFERRAL', city: 'São Paulo', state: 'SP', zip: '01227-000', address: 'Rua Sergipe, 475 — Consolação', job: 'Bibliotecária', marital: 'Casada', emergency: 'Otávio Prates (marido) · (11) 98110-6627', created: '2026-09-09 11:11', by: 'JES', tags: ['Nutrição', 'Retorno', 'Indicação'] },
  { key: 'P39', name: 'Márcia Lobo', gender: 'FEMALE', birth: '1968-12-12', origin: 'PHONE', city: 'São Paulo', state: 'SP', zip: '04012-000', address: 'Rua Pedro de Toledo, 1050 — Vila Clementino', job: 'Comerciante', marital: 'Casada', emergency: 'Rui Lobo (marido) · (11) 97632-8840', created: '2026-09-02 10:02', by: 'JES', tags: ['Paciente antigo'], status: 'INACTIVE', extra: 'Mudou-se para outra cidade — cadastro mantido inativo.' },
  { key: 'P40', name: 'Jorge Amaral', gender: 'MALE', birth: '1955-03-21', origin: 'WALK_IN', city: 'São Paulo', state: 'SP', zip: '05010-000', address: 'Rua Monte Alegre, 300 — Perdizes', job: 'Engenheiro aposentado', marital: 'Viúvo', emergency: 'Carla Amaral (filha) · (11) 98990-3366', created: '2026-09-02 15:40', by: 'JES', tags: ['Paciente antigo'], status: 'INACTIVE', extra: 'Sem retorno há mais de 12 meses.' },
];

// ---- Leads (contato da mensageria, ainda sem ficha de paciente) -------------
export const LEADS = [
  { key: 'L01', name: 'Sofia Rangel', channel: 'INSTAGRAM', created: '2026-10-05 21:14' },
  { key: 'L02', name: 'Márcio Leal', channel: 'WHATSAPP', created: '2026-10-06 08:31' },
  { key: 'L03', name: 'Yasmin Coutinho', channel: 'INSTAGRAM', created: '2026-10-01 18:40' },
  { key: 'L04', name: 'Otávio Brandão', channel: 'WHATSAPP', created: '2026-09-30 10:02' },
  { key: 'L05', name: 'Kelly Moraes', channel: 'WHATSAPP', created: '2026-09-26 15:47' },
  { key: 'L06', name: 'Júlia Peixoto', channel: 'WHATSAPP', created: '2026-10-04 11:20' },
  { key: 'L07', name: 'Fábio Guimarães', channel: 'WHATSAPP', created: '2026-09-17 14:10' },
  { key: 'L08', name: 'Raquel Dantas', channel: 'INSTAGRAM', created: '2026-09-14 20:05' },
  { key: 'L09', name: 'Rafaela Campos', channel: 'WHATSAPP', created: '2026-09-29 12:33' },
];

// ---- Agenda -------------------------------------------------------------------
// [paciente, profissional, tipo, 'YYYY-MM-DD HH:MM', duração, status, notas?, modalidade?]
export type ApptStatus = 'PENDING' | 'CONFIRMED' | 'CANCELED' | 'RESCHEDULED' | 'ATTENDED' | 'NO_SHOW';
export type ApptSeed = [string, string, string, string, number, ApptStatus, string?, ('TELE' | undefined)?];

export const APPOINTMENTS: ApptSeed[] = [
  // ---- setembro (histórico)
  ['P09', 'AND', 'Retorno', '2026-09-04 09:00', 30, 'ATTENDED', 'Acompanhamento mensal.'],
  ['P07', 'BEA', 'Consulta', '2026-09-09 10:30', 45, 'ATTENDED', 'Primeira consulta. Trouxe exames de julho.'],
  ['P22', 'AND', 'Consulta', '2026-09-11 14:30', 45, 'ATTENDED', 'Retomada de acompanhamento.'],
  ['P02', 'BEA', 'Consulta', '2026-09-15 09:00', 60, 'ATTENDED', 'Primeira consulta.'],
  ['P03', 'AND', 'Consulta', '2026-09-16 11:30', 60, 'ATTENDED', 'Primeira consulta — indicação da Patrícia.'],
  ['P08', 'LAR', 'Consulta', '2026-09-17 15:30', 60, 'ATTENDED', 'Consulta nutricional inicial.'],
  ['P03', 'LAR', 'Consulta', '2026-09-18 10:30', 60, 'ATTENDED', 'Consulta nutricional do programa integrado.'],
  ['P04', 'CAR', 'Avaliação', '2026-09-19 13:30', 45, 'ATTENDED', 'Avaliação estética facial.'],
  ['P27', 'BEA', 'Consulta', '2026-09-22 16:30', 45, 'NO_SHOW', 'Não atendeu às ligações de confirmação.'],
  ['P30', 'AND', 'Consulta', '2026-09-23 09:00', 45, 'ATTENDED', 'Paciente antigo — revisão anual.'],
  ['P06', 'AND', 'Consulta', '2026-09-24 14:30', 60, 'ATTENDED', 'Primeira consulta.'],
  ['P31', 'CAR', 'Avaliação', '2026-09-25 17:30', 45, 'ATTENDED', 'Avaliação estética corporal.'],
  ['P04', 'CAR', 'Retorno', '2026-09-26 10:30', 60, 'ATTENDED', 'Procedimento Estético Facial — sessão 1/2.'],
  ['P11', 'CAR', 'Avaliação', '2026-09-29 11:30', 45, 'ATTENDED', 'Avaliação estética facial.'],
  ['P35', 'BEA', 'Consulta', '2026-09-29 15:30', 45, 'ATTENDED', 'Trouxe exames recentes de tireoide.'],
  ['P10', 'AND', 'Consulta', '2026-09-30 09:00', 45, 'ATTENDED', 'Teleconsulta — paciente de Campinas.', 'TELE'],
  ['P21', 'LAR', 'Consulta', '2026-09-30 13:30', 60, 'CANCELED', 'Paciente em viagem a trabalho.'],
  // ---- outubro, 01 a 06 (histórico recente)
  ['P05', 'AND', 'Exame', '2026-10-01 08:00', 90, 'ATTENDED', 'Check-up Integrado — jejum de 12h confirmado.'],
  ['P02', 'BEA', 'Retorno', '2026-10-01 10:30', 30, 'ATTENDED', 'Retorno por teleconsulta.', 'TELE'],
  ['P26', 'LAR', 'Consulta', '2026-10-01 13:30', 45, 'CANCELED', 'Teleconsulta cancelada — paciente preferiu presencial.', 'TELE'],
  ['P31', 'CAR', 'Retorno', '2026-10-01 14:30', 60, 'ATTENDED', 'Procedimento Estético Corporal — sessão 1/3.'],
  ['P09', 'AND', 'Retorno', '2026-10-02 09:00', 30, 'ATTENDED', 'Acompanhamento mensal.'],
  ['P12', 'BEA', 'Consulta', '2026-10-02 11:30', 60, 'ATTENDED', 'Primeira consulta — indicação.'],
  ['P03', 'LAR', 'Retorno', '2026-10-02 15:30', 30, 'ATTENDED', 'Retorno nutricional 1/4.'],
  ['P17', 'AND', 'Consulta', '2026-10-02 17:30', 45, 'ATTENDED', 'Primeira consulta.'],
  ['P01', 'AND', 'Consulta', '2026-10-05 09:00', 60, 'ATTENDED', 'Primeira consulta. Paciente solicitou confirmação por WhatsApp.'],
  ['P16', 'BEA', 'Consulta', '2026-10-05 10:30', 45, 'ATTENDED', 'Primeira consulta.'],
  ['P24', 'LAR', 'Consulta', '2026-10-05 14:30', 45, 'NO_SHOW', 'Não compareceu e não avisou.'],
  ['P28', 'AND', 'Consulta', '2026-10-05 16:30', 45, 'CANCELED', 'Paciente pediu para remarcar (compromisso de trabalho).'],
  ['P25', 'LAR', 'Consulta', '2026-10-06 08:00', 45, 'ATTENDED', 'Primeira consulta nutricional.'],
  ['P21', 'LAR', 'Consulta', '2026-10-06 09:00', 45, 'ATTENDED', 'Remarcada de 30/09.'],
  ['P32', 'AND', 'Consulta', '2026-10-06 11:30', 45, 'CONFIRMED', 'Primeira consulta. Confirmado por WhatsApp.'],
  ['P14', 'BEA', 'Retorno', '2026-10-06 14:30', 30, 'CONFIRMED', 'Retorno para discutir a proposta de acompanhamento.'],
  ['P33', 'CAR', 'Avaliação', '2026-10-06 16:30', 45, 'PENDING', 'Aguardando confirmação.'],
  ['P36', 'LAR', 'Consulta', '2026-10-06 18:30', 45, 'CONFIRMED', 'Primeira consulta.'],
  // ---- outubro, futuro
  ['P19', 'AND', 'Consulta', '2026-10-07 09:00', 60, 'CONFIRMED', 'Primeira consulta.'],
  ['P29', 'CAR', 'Avaliação', '2026-10-07 13:30', 45, 'PENDING', 'Lead do Instagram — avaliação facial.'],
  ['P37', 'BEA', 'Consulta', '2026-10-07 15:30', 45, 'CONFIRMED', 'Trazer exames recentes.'],
  ['P06', 'AND', 'Retorno', '2026-10-08 10:30', 30, 'CONFIRMED', 'Retorno do programa de emagrecimento.'],
  ['P26', 'LAR', 'Consulta', '2026-10-08 14:30', 45, 'PENDING', 'Paciente solicitou confirmação por WhatsApp.'],
  ['P20', 'AND', 'Consulta', '2026-10-08 16:30', 45, 'PENDING', 'Primeira consulta por teleconsulta.', 'TELE'],
  ['P07', 'BEA', 'Retorno', '2026-10-09 09:00', 30, 'PENDING', 'Retorno após 30 dias.'],
  ['P23', 'CAR', 'Avaliação', '2026-10-09 11:30', 45, 'CONFIRMED', 'Avaliação estética facial.'],
  ['P38', 'LAR', 'Retorno', '2026-10-09 15:30', 30, 'CONFIRMED', 'Retorno nutricional.'],
  ['P34', 'AND', 'Consulta', '2026-10-12 10:30', 45, 'PENDING', 'Primeira consulta — indicação.'],
  ['P11', 'CAR', 'Retorno', '2026-10-13 08:00', 60, 'CONFIRMED', 'Procedimento Estético Facial — sessão única.'],
  ['P13', 'AND', 'Retorno', '2026-10-14 09:00', 30, 'PENDING', 'Retorno para discutir a proposta.'],
  ['P01', 'AND', 'Retorno', '2026-10-15 10:30', 30, 'CONFIRMED', 'Retorno após 10 dias — reavaliação do plano.'],
  ['P31', 'CAR', 'Retorno', '2026-10-15 13:30', 60, 'CONFIRMED', 'Procedimento Estético Corporal — sessão 2/3.'],
  ['P08', 'LAR', 'Retorno', '2026-10-16 09:00', 30, 'CONFIRMED', 'Retorno nutricional.'],
  ['P18', 'BEA', 'Consulta', '2026-10-16 17:30', 45, 'RESCHEDULED', 'Remarcado a pedido do paciente (antes: 09/10).'],
  ['P35', 'BEA', 'Retorno', '2026-10-19 11:30', 30, 'PENDING', 'Trazer exames recentes.'],
  ['P30', 'AND', 'Retorno', '2026-10-19 15:30', 30, 'PENDING', 'Retorno por teleconsulta.', 'TELE'],
  ['P03', 'LAR', 'Retorno', '2026-10-20 10:30', 30, 'CONFIRMED', 'Retorno nutricional 2/4.'],
  ['P22', 'AND', 'Retorno', '2026-10-20 14:30', 30, 'PENDING', 'Retorno após 30 dias.'],
  ['P04', 'CAR', 'Retorno', '2026-10-21 09:00', 60, 'CONFIRMED', 'Procedimento Estético Facial — sessão 2/2.'],
  ['P27', 'BEA', 'Consulta', '2026-10-21 16:30', 45, 'PENDING', 'Reagendada após falta em 22/09.'],
  ['P05', 'AND', 'Retorno', '2026-10-22 08:00', 30, 'PENDING', 'Revisão dos exames do check-up.'],
  ['P36', 'LAR', 'Retorno', '2026-10-22 13:30', 30, 'PENDING', 'Retorno nutricional.'],
  ['P10', 'AND', 'Retorno', '2026-10-23 10:30', 30, 'CONFIRMED', 'Retorno por teleconsulta.', 'TELE'],
  ['P28', 'AND', 'Consulta', '2026-10-26 09:00', 45, 'PENDING', 'Remarcada (cancelou em 05/10).'],
  ['P33', 'CAR', 'Retorno', '2026-10-27 14:30', 45, 'PENDING', 'Retorno da avaliação estética.'],
  ['P25', 'LAR', 'Retorno', '2026-10-28 10:30', 30, 'PENDING', 'Retorno nutricional.'],
  ['P02', 'BEA', 'Retorno', '2026-10-29 15:30', 30, 'PENDING', 'Retorno mensal do acompanhamento.'],
  ['P09', 'AND', 'Retorno', '2026-10-30 09:00', 30, 'PENDING', 'Acompanhamento mensal.'],
  ['P24', 'LAR', 'Consulta', '2026-10-30 11:30', 45, 'PENDING', 'Reagendado após falta em 05/10.'],
];

// ---- CRM ----------------------------------------------------------------------
// stage = nome exato da etapa do pipeline padrão do sistema.
export interface DealSeed {
  title: string; who: string; source: 'WEBSITE' | 'REFERRAL' | 'PHONE' | 'WHATSAPP' | 'SOCIAL_MEDIA' | 'WALK_IN' | 'EMAIL' | 'OTHER';
  originLabel: string; stage: string; value: number; owner: string; priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  created: string; lastContact?: string; nextFollowUp?: string; closedAt?: string; lossReason?: string;
  path: [string, string][]; // [etapa, data] — histórico de movimentação
  description: string;
}

export const DEALS: DealSeed[] = [
  // ---- Fechados (jornadas completas)
  { title: 'Programa Nutrologia 3 meses — Mariana Almeida', who: 'P01', source: 'SOCIAL_MEDIA', originLabel: 'Instagram', stage: 'Fechado', value: 1890, owner: 'DIE', created: '2026-10-02 10:12', lastContact: '2026-10-05 11:20', closedAt: '2026-10-05 11:20', priority: 'HIGH',
    path: [['Contato iniciado', '2026-10-02 10:40'], ['Consulta agendada', '2026-10-03 09:15'], ['Compareceu', '2026-10-05 10:05'], ['Orçamento enviado', '2026-10-05 10:30'], ['Fechado', '2026-10-05 11:20']],
    description: 'Lead do Instagram (anúncio de emagrecimento saudável). Interesse em acompanhamento nutrológico.' },
  { title: 'Acompanhamento endocrinológico 6 meses — Carlos Martins', who: 'P02', source: 'WEBSITE', originLabel: 'Google Ads', stage: 'Fechado', value: 4000, owner: 'DIE', created: '2026-09-08 14:37', lastContact: '2026-09-17 16:00', closedAt: '2026-09-17 16:00', priority: 'HIGH',
    path: [['Contato iniciado', '2026-09-08 15:10'], ['Consulta agendada', '2026-09-09 10:00'], ['Compareceu', '2026-09-15 10:10'], ['Orçamento enviado', '2026-09-15 10:40'], ['Fechado', '2026-09-17 16:00']],
    description: 'Chegou pela campanha de Google Ads "endocrinologista São Paulo". Quer controle de peso e glicemia.' },
  { title: 'Programa integrado Nutrologia + Nutrição — Juliana Ferreira', who: 'P03', source: 'REFERRAL', originLabel: 'Indicação', stage: 'Fechado', value: 2640, owner: 'JES', created: '2026-09-10 09:21', lastContact: '2026-09-18 12:00', closedAt: '2026-09-18 12:00',
    path: [['Consulta agendada', '2026-09-10 09:30'], ['Compareceu', '2026-09-16 12:40'], ['Orçamento enviado', '2026-09-16 13:00'], ['Fechado', '2026-09-18 12:00']],
    description: 'Indicação da paciente Patrícia Gomes Silveira.' },
  { title: 'Protocolo facial bioestimulador — Ana Paula Ribeiro', who: 'P04', source: 'WEBSITE', originLabel: 'Google Ads', stage: 'Fechado', value: 3000, owner: 'DIE', created: '2026-09-12 16:05', lastContact: '2026-09-20 10:30', closedAt: '2026-09-20 10:30', priority: 'HIGH',
    path: [['Contato iniciado', '2026-09-12 16:30'], ['Consulta agendada', '2026-09-13 09:40'], ['Compareceu', '2026-09-19 14:20'], ['Orçamento enviado', '2026-09-19 14:40'], ['Fechado', '2026-09-20 10:30']],
    description: 'Campanha de Google Ads de estética facial. Deseja melhorar firmeza e textura da pele.' },
  { title: 'Check-up Integrado — Rodrigo Fernandes', who: 'P05', source: 'WHATSAPP', originLabel: 'WhatsApp', stage: 'Fechado', value: 1350, owner: 'JES', created: '2026-09-25 11:48', lastContact: '2026-09-27 09:30', closedAt: '2026-09-27 09:30',
    path: [['Contato iniciado', '2026-09-25 11:55'], ['Orçamento enviado', '2026-09-26 10:00'], ['Fechado', '2026-09-27 09:30']],
    description: 'Mensagem direta no WhatsApp pedindo check-up completo.' },
  { title: 'Programa de emagrecimento 4 meses — Camila Rocha', who: 'P06', source: 'SOCIAL_MEDIA', originLabel: 'Instagram', stage: 'Fechado', value: 3490, owner: 'DIE', created: '2026-09-18 19:02', lastContact: '2026-09-26 15:10', closedAt: '2026-09-26 15:10',
    path: [['Contato iniciado', '2026-09-19 09:05'], ['Consulta agendada', '2026-09-19 09:30'], ['Compareceu', '2026-09-24 15:40'], ['Orçamento enviado', '2026-09-24 16:00'], ['Fechado', '2026-09-26 15:10']],
    description: 'Respondeu ao story sobre emagrecimento com acompanhamento médico.' },
  { title: 'Acompanhamento endocrinológico 3 meses — Lucas Moreira', who: 'P07', source: 'WEBSITE', originLabel: 'Site', stage: 'Fechado', value: 1650, owner: 'JES', created: '2026-09-03 08:55', lastContact: '2026-09-10 11:00', closedAt: '2026-09-10 11:00',
    path: [['Consulta agendada', '2026-09-03 09:20'], ['Compareceu', '2026-09-09 11:30'], ['Orçamento enviado', '2026-09-09 11:45'], ['Fechado', '2026-09-10 11:00']],
    description: 'Formulário do site — queixa de cansaço e ganho de peso.' },
  { title: 'Plano nutricional trimestral — Fernanda Costa', who: 'P08', source: 'REFERRAL', originLabel: 'Indicação', stage: 'Fechado', value: 1240, owner: 'JES', created: '2026-09-15 10:30', lastContact: '2026-09-19 10:00', closedAt: '2026-09-19 10:00',
    path: [['Consulta agendada', '2026-09-15 10:40'], ['Compareceu', '2026-09-17 16:35'], ['Orçamento enviado', '2026-09-17 16:50'], ['Fechado', '2026-09-19 10:00']],
    description: 'Indicação de colega de trabalho.' },
  { title: 'Acompanhamento mensal outubro — Patrícia Silveira', who: 'P09', source: 'WALK_IN', originLabel: 'Paciente antigo', stage: 'Fechado', value: 590, owner: 'JES', created: '2026-10-01 09:00', lastContact: '2026-10-02 09:40', closedAt: '2026-10-02 09:40',
    path: [['Consulta agendada', '2026-10-01 09:05'], ['Compareceu', '2026-10-02 09:35'], ['Fechado', '2026-10-02 09:40']],
    description: 'Paciente antiga — renovação do acompanhamento mensal.' },
  { title: 'Teleconsulta + acompanhamento — Thiago Barbosa', who: 'P10', source: 'SOCIAL_MEDIA', originLabel: 'Instagram', stage: 'Fechado', value: 1560, owner: 'DIE', created: '2026-09-24 20:15', lastContact: '2026-10-01 10:00', closedAt: '2026-10-01 10:00',
    path: [['Contato iniciado', '2026-09-25 09:10'], ['Consulta agendada', '2026-09-25 09:40'], ['Compareceu', '2026-09-30 09:50'], ['Orçamento enviado', '2026-09-30 10:10'], ['Fechado', '2026-10-01 10:00']],
    description: 'Seguidor do perfil; mora em Campinas e prefere teleconsulta.' },
  { title: 'Protocolo facial revitalização — Bianca Cardoso', who: 'P11', source: 'WEBSITE', originLabel: 'Google Ads', stage: 'Fechado', value: 1650, owner: 'DIE', created: '2026-09-26 13:44', lastContact: '2026-09-30 17:20', closedAt: '2026-09-30 17:20',
    path: [['Contato iniciado', '2026-09-26 14:00'], ['Consulta agendada', '2026-09-26 14:10'], ['Compareceu', '2026-09-29 12:20'], ['Orçamento enviado', '2026-09-29 12:30'], ['Fechado', '2026-09-30 17:20']],
    description: 'Google Ads — busca por "bioestimulador de colágeno".' },
  { title: 'Check-up + endocrinologia — Eduardo Nogueira', who: 'P12', source: 'REFERRAL', originLabel: 'Indicação', stage: 'Fechado', value: 1600, owner: 'JES', created: '2026-09-29 10:05', lastContact: '2026-10-05 18:10', closedAt: '2026-10-05 18:10', priority: 'HIGH',
    path: [['Consulta agendada', '2026-09-29 10:15'], ['Compareceu', '2026-10-02 12:35'], ['Orçamento enviado', '2026-10-02 12:50'], ['Fechado', '2026-10-05 18:10']],
    description: 'Indicação do paciente Roberto Vasconcelos.' },
  { title: 'Protocolo corporal 3 sessões — Tatiane Ramos', who: 'P31', source: 'WEBSITE', originLabel: 'Google Ads', stage: 'Fechado', value: 2580, owner: 'DIE', created: '2026-09-21 12:09', lastContact: '2026-09-25 18:30', closedAt: '2026-09-25 18:30',
    path: [['Contato iniciado', '2026-09-21 12:20'], ['Consulta agendada', '2026-09-21 12:40'], ['Compareceu', '2026-09-25 18:15'], ['Orçamento enviado', '2026-09-25 18:20'], ['Fechado', '2026-09-25 18:30']],
    description: 'Google Ads — procedimento corporal.' },
  // ---- Orçamento enviado
  { title: 'Programa de emagrecimento — Luana Mendes', who: 'P13', source: 'SOCIAL_MEDIA', originLabel: 'Instagram', stage: 'Orçamento enviado', value: 2980, owner: 'DIE', created: '2026-09-20 18:22', lastContact: '2026-10-03 17:45', nextFollowUp: '2026-10-07 10:00',
    path: [['Contato iniciado', '2026-09-21 09:00'], ['Consulta agendada', '2026-09-22 10:00'], ['Compareceu', '2026-09-28 11:00'], ['Orçamento enviado', '2026-10-03 17:45']],
    description: 'Interessada no programa de 4 meses; avaliando forma de pagamento.' },
  { title: 'Check-up Integrado — Gustavo Alves', who: 'P14', source: 'WEBSITE', originLabel: 'Google Ads', stage: 'Orçamento enviado', value: 1890, owner: 'JES', created: '2026-09-22 09:58', lastContact: '2026-10-04 10:20', nextFollowUp: '2026-10-06 15:00', priority: 'HIGH',
    path: [['Contato iniciado', '2026-09-22 10:10'], ['Consulta agendada', '2026-09-23 11:00'], ['Compareceu', '2026-09-30 10:00'], ['Orçamento enviado', '2026-10-01 09:30']],
    description: 'Quer fechar o check-up após o retorno de hoje.' },
  // ---- Compareceu
  { title: 'Acompanhamento endocrinológico — Renato Siqueira', who: 'P16', source: 'WALK_IN', originLabel: 'Passagem', stage: 'Compareceu', value: 2250, owner: 'JES', created: '2026-10-01 16:40', lastContact: '2026-10-05 11:30', nextFollowUp: '2026-10-08 10:00',
    path: [['Consulta agendada', '2026-10-01 16:45'], ['Compareceu', '2026-10-05 11:20']],
    description: 'Passou na recepção pedindo informações; consulta realizada em 05/10. Orçamento em elaboração.' },
  { title: 'Programa nutrológico — Aline Duarte', who: 'P17', source: 'WHATSAPP', originLabel: 'WhatsApp', stage: 'Compareceu', value: 1890, owner: 'DIE', created: '2026-09-27 10:16', lastContact: '2026-10-02 18:30', nextFollowUp: '2026-10-07 14:00',
    path: [['Contato iniciado', '2026-09-27 10:20'], ['Consulta agendada', '2026-09-28 09:00'], ['Compareceu', '2026-10-02 18:25']],
    description: 'Realizou a consulta; aguardando decisão sobre o programa.' },
  // ---- Consulta agendada
  { title: 'Primeira consulta nutrologia — Priscila Carvalho', who: 'P19', source: 'SOCIAL_MEDIA', originLabel: 'Instagram', stage: 'Consulta agendada', value: 1890, owner: 'DIE', created: '2026-10-03 11:08', lastContact: '2026-10-04 09:30',
    path: [['Contato iniciado', '2026-10-03 11:20'], ['Consulta agendada', '2026-10-04 09:30']],
    description: 'Respondeu ao anúncio do Instagram; consulta marcada para 07/10.' },
  { title: 'Teleconsulta inicial — Felipe Santana', who: 'P20', source: 'WEBSITE', originLabel: 'Google Ads', stage: 'Consulta agendada', value: 1560, owner: 'DIE', created: '2026-10-02 21:30', lastContact: '2026-10-03 10:00',
    path: [['Contato iniciado', '2026-10-03 09:00'], ['Consulta agendada', '2026-10-03 10:00']],
    description: 'Mora em Sorocaba — teleconsulta agendada para 08/10.' },
  { title: 'Avaliação estética facial — Isabela Freitas', who: 'P23', source: 'SOCIAL_MEDIA', originLabel: 'Instagram', stage: 'Consulta agendada', value: 1650, owner: 'DIE', created: '2026-10-04 12:47', lastContact: '2026-10-05 10:15',
    path: [['Contato iniciado', '2026-10-04 13:00'], ['Consulta agendada', '2026-10-05 10:15']],
    description: 'Lead do Instagram — interesse em protocolo facial.' },
  // ---- Em negociação
  { title: 'Programa de emagrecimento — Kelly Moraes', who: 'L05', source: 'WHATSAPP', originLabel: 'WhatsApp', stage: 'Em negociação', value: 3490, owner: 'DIE', created: '2026-09-26 15:47', lastContact: '2026-10-05 16:20', nextFollowUp: '2026-10-07 11:00',
    path: [['Contato iniciado', '2026-09-26 16:00'], ['Em negociação', '2026-10-01 14:00']],
    description: 'Pediu condições de parcelamento; comparando com outra clínica.' },
  { title: 'Protocolo corporal — Rafaela Campos', who: 'L09', source: 'WEBSITE', originLabel: 'Google Ads', stage: 'Em negociação', value: 2070, owner: 'DIE', created: '2026-09-29 12:33', lastContact: '2026-10-04 11:10', nextFollowUp: '2026-10-08 10:00',
    path: [['Contato iniciado', '2026-09-29 12:40'], ['Em negociação', '2026-10-02 15:30']],
    description: 'Clicou no anúncio de procedimento corporal; quer agendar avaliação após o dia 15.' },
  // ---- Contato iniciado
  { title: 'Avaliação estética — Yasmin Coutinho', who: 'L03', source: 'SOCIAL_MEDIA', originLabel: 'Instagram', stage: 'Contato iniciado', value: 260, owner: 'DIE', created: '2026-10-01 18:40', lastContact: '2026-10-02 09:15', nextFollowUp: '2026-10-06 17:00',
    path: [['Contato iniciado', '2026-10-02 09:15']],
    description: 'Perguntou valores de avaliação estética pelo direct.' },
  { title: 'Consulta de nutrologia — Otávio Brandão', who: 'L04', source: 'WEBSITE', originLabel: 'Site', stage: 'Contato iniciado', value: 520, owner: 'JES', created: '2026-09-30 10:02', lastContact: '2026-10-01 10:30', nextFollowUp: '2026-10-05 10:00',
    path: [['Contato iniciado', '2026-10-01 10:30']],
    description: 'Formulário do site; retornou pedindo horários à noite.' },
  // ---- Lead novo
  { title: 'Lead Instagram — Sofia Rangel', who: 'L01', source: 'SOCIAL_MEDIA', originLabel: 'Instagram', stage: 'Lead novo', value: 520, owner: 'DIE', created: '2026-10-05 21:14', priority: 'MEDIUM', path: [],
    description: 'Mensagem no direct perguntando sobre consulta de nutrologia.' },
  { title: 'Lead Google Ads — Márcio Leal', who: 'L02', source: 'WEBSITE', originLabel: 'Google Ads', stage: 'Lead novo', value: 1350, owner: 'DIE', created: '2026-10-06 08:31', priority: 'HIGH', path: [],
    description: 'Chegou pelo anúncio de check-up executivo; pediu contato hoje.' },
  { title: 'Indicação — Júlia Peixoto', who: 'L06', source: 'REFERRAL', originLabel: 'Indicação', stage: 'Lead novo', value: 320, owner: 'JES', created: '2026-10-04 11:20', path: [],
    description: 'Indicada pela paciente Fernanda Costa — interesse em consulta nutricional.' },
  // ---- Perdidos
  { title: 'Protocolo corporal — Vanessa Teixeira', who: 'P15', source: 'SOCIAL_MEDIA', originLabel: 'Facebook', stage: 'Perdido', value: 3450, owner: 'DIE', created: '2026-09-16 15:30', lastContact: '2026-10-03 14:00', closedAt: '2026-10-03 14:00', lossReason: 'Preço',
    path: [['Contato iniciado', '2026-09-16 16:00'], ['Consulta agendada', '2026-09-17 10:00'], ['Compareceu', '2026-09-23 15:00'], ['Orçamento enviado', '2026-09-23 15:30'], ['Perdido', '2026-10-03 14:00']],
    description: 'Achou o protocolo acima do orçamento previsto.' },
  { title: 'Check-up — Fábio Guimarães', who: 'L07', source: 'OTHER', originLabel: 'Evento', stage: 'Perdido', value: 1350, owner: 'DIE', created: '2026-09-17 14:10', lastContact: '2026-09-29 10:00', closedAt: '2026-10-01 09:00', lossReason: 'Escolheu concorrente',
    path: [['Contato iniciado', '2026-09-17 15:00'], ['Em negociação', '2026-09-22 11:00'], ['Perdido', '2026-10-01 09:00']],
    description: 'Contato captado no evento "Saúde em Movimento". Fechou com clínica próxima ao trabalho.' },
  { title: 'Avaliação estética — Raquel Dantas', who: 'L08', source: 'SOCIAL_MEDIA', originLabel: 'Instagram', stage: 'Perdido', value: 260, owner: 'DIE', created: '2026-09-14 20:05', lastContact: '2026-09-19 10:00', closedAt: '2026-09-30 18:00', lossReason: 'Sem retorno',
    path: [['Contato iniciado', '2026-09-15 09:00'], ['Perdido', '2026-09-30 18:00']],
    description: 'Três tentativas de contato sem resposta.' },
];

// ---- Orçamentos ---------------------------------------------------------------
export interface QuoteSeed {
  key: string; patient: string; title: string; items: [string, number, number?][]; // [serviço, qtd, preço override]
  discount?: number; status: 'DRAFT' | 'SENT' | 'APPROVED' | 'REJECTED';
  created: string; sentAt?: string; decidedAt?: string; validDays?: number; notes?: string; by: string;
}

export const QUOTES: QuoteSeed[] = [
  { key: 'Q01', patient: 'P01', title: 'Programa Nutrologia — 3 meses', by: 'DIE', status: 'APPROVED', created: '2026-10-05 10:25', sentAt: '2026-10-05 10:30', decidedAt: '2026-10-05 11:20',
    items: [['Consulta de Nutrologia', 1], ['Avaliação Corporal (bioimpedância)', 1], ['Acompanhamento Mensal', 3, 360]], notes: 'Pagamento em 3x no PIX.' },
  { key: 'Q02', patient: 'P02', title: 'Acompanhamento Endocrinológico — 6 meses', by: 'DIE', status: 'APPROVED', created: '2026-09-15 10:35', sentAt: '2026-09-15 10:40', decidedAt: '2026-09-17 16:00', discount: 310,
    items: [['Consulta de Endocrinologia', 1], ['Acompanhamento Mensal', 6], ['Avaliação Corporal (bioimpedância)', 1]], notes: 'Desconto de fidelidade para o pacote semestral.' },
  { key: 'Q03', patient: 'P03', title: 'Programa Integrado Nutrologia + Nutrição', by: 'JES', status: 'APPROVED', created: '2026-09-16 12:55', sentAt: '2026-09-16 13:00', decidedAt: '2026-09-18 12:00',
    items: [['Consulta de Nutrologia', 1], ['Consulta Nutricional', 1], ['Retorno Nutricional', 4], ['Acompanhamento Mensal', 2, 480]] },
  { key: 'Q04', patient: 'P04', title: 'Protocolo Facial — Bioestimulador (2 sessões)', by: 'DIE', status: 'APPROVED', created: '2026-09-19 14:35', sentAt: '2026-09-19 14:40', decidedAt: '2026-09-20 10:30', discount: 220,
    items: [['Avaliação Estética', 1], ['Procedimento Estético Facial', 2]] },
  { key: 'Q05', patient: 'P05', title: 'Check-up Integrado', by: 'JES', status: 'APPROVED', created: '2026-09-26 09:55', sentAt: '2026-09-26 10:00', decidedAt: '2026-09-27 09:30',
    items: [['Check-up Integrado', 1]], notes: 'Inclui consulta, bioimpedância e painel laboratorial.' },
  { key: 'Q06', patient: 'P06', title: 'Programa de Emagrecimento — 4 meses', by: 'DIE', status: 'APPROVED', created: '2026-09-24 15:55', sentAt: '2026-09-24 16:00', decidedAt: '2026-09-26 15:10',
    items: [['Consulta de Nutrologia', 1], ['Avaliação Corporal (bioimpedância)', 1], ['Acompanhamento Mensal', 4], ['Consulta Nutricional', 1]], notes: 'Entrada de R$ 1.000,00 + 3 parcelas.' },
  { key: 'Q07', patient: 'P07', title: 'Acompanhamento Endocrinológico — 3 meses', by: 'JES', status: 'APPROVED', created: '2026-09-09 11:40', sentAt: '2026-09-09 11:45', decidedAt: '2026-09-10 11:00',
    items: [['Consulta de Endocrinologia', 1], ['Acompanhamento Mensal', 2, 585]] },
  { key: 'Q08', patient: 'P08', title: 'Plano Nutricional Trimestral', by: 'JES', status: 'APPROVED', created: '2026-09-17 16:45', sentAt: '2026-09-17 16:50', decidedAt: '2026-09-19 10:00',
    items: [['Consulta Nutricional', 1], ['Retorno Nutricional', 3], ['Avaliação Corporal (bioimpedância)', 1]] },
  { key: 'Q09', patient: 'P09', title: 'Acompanhamento Mensal — Outubro', by: 'JES', status: 'APPROVED', created: '2026-10-02 09:36', sentAt: '2026-10-02 09:37', decidedAt: '2026-10-02 09:40',
    items: [['Acompanhamento Mensal', 1]] },
  { key: 'Q10', patient: 'P10', title: 'Teleconsulta + Plano de Acompanhamento', by: 'DIE', status: 'APPROVED', created: '2026-09-30 10:05', sentAt: '2026-09-30 10:10', decidedAt: '2026-10-01 10:00',
    items: [['Teleconsulta', 1], ['Acompanhamento Mensal', 2]] },
  { key: 'Q11', patient: 'P11', title: 'Protocolo Facial — Revitalização', by: 'DIE', status: 'APPROVED', created: '2026-09-29 12:25', sentAt: '2026-09-29 12:30', decidedAt: '2026-09-30 17:20', discount: 90,
    items: [['Avaliação Estética', 1], ['Procedimento Estético Facial', 1]] },
  { key: 'Q12', patient: 'P12', title: 'Check-up Integrado + Retorno Endocrinológico', by: 'JES', status: 'APPROVED', created: '2026-10-02 12:45', sentAt: '2026-10-02 12:50', decidedAt: '2026-10-05 18:10',
    items: [['Check-up Integrado', 1], ['Consulta de Retorno', 1]] },
  { key: 'Q13', patient: 'P31', title: 'Protocolo Corporal — 3 sessões', by: 'DIE', status: 'APPROVED', created: '2026-09-25 18:16', sentAt: '2026-09-25 18:20', decidedAt: '2026-09-25 18:30',
    items: [['Avaliação Estética', 1], ['Procedimento Estético Corporal (sessão)', 3], ['Consulta de Retorno', 1]], notes: 'Pagamento em 6x.' },
  { key: 'Q14', patient: 'P13', title: 'Programa de Emagrecimento — 4 meses', by: 'DIE', status: 'SENT', created: '2026-10-03 17:40', sentAt: '2026-10-03 17:45', validDays: 15,
    items: [['Consulta de Nutrologia', 1], ['Acompanhamento Mensal', 4], ['Consulta Nutricional', 1, 100]], notes: 'Aguardando resposta da paciente sobre o parcelamento.' },
  { key: 'Q15', patient: 'P14', title: 'Check-up Integrado + Acompanhamento', by: 'JES', status: 'SENT', created: '2026-10-01 09:25', sentAt: '2026-10-01 09:30', validDays: 10,
    items: [['Check-up Integrado', 1], ['Consulta de Retorno', 1], ['Avaliação Corporal (bioimpedância)', 1]] },
  { key: 'Q16', patient: 'P15', title: 'Protocolo Corporal — 5 sessões', by: 'DIE', status: 'REJECTED', created: '2026-09-23 15:25', sentAt: '2026-09-23 15:30', decidedAt: '2026-10-03 14:00',
    items: [['Avaliação Estética', 1], ['Procedimento Estético Corporal (sessão)', 5, 638]], notes: 'Paciente informou que o valor ficou acima do previsto.' },
  { key: 'Q17', patient: 'P16', title: 'Acompanhamento Endocrinológico — 3 meses', by: 'JES', status: 'DRAFT', created: '2026-10-05 11:40',
    items: [['Consulta de Endocrinologia', 1], ['Acompanhamento Mensal', 3], ['Avaliação Corporal (bioimpedância)', 1, 0]], notes: 'Rascunho — revisar com a Dra. Beatriz antes de enviar.' },
  { key: 'Q18', patient: 'P17', title: 'Programa Nutrológico — 3 meses', by: 'DIE', status: 'SENT', created: '2026-10-03 10:00', sentAt: '2026-10-03 10:05', validDays: 15,
    items: [['Consulta de Nutrologia', 1], ['Avaliação Corporal (bioimpedância)', 1], ['Acompanhamento Mensal', 3, 360]] },
];

// ---- Contratos ------------------------------------------------------------------
// tpl: PROG (programa de acompanhamento) | EST (termo de procedimento estético)
export const CONTRACTS = [
  { quote: 'Q01', tpl: 'PROG', prof: 'AND', status: 'SIGNED', created: '2026-10-05 11:25', signedAt: '2026-10-05 11:40', method: 'IN_PERSON', by: 'JES', sig: 1 },
  { quote: 'Q02', tpl: 'PROG', prof: 'BEA', status: 'SIGNED', created: '2026-09-17 16:05', signedAt: '2026-09-17 16:20', method: 'IN_PERSON', by: 'JES', sig: 2 },
  { quote: 'Q03', tpl: 'PROG', prof: 'AND', status: 'SIGNED', created: '2026-09-18 12:05', signedAt: '2026-09-18 12:15', method: 'IN_PERSON', by: 'JES', sig: 3 },
  { quote: 'Q04', tpl: 'EST', prof: 'CAR', status: 'SIGNED', created: '2026-09-20 10:35', signedAt: '2026-09-23 09:10', method: 'REMOTE', by: 'DIE', sig: 4, sentAt: '2026-09-20 10:40', viewedAt: '2026-09-23 09:02' },
  { quote: 'Q05', tpl: 'PROG', prof: 'AND', status: 'SIGNED', created: '2026-09-27 09:35', signedAt: '2026-09-27 10:05', method: 'REMOTE', by: 'JES', sig: 1, sentAt: '2026-09-27 09:40', viewedAt: '2026-09-27 10:01' },
  { quote: 'Q06', tpl: 'PROG', prof: 'AND', status: 'SIGNED', created: '2026-09-26 15:15', signedAt: '2026-09-26 15:30', method: 'IN_PERSON', by: 'JES', sig: 2 },
  { quote: 'Q07', tpl: 'PROG', prof: 'BEA', status: 'SIGNED', created: '2026-09-10 11:05', signedAt: '2026-09-10 11:20', method: 'IN_PERSON', by: 'JES', sig: 3 },
  { quote: 'Q08', tpl: 'PROG', prof: 'LAR', status: 'SIGNED', created: '2026-09-19 10:05', signedAt: '2026-09-19 10:20', method: 'IN_PERSON', by: 'JES', sig: 4 },
  { quote: 'Q10', tpl: 'PROG', prof: 'AND', status: 'SIGNED', created: '2026-10-01 10:05', signedAt: '2026-10-01 12:40', method: 'REMOTE', by: 'DIE', sig: 1, sentAt: '2026-10-01 10:10', viewedAt: '2026-10-01 12:31' },
  { quote: 'Q11', tpl: 'EST', prof: 'CAR', status: 'SIGNED', created: '2026-09-30 17:25', signedAt: '2026-10-01 09:15', method: 'REMOTE', by: 'DIE', sig: 2, sentAt: '2026-09-30 17:30', viewedAt: '2026-10-01 09:08' },
  { quote: 'Q13', tpl: 'EST', prof: 'CAR', status: 'SIGNED', created: '2026-09-25 18:32', signedAt: '2026-09-25 18:45', method: 'IN_PERSON', by: 'JES', sig: 3 },
  { quote: 'Q12', tpl: 'PROG', prof: 'BEA', status: 'SENT', created: '2026-10-05 18:15', sentAt: '2026-10-05 18:20', by: 'JES' },
  { quote: 'Q14', tpl: 'PROG', prof: 'AND', status: 'DRAFT', created: '2026-10-04 09:10', by: 'DIE' },
] as const;

// ---- Recebíveis (cadeia Orçamento → Contrato → Receita → Parcela → Pagamento) ---
// plan: parcelas [vencimento, valor]; pay: [parcela#, valor, método, data]
export const RECEIVABLES = [
  { quote: 'Q01', contract: true, cat: 'Programa', issue: '2026-10-05 11:45', plan: [['2026-10-06', 630], ['2026-11-06', 630], ['2026-12-06', 630]], pay: [[1, 630, 'PIX', '2026-10-06 09:12']] },
  { quote: 'Q02', contract: true, cat: 'Programa', issue: '2026-09-17 16:25', plan: [['2026-09-17', 666.66], ['2026-10-17', 666.66], ['2026-11-17', 666.67], ['2026-12-17', 666.67], ['2027-01-17', 666.67], ['2027-02-17', 666.67]], pay: [[1, 666.66, 'CARTAO_CREDITO', '2026-09-17 16:30']] },
  { quote: 'Q03', contract: true, cat: 'Programa', issue: '2026-09-18 12:20', plan: [['2026-09-18', 880], ['2026-10-18', 880], ['2026-11-18', 880]], pay: [[1, 880, 'CARTAO_DEBITO', '2026-09-18 12:25']] },
  { quote: 'Q04', contract: true, cat: 'Procedimento', issue: '2026-09-23 09:15', plan: [['2026-09-23', 1500], ['2026-10-23', 1500]], pay: [[1, 1500, 'CARTAO_CREDITO', '2026-09-23 09:20']] },
  { quote: 'Q05', contract: true, cat: 'Exame', issue: '2026-09-27 10:10', plan: [['2026-10-01', 1350]], pay: [[1, 1350, 'PIX', '2026-10-01 08:05']] },
  { quote: 'Q06', contract: true, cat: 'Programa', issue: '2026-09-26 15:35', plan: [['2026-09-26', 1000], ['2026-10-26', 830], ['2026-11-26', 830], ['2026-12-26', 830]], pay: [[1, 1000, 'PIX', '2026-09-26 15:40']] },
  { quote: 'Q07', contract: true, cat: 'Programa', issue: '2026-09-10 11:25', plan: [['2026-09-12', 550], ['2026-10-01', 550], ['2026-11-01', 550]], pay: [[1, 550, 'BOLETO', '2026-09-12 14:03']] },
  { quote: 'Q08', contract: true, cat: 'Programa', issue: '2026-09-19 10:25', plan: [['2026-09-19', 620], ['2026-10-19', 620]], pay: [[1, 620, 'PIX', '2026-09-19 10:30'], [2, 300, 'PIX', '2026-10-03 17:40']] },
  { quote: 'Q09', contract: false, cat: 'Consulta', issue: '2026-10-02 09:42', plan: [['2026-10-02', 590]], pay: [[1, 590, 'CARTAO_DEBITO', '2026-10-02 09:45']] },
  { quote: 'Q10', contract: true, cat: 'Programa', issue: '2026-10-01 12:45', plan: [['2026-10-01', 780], ['2026-11-01', 780]], pay: [[1, 780, 'PIX', '2026-10-01 12:50']] },
  { quote: 'Q11', contract: true, cat: 'Procedimento', issue: '2026-10-01 09:20', plan: [['2026-10-01', 1650]], pay: [[1, 1650, 'CARTAO_CREDITO', '2026-10-01 09:25']] },
  { quote: 'Q13', contract: true, cat: 'Procedimento', issue: '2026-09-25 18:50', plan: [['2026-09-25', 430], ['2026-10-25', 430], ['2026-11-25', 430], ['2026-12-25', 430], ['2027-01-25', 430], ['2027-02-25', 430]], pay: [[1, 430, 'PIX', '2026-09-25 18:55']] },
] as const;

// Atendimentos avulsos faturados pela Agenda (origem ATENDIMENTO).
// [paciente, 'data hora' do atendimento, valor, descrição, vencimento, pagamento? [método, data]]
export const APPT_BILLING: [string, string, number, string, string, [string, string]?][] = [
  ['P22', '2026-09-11 14:30', 450, 'Consulta Médica Inicial — Dr. André Lacerda', '2026-09-11', ['PIX', '2026-09-11 15:20']],
  ['P30', '2026-09-23 09:00', 450, 'Consulta Médica Inicial — Dr. André Lacerda', '2026-09-23', ['CARTAO_CREDITO', '2026-09-23 09:50']],
  ['P35', '2026-09-29 15:30', 480, 'Consulta de Endocrinologia — Dra. Beatriz Monteiro', '2026-09-29', ['DINHEIRO', '2026-09-29 16:20']],
  ['P17', '2026-10-02 17:30', 520, 'Consulta de Nutrologia — Dr. André Lacerda', '2026-10-02', ['PIX', '2026-10-02 18:20']],
  ['P12', '2026-10-02 11:30', 480, 'Consulta de Endocrinologia — Dra. Beatriz Monteiro', '2026-10-02', ['CARTAO_DEBITO', '2026-10-02 12:40']],
  ['P16', '2026-10-05 10:30', 480, 'Consulta de Endocrinologia — Dra. Beatriz Monteiro', '2026-10-10'],
  ['P25', '2026-10-06 08:00', 320, 'Consulta Nutricional — Larissa Prado', '2026-10-06', ['PIX', '2026-10-06 08:50']],
  ['P21', '2026-10-06 09:00', 320, 'Consulta Nutricional — Larissa Prado', '2026-10-06'],
  ['P27', '2026-09-22 16:30', 0, '', ''], // falta (sem cobrança) — mantido só como documentação
].filter((b) => b[2] > 0) as any;

// ---- Contas a pagar -------------------------------------------------------------
export const SUPPLIERS = [
  { name: 'Vértice Administração Predial', document: null, email: 'financeiro@vertice-predial.demo', phone: '1133042210', notes: 'Locação do conjunto 3º andar.' },
  { name: 'Clarim Marketing Digital', document: null, email: 'contato@clarim-mkt.demo', phone: '11988120456', notes: 'Gestão de tráfego pago e Instagram.' },
  { name: 'MedSuprimentos Hospitalares', document: null, email: 'vendas@medsuprimentos.demo', phone: '1130215588', notes: 'Descartáveis e insumos clínicos.' },
  { name: 'Dermavance Distribuidora', document: null, email: 'pedidos@dermavance.demo', phone: '1132017744', notes: 'Bioestimuladores e insumos estéticos.' },
  { name: 'ConectaNet Fibra', document: null, email: 'suporte@conectanet.demo', phone: '1140207788', notes: 'Internet dedicada 600 Mb.' },
  { name: 'Boot Clinic', document: null, email: 'financeiro@bootclinic.demo', phone: null, notes: 'Assinatura do sistema de gestão.' },
  { name: 'Brilho Total Serviços de Limpeza', document: null, email: 'contato@brilhototal.demo', phone: '11977203315', notes: 'Limpeza diária e higienização das salas.' },
  { name: 'LabVita Análises Clínicas', document: null, email: 'convenios@labvita.demo', phone: '1131104420', notes: 'Laboratório parceiro do check-up integrado.' },
  { name: 'Papelaria Central Office', document: null, email: 'vendas@centraloffice.demo', phone: '1132290110', notes: 'Material de escritório.' },
];

// [descrição, fornecedor, categoria, centro de custo, valor, emissão, vencimento, pagamento? [método, data]]
export const PAYABLES: [string, string, string, string, number, string, string, [string, string]?][] = [
  ['Aluguel — setembro/2026', 'Vértice Administração Predial', 'Aluguel', 'Administrativo', 8500, '2026-09-01', '2026-09-05', ['TRANSFERENCIA', '2026-09-05 10:00']],
  ['Aluguel — outubro/2026', 'Vértice Administração Predial', 'Aluguel', 'Administrativo', 8500, '2026-10-01', '2026-10-05', ['TRANSFERENCIA', '2026-10-05 09:40']],
  ['Google Ads — setembro/2026', 'Clarim Marketing Digital', 'Marketing', 'Marketing', 2400, '2026-09-01', '2026-09-10', ['CARTAO_CREDITO', '2026-09-10 11:00']],
  ['Gestão de Instagram — setembro/2026', 'Clarim Marketing Digital', 'Marketing', 'Marketing', 1800, '2026-09-01', '2026-09-15', ['PIX', '2026-09-15 14:20']],
  ['Google Ads — outubro/2026', 'Clarim Marketing Digital', 'Marketing', 'Marketing', 2600, '2026-10-01', '2026-10-10'],
  ['Gestão de Instagram — outubro/2026', 'Clarim Marketing Digital', 'Marketing', 'Marketing', 1800, '2026-10-01', '2026-10-15'],
  ['Material clínico — descartáveis e eletrodos de bioimpedância', 'MedSuprimentos Hospitalares', 'Material clínico', 'Clínica', 1236.4, '2026-09-14', '2026-09-20', ['BOLETO', '2026-09-19 16:10']],
  ['Bioestimuladores — reposição de estoque', 'Dermavance Distribuidora', 'Material clínico', 'Estética', 4380, '2026-10-01', '2026-10-15'],
  ['Internet fibra — setembro/2026', 'ConectaNet Fibra', 'Infraestrutura', 'Administrativo', 249.9, '2026-09-01', '2026-09-08', ['BOLETO', '2026-09-08 09:30']],
  ['Internet fibra — outubro/2026', 'ConectaNet Fibra', 'Infraestrutura', 'Administrativo', 249.9, '2026-10-01', '2026-10-08'],
  ['Software de gestão — setembro/2026', 'Boot Clinic', 'Software', 'Administrativo', 397, '2026-09-01', '2026-09-10', ['CARTAO_CREDITO', '2026-09-10 08:00']],
  ['Software de gestão — outubro/2026', 'Boot Clinic', 'Software', 'Administrativo', 397, '2026-10-01', '2026-10-10'],
  ['Limpeza — setembro/2026', 'Brilho Total Serviços de Limpeza', 'Limpeza', 'Administrativo', 1450, '2026-09-25', '2026-09-30', ['PIX', '2026-09-30 17:00']],
  ['Limpeza — outubro/2026', 'Brilho Total Serviços de Limpeza', 'Limpeza', 'Administrativo', 1450, '2026-10-25', '2026-10-30'],
  ['Laboratório — exames do check-up (Rodrigo Fernandes)', 'LabVita Análises Clínicas', 'Laboratório', 'Clínica', 680, '2026-09-28', '2026-10-03'],
  ['Material de escritório — papel, toner e etiquetas', 'Papelaria Central Office', 'Material de escritório', 'Administrativo', 312.75, '2026-09-16', '2026-09-18', ['PIX', '2026-09-18 10:15']],
  ['Contabilidade — honorários de setembro', null as any, 'Outros', 'Administrativo', 950, '2026-10-01', '2026-10-12'],
];

// ---- Tarefas e follow-ups -----------------------------------------------------
// [título, descrição, tipo, categoria, prioridade, status, vencimento, responsável, criado, paciente?, deal(título)?, concluída em?]
export type TaskSeed = [string, string, 'FOLLOW_UP' | 'TASK' | 'REMINDER', string, 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT',
  'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED', string, string, string, string?, string?, string?];

export const TASKS: TaskSeed[] = [
  // ---- follow-ups comerciais / de paciente
  ['Confirmar consulta da Mariana Almeida', 'Confirmar a primeira consulta de 05/10 pelo WhatsApp.', 'FOLLOW_UP', 'PACIENTE', 'MEDIUM', 'COMPLETED', '2026-10-04 10:00', 'JES', '2026-10-03 09:20', 'P01', 'Programa Nutrologia 3 meses — Mariana Almeida', '2026-10-04 09:47'],
  ['Retornar paciente Mariana Almeida', 'Ligar para saber como foram os primeiros dias do plano alimentar.', 'FOLLOW_UP', 'PACIENTE', 'MEDIUM', 'PENDING', '2026-10-09 15:00', 'JES', '2026-10-05 11:50', 'P01'],
  ['Retornar proposta — Luana Mendes', 'Paciente pediu para pensar no parcelamento. Retomar contato.', 'FOLLOW_UP', 'COMERCIAL', 'HIGH', 'PENDING', '2026-10-07 10:00', 'DIE', '2026-10-03 17:50', 'P13', 'Programa de emagrecimento — Luana Mendes'],
  ['Enviar orçamento revisado — Gustavo Alves', 'Incluir bioimpedância no check-up, conforme pedido no retorno.', 'FOLLOW_UP', 'COMERCIAL', 'HIGH', 'IN_PROGRESS', '2026-10-06 17:00', 'JES', '2026-10-04 10:25', 'P14', 'Check-up Integrado — Gustavo Alves'],
  ['Enviar orçamento — Renato Siqueira', 'Finalizar rascunho com a Dra. Beatriz e enviar ao paciente.', 'FOLLOW_UP', 'COMERCIAL', 'MEDIUM', 'PENDING', '2026-10-08 10:00', 'JES', '2026-10-05 11:45', 'P16', 'Acompanhamento endocrinológico — Renato Siqueira'],
  ['Retomar decisão — Aline Duarte', 'Aguardando decisão sobre o programa nutrológico.', 'FOLLOW_UP', 'COMERCIAL', 'MEDIUM', 'PENDING', '2026-10-07 14:00', 'DIE', '2026-10-03 10:10', 'P17', 'Programa nutrológico — Aline Duarte'],
  ['Paciente pediu contato na próxima semana — Kelly Moraes', 'Retomar negociação do programa de emagrecimento com condição especial de parcelamento.', 'FOLLOW_UP', 'COMERCIAL', 'HIGH', 'PENDING', '2026-10-07 11:00', 'DIE', '2026-10-01 14:05', undefined, 'Programa de emagrecimento — Kelly Moraes'],
  ['Retomar lead sem resposta — Otávio Brandão', 'Segunda tentativa de contato; oferecer horário noturno.', 'FOLLOW_UP', 'COMERCIAL', 'MEDIUM', 'PENDING', '2026-10-05 10:00', 'JES', '2026-10-01 10:35', undefined, 'Consulta de nutrologia — Otávio Brandão'],
  ['Entrar em contato com lead do Instagram — Sofia Rangel', 'Responder direct e oferecer horários da semana.', 'FOLLOW_UP', 'COMERCIAL', 'HIGH', 'PENDING', '2026-10-06 12:00', 'DIE', '2026-10-05 21:20', undefined, 'Lead Instagram — Sofia Rangel'],
  ['Ligar para lead do Google Ads — Márcio Leal', 'Lead pediu contato ainda hoje pela manhã.', 'FOLLOW_UP', 'COMERCIAL', 'URGENT', 'PENDING', '2026-10-06 11:00', 'DIE', '2026-10-06 08:35', undefined, 'Lead Google Ads — Márcio Leal'],
  ['Enviar valores de avaliação — Yasmin Coutinho', 'Enviar tabela de avaliação estética pelo direct.', 'FOLLOW_UP', 'COMERCIAL', 'LOW', 'PENDING', '2026-10-06 17:00', 'DIE', '2026-10-02 09:20', undefined, 'Avaliação estética — Yasmin Coutinho'],
  ['Confirmar procedimento de terça — Bianca Cardoso', 'Confirmar sessão de 13/10 e reforçar orientações pré-procedimento.', 'FOLLOW_UP', 'PACIENTE', 'MEDIUM', 'PENDING', '2026-10-12 10:00', 'JES', '2026-10-01 09:30', 'P11'],
  ['Verificar exames — Rodrigo Fernandes', 'Conferir se os resultados do LabVita chegaram para o retorno de 22/10.', 'FOLLOW_UP', 'PACIENTE', 'MEDIUM', 'IN_PROGRESS', '2026-10-15 10:00', 'JES', '2026-10-01 10:00', 'P05'],
  ['Agendar retorno — Roberto Vasconcelos', 'Paciente sem retorno marcado após a consulta de setembro.', 'FOLLOW_UP', 'PACIENTE', 'MEDIUM', 'COMPLETED', '2026-09-25 10:00', 'JES', '2026-09-12 09:00', 'P22', undefined, '2026-09-26 11:12'],
  ['Reagendar falta — Simone Arruda', 'Paciente faltou em 22/09. Oferecer novo horário.', 'FOLLOW_UP', 'PACIENTE', 'MEDIUM', 'COMPLETED', '2026-09-24 10:00', 'JES', '2026-09-22 17:30', 'P27', undefined, '2026-09-24 15:40'],
  ['Reagendar falta — Henrique Batista', 'Faltou em 05/10 sem aviso. Ligar e reagendar.', 'FOLLOW_UP', 'PACIENTE', 'HIGH', 'COMPLETED', '2026-10-06 10:00', 'JES', '2026-10-05 15:30', 'P24', undefined, '2026-10-06 09:20'],
  ['Pós-consulta — Juliana Ferreira', 'Enviar mensagem de acompanhamento após o retorno nutricional.', 'FOLLOW_UP', 'PACIENTE', 'LOW', 'COMPLETED', '2026-10-03 10:00', 'JES', '2026-10-02 16:10', 'P03', undefined, '2026-10-03 10:22'],
  ['Retomar proposta perdida — Vanessa Teixeira', 'Oferecer protocolo reduzido de 3 sessões em novembro.', 'FOLLOW_UP', 'COMERCIAL', 'LOW', 'PENDING', '2026-11-03 10:00', 'DIE', '2026-10-03 14:05', 'P15'],
  ['Confirmar teleconsulta — Felipe Santana', 'Enviar link e orientações da teleconsulta de 08/10.', 'FOLLOW_UP', 'PACIENTE', 'MEDIUM', 'PENDING', '2026-10-07 16:00', 'JES', '2026-10-03 10:05', 'P20', 'Teleconsulta inicial — Felipe Santana'],
  ['Solicitar documentos — Eduardo Nogueira', 'Assinatura do contrato pendente; reenviar link e pedir documento com foto.', 'FOLLOW_UP', 'ADMINISTRATIVO', 'HIGH', 'PENDING', '2026-10-07 09:00', 'JES', '2026-10-05 18:25', 'P12', 'Check-up + endocrinologia — Eduardo Nogueira'],
  ['Retornar contato — Raquel Dantas', 'Terceira tentativa de contato sem resposta.', 'FOLLOW_UP', 'COMERCIAL', 'LOW', 'CANCELED', '2026-09-30 10:00', 'DIE', '2026-09-19 10:05', undefined, 'Avaliação estética — Raquel Dantas'],
  // ---- tarefas operacionais
  ['Confirmar agenda de amanhã', 'Confirmar por WhatsApp todos os pacientes de 07/10.', 'TASK', 'OPERACIONAL', 'HIGH', 'IN_PROGRESS', '2026-10-06 17:00', 'JES', '2026-10-06 08:05'],
  ['Conferir pagamentos da semana', 'Conciliar PIX e cartões recebidos entre 29/09 e 03/10.', 'TASK', 'FINANCEIRO', 'MEDIUM', 'COMPLETED', '2026-10-03 18:00', 'REN', '2026-09-29 09:00', undefined, undefined, '2026-10-03 17:35'],
  ['Cobrar parcela vencida — Lucas Moreira', 'Parcela 2/3 venceu em 01/10. Enviar lembrete e segunda via.', 'TASK', 'FINANCEIRO', 'HIGH', 'PENDING', '2026-10-03 12:00', 'REN', '2026-10-02 09:10', 'P07'],
  ['Conferir saldo da parcela — Fernanda Costa', 'Paciente pagou R$ 300,00 da parcela 2/2. Combinar o restante.', 'TASK', 'FINANCEIRO', 'MEDIUM', 'PENDING', '2026-10-10 12:00', 'REN', '2026-10-03 17:45', 'P08'],
  ['Pagar boleto do laboratório LabVita', 'Boleto dos exames do check-up venceu em 03/10.', 'TASK', 'FINANCEIRO', 'HIGH', 'PENDING', '2026-10-03 12:00', 'REN', '2026-09-28 10:00'],
  ['Preparar sala de procedimento', 'Separar materiais para as sessões de estética de 13/10.', 'TASK', 'OPERACIONAL', 'MEDIUM', 'PENDING', '2026-10-12 17:00', 'JES', '2026-10-05 09:00'],
  ['Revisar pacientes sem retorno agendado', 'Levantar pacientes atendidos em setembro sem retorno marcado.', 'TASK', 'OPERACIONAL', 'MEDIUM', 'IN_PROGRESS', '2026-10-09 18:00', 'JES', '2026-10-01 08:30'],
  ['Reagendar consulta — Bruno Tavares', 'Paciente cancelou em 05/10; oferecer horários na última semana do mês.', 'TASK', 'OPERACIONAL', 'MEDIUM', 'COMPLETED', '2026-10-06 12:00', 'JES', '2026-10-05 16:40', 'P28', undefined, '2026-10-06 08:55'],
  ['Repor estoque de bioestimuladores', 'Pedido feito à Dermavance — conferir entrega.', 'TASK', 'ADMINISTRATIVO', 'MEDIUM', 'COMPLETED', '2026-10-02 18:00', 'REN', '2026-09-30 11:00', undefined, undefined, '2026-10-02 16:20'],
  ['Publicar campanha de outubro no Instagram', 'Aprovar artes da campanha "Outubro em equilíbrio" com a agência.', 'TASK', 'MARKETING', 'MEDIUM', 'COMPLETED', '2026-10-01 12:00', 'DIE', '2026-09-26 10:00', undefined, undefined, '2026-10-01 11:05'],
  ['Atualizar tabela de preços 2027', 'Revisar valores dos programas para o próximo ano.', 'TASK', 'ADMINISTRATIVO', 'LOW', 'PENDING', '2026-10-30 18:00', 'REN', '2026-10-02 15:00'],
  ['Revisar prontuários pendentes de assinatura', 'Conferir evoluções da semana antes do fechamento.', 'TASK', 'OPERACIONAL', 'LOW', 'PENDING', '2026-10-09 18:00', 'AND', '2026-10-05 18:00'],
  ['Calibrar balança de bioimpedância', 'Calibração mensal da balança da Sala 02.', 'TASK', 'OPERACIONAL', 'LOW', 'COMPLETED', '2026-09-30 12:00', 'LAR', '2026-09-25 09:00', undefined, undefined, '2026-09-30 08:40'],
  ['Fechamento financeiro de setembro', 'Conferir recebidos x previstos e despesas do mês.', 'TASK', 'FINANCEIRO', 'HIGH', 'COMPLETED', '2026-10-02 18:00', 'REN', '2026-09-30 17:00', undefined, undefined, '2026-10-02 17:50'],
  ['Enviar relatório de leads para a agência', 'Exportar leads de setembro por origem.', 'TASK', 'MARKETING', 'LOW', 'PENDING', '2026-10-08 12:00', 'DIE', '2026-10-05 10:00'],
  ['Renovar alvará da vigilância sanitária', 'Separar documentos para renovação anual.', 'REMINDER', 'ADMINISTRATIVO', 'MEDIUM', 'PENDING', '2026-10-20 12:00', 'REN', '2026-09-15 10:00'],
];

// ---- Mensageria ------------------------------------------------------------------
// [direção: 'in' | 'out', texto, 'data hora', autor (out)]
export const CONVERSATIONS: { who: string; channel: 'WHATSAPP' | 'INSTAGRAM'; entry?: string; status?: string; unread?: number;
  msgs: ['in' | 'out', string, string, string?][] }[] = [
  { who: 'P01', channel: 'WHATSAPP', msgs: [
    ['in', 'Olá, gostaria de saber se vocês têm horário para consulta essa semana.', '2026-10-02 10:14'],
    ['out', 'Olá, Mariana! Temos sim. Posso verificar os horários disponíveis para você.', '2026-10-02 10:40', 'DIE'],
    ['in', 'Pode ser na segunda pela manhã?', '2026-10-02 10:52'],
    ['out', 'Temos às 9h com o Dr. André Lacerda. Posso reservar?', '2026-10-02 10:55', 'DIE'],
    ['in', 'Pode sim.', '2026-10-02 11:01'],
    ['out', 'Pronto! Consulta confirmada para segunda (05/10) às 9h. Chegue 10 minutos antes 😊', '2026-10-03 09:15', 'JES'],
    ['in', 'Obrigada! Já fiz o primeiro PIX do programa.', '2026-10-06 09:14'],
    ['out', 'Recebemos, Mariana! Seu retorno está marcado para 15/10 às 10h30.', '2026-10-06 09:20', 'JES'],
  ] },
  { who: 'P05', channel: 'WHATSAPP', status: 'CLOSED', msgs: [
    ['in', 'Boa tarde. Vocês fazem check-up completo? Quanto custa?', '2026-09-25 11:50'],
    ['out', 'Boa tarde, Rodrigo! Fazemos sim: o Check-up Integrado inclui consulta, bioimpedância e painel laboratorial. O valor é R$ 1.350,00.', '2026-09-25 11:55', 'JES'],
    ['in', 'Ótimo. Tem para a semana que vem?', '2026-09-25 12:10'],
    ['out', 'Temos quinta, 01/10, às 8h. É preciso jejum de 12 horas. Vou te enviar o orçamento.', '2026-09-25 12:14', 'JES'],
    ['in', 'Fechado, pode marcar.', '2026-09-26 10:20'],
    ['out', 'Agendado! Até quinta 😉', '2026-09-26 10:22', 'JES'],
  ] },
  { who: 'P06', channel: 'INSTAGRAM', entry: 'STORY_REPLY', msgs: [
    ['in', 'Oi! Vi o story de vocês sobre emagrecimento com acompanhamento médico. Como funciona?', '2026-09-18 19:04'],
    ['out', 'Oi, Camila! O programa começa com consulta de nutrologia e avaliação corporal. Posso te passar os detalhes pelo WhatsApp?', '2026-09-19 09:05', 'DIE'],
    ['in', 'Pode sim! Prefiro marcar na quinta à tarde.', '2026-09-19 09:20'],
    ['out', 'Temos quinta, 24/09, às 14h30 com o Dr. André. Posso reservar?', '2026-09-19 09:28', 'DIE'],
    ['in', 'Pode reservar 🙌', '2026-09-19 09:31'],
  ] },
  { who: 'P07', channel: 'WHATSAPP', unread: 1, msgs: [
    ['out', 'Olá, Lucas! Tudo bem? Identificamos que a parcela 2/3 do seu acompanhamento venceu em 01/10. Posso te enviar a segunda via?', '2026-10-02 09:15', 'JES'],
    ['in', 'Oi! Desculpa, esqueci completamente. Pode mandar sim.', '2026-10-02 12:40'],
    ['out', 'Enviado por e-mail. Qualquer dúvida estamos à disposição.', '2026-10-02 12:45', 'JES'],
    ['in', 'Vou pagar até sexta, tudo bem?', '2026-10-06 08:47'],
  ] },
  { who: 'P08', channel: 'WHATSAPP', msgs: [
    ['in', 'Bom dia! Consigo pagar R$ 300 agora da segunda parcela e o restante dia 10?', '2026-10-03 17:20'],
    ['out', 'Bom dia, Fernanda! Consegue sim. Já registramos o pagamento parcial.', '2026-10-03 17:42', 'REN'],
    ['in', 'Perfeito, obrigada!', '2026-10-03 17:50'],
  ] },
  { who: 'P13', channel: 'INSTAGRAM', entry: 'AD', unread: 2, msgs: [
    ['in', 'Oi! Recebi o orçamento do programa. Tem como parcelar em mais vezes?', '2026-10-03 18:30'],
    ['out', 'Oi, Luana! Conseguimos em até 6x. Quer que eu ajuste a proposta?', '2026-10-04 09:10', 'DIE'],
    ['in', 'Quero sim! Em 6x fica quanto por mês?', '2026-10-05 19:12'],
    ['in', 'E consigo começar ainda em outubro?', '2026-10-05 19:13'],
  ] },
  { who: 'P14', channel: 'WHATSAPP', msgs: [
    ['out', 'Olá, Gustavo! Lembrete: seu retorno com a Dra. Beatriz é hoje às 14h30.', '2026-10-06 08:30', 'JES'],
    ['in', 'Confirmado! Vou levar os exames.', '2026-10-06 08:41'],
  ] },
  { who: 'P15', channel: 'WHATSAPP', status: 'CLOSED', msgs: [
    ['out', 'Oi, Vanessa! Conseguiu avaliar a proposta do protocolo corporal?', '2026-10-01 10:00', 'DIE'],
    ['in', 'Oi! Infelizmente ficou acima do que eu posso investir agora.', '2026-10-03 13:50'],
    ['out', 'Entendemos! Se quiser, em novembro podemos montar um protocolo reduzido. Fico à disposição.', '2026-10-03 14:00', 'DIE'],
  ] },
  { who: 'P19', channel: 'INSTAGRAM', entry: 'AD', msgs: [
    ['in', 'Olá! Vi o anúncio. Vocês atendem nutrologia?', '2026-10-03 11:10'],
    ['out', 'Olá, Priscila! Atendemos sim, com o Dr. André Lacerda. Temos horário quarta (07/10) às 9h.', '2026-10-03 11:20', 'DIE'],
    ['in', 'Perfeito, pode marcar!', '2026-10-04 09:25'],
    ['out', 'Agendado! Enviaremos a confirmação na véspera. 😊', '2026-10-04 09:30', 'DIE'],
  ] },
  { who: 'P26', channel: 'WHATSAPP', unread: 1, msgs: [
    ['out', 'Olá, Daniel! Sua teleconsulta de hoje foi cancelada conforme solicitado. Remarcamos presencialmente para 08/10 às 14h30.', '2026-10-01 11:10', 'JES'],
    ['in', 'Obrigado! Vocês podem me confirmar um dia antes?', '2026-10-05 18:22'],
  ] },
  { who: 'L01', channel: 'INSTAGRAM', entry: 'POST_COMMENT', unread: 1, msgs: [
    ['in', 'Oi, quanto custa a consulta de nutrologia?', '2026-10-05 21:14'],
  ] },
  { who: 'L02', channel: 'WHATSAPP', entry: 'AD', unread: 2, msgs: [
    ['in', 'Bom dia, vim pelo anúncio do check-up executivo.', '2026-10-06 08:31'],
    ['in', 'Consegue me ligar ainda hoje de manhã?', '2026-10-06 08:32'],
  ] },
  { who: 'L03', channel: 'INSTAGRAM', entry: 'DIRECT', msgs: [
    ['in', 'Oi! Vocês fazem avaliação estética? Qual o valor?', '2026-10-01 18:40'],
    ['out', 'Oi, Yasmin! Fazemos sim — a avaliação é R$ 260,00 e pode ser abatida no protocolo. Quer agendar?', '2026-10-02 09:15', 'DIE'],
  ] },
  { who: 'L05', channel: 'WHATSAPP', msgs: [
    ['in', 'Oi! Queria entender melhor o programa de emagrecimento de 4 meses.', '2026-09-26 15:47'],
    ['out', 'Oi, Kelly! O programa inclui consultas, avaliação corporal e acompanhamento mensal. O investimento é R$ 3.490,00.', '2026-09-26 16:00', 'DIE'],
    ['in', 'Tem condição melhor no PIX? Estou comparando com outra clínica.', '2026-10-01 13:40'],
    ['out', 'Consigo uma condição especial à vista. Te mando os detalhes até amanhã.', '2026-10-01 14:00', 'DIE'],
    ['in', 'Combinado, aguardo!', '2026-10-05 16:20'],
  ] },
  { who: 'L09', channel: 'WHATSAPP', entry: 'AD', msgs: [
    ['in', 'Olá, vi o anúncio do procedimento corporal. Ainda tem a condição de lançamento?', '2026-09-29 12:33'],
    ['out', 'Olá, Rafaela! Temos sim, válida até o fim de outubro. Posso agendar sua avaliação?', '2026-09-29 12:40', 'DIE'],
    ['in', 'Prefiro depois do dia 15. Pode ser?', '2026-10-04 11:05'],
    ['out', 'Claro! Vou te mandar as opções de horário da segunda quinzena.', '2026-10-04 11:10', 'DIE'],
  ] },
];

export const QUICK_REPLIES = [
  { title: 'Confirmação de consulta', keyword: 'confirmacao', content: 'Olá! Passando para confirmar sua consulta na DOS CLINIC. Podemos manter o horário? Responda SIM para confirmar.' },
  { title: 'Lembrete de consulta', keyword: 'lembrete', content: 'Lembrete: sua consulta na DOS CLINIC é amanhã. Chegue com 10 minutos de antecedência. Até breve!' },
  { title: 'Retorno de orçamento', keyword: 'orcamento', content: 'Olá! Conseguiu avaliar o orçamento que enviamos? Fico à disposição para tirar dúvidas ou ajustar a forma de pagamento.' },
  { title: 'Pós-consulta', keyword: 'posconsulta', content: 'Olá! Como você está se sentindo após a consulta? Qualquer dúvida sobre as orientações, é só chamar por aqui.' },
  { title: 'Reativação de paciente', keyword: 'reativacao', content: 'Olá! Sentimos sua falta na DOS CLINIC. Que tal agendar um retorno para acompanharmos sua evolução?' },
  { title: 'Aniversário', keyword: 'aniversario', content: 'Feliz aniversário! 🎉 Toda a equipe da DOS CLINIC deseja um novo ciclo com muita saúde.' },
  { title: 'Confirmação de procedimento', keyword: 'procedimento', content: 'Olá! Confirmando seu procedimento na DOS CLINIC. Lembre-se das orientações pré-procedimento que enviamos.' },
];

// ---- Clínico -------------------------------------------------------------------
export const ANAMNESIS_TEMPLATES = [
  { key: 'NUTRO', name: 'Anamnese Nutrológica', specialty: 'Nutrologia', description: 'Histórico alimentar, metabólico e de hábitos de vida.', questions: [
    ['Queixa principal', 'TEXTAREA'], ['Objetivo do tratamento', 'SINGLE_CHOICE', ['Emagrecimento', 'Ganho de massa magra', 'Saúde metabólica', 'Performance esportiva']],
    ['Peso atual (kg)', 'NUMBER'], ['Altura (cm)', 'NUMBER'], ['Pratica atividade física?', 'BOOLEAN'],
    ['Frequência de atividade física', 'SINGLE_CHOICE', ['Nenhuma', '1-2x por semana', '3-4x por semana', '5x ou mais']],
    ['Qualidade do sono', 'SINGLE_CHOICE', ['Boa', 'Regular', 'Ruim']], ['Uso de medicamentos contínuos', 'TEXT'],
    ['Alergias ou intolerâncias alimentares', 'TEXT'], ['Histórico familiar relevante', 'TEXTAREA'],
  ] },
  { key: 'NUTRI', name: 'Anamnese Nutricional', specialty: 'Nutrição Clínica', description: 'Rotina alimentar e preferências para o plano nutricional.', questions: [
    ['Rotina alimentar (refeições/dia)', 'NUMBER'], ['Consumo de água (litros/dia)', 'NUMBER'],
    ['Preferências alimentares', 'TEXTAREA'], ['Alimentos que não consome', 'TEXT'], ['Consome bebida alcoólica?', 'BOOLEAN'],
    ['Funcionamento intestinal', 'SINGLE_CHOICE', ['Regular', 'Constipado', 'Irregular']], ['Expectativa com o acompanhamento', 'TEXTAREA'],
  ] },
  { key: 'EST', name: 'Anamnese Estética', specialty: 'Estética Avançada', description: 'Avaliação pré-procedimento facial e corporal.', questions: [
    ['Área de interesse', 'SINGLE_CHOICE', ['Facial', 'Corporal', 'Facial e corporal']], ['Queixa estética principal', 'TEXTAREA'],
    ['Já realizou procedimentos estéticos?', 'BOOLEAN'], ['Quais procedimentos e quando', 'TEXT'],
    ['Usa protetor solar diariamente?', 'BOOLEAN'], ['Gestante ou lactante?', 'BOOLEAN'], ['Alergias conhecidas', 'TEXT'],
  ] },
] as const;

// [paciente, modelo, título, data, por (staff), status, respostas (na ordem das perguntas), notas?]
export const ANAMNESES: [string, string, string, string, string, 'FILLED' | 'REVIEWED' | 'DRAFT', string[], string?][] = [
  ['P01', 'NUTRO', 'Anamnese nutrológica — primeira consulta', '2026-10-05 09:10', 'AND', 'REVIEWED',
    ['Dificuldade para perder peso após a gestação e cansaço no fim do dia.', 'Emagrecimento', '74.2', '165', 'Sim', '1-2x por semana', 'Regular', 'Não utiliza', 'Nenhuma conhecida', 'Mãe com hipotireoidismo.'],
    'Paciente motivada. Prefere refeições práticas por conta da rotina de trabalho.'],
  ['P02', 'NUTRO', 'Anamnese — avaliação metabólica', '2026-09-15 09:05', 'BEA', 'REVIEWED',
    ['Ganho de peso progressivo nos últimos 3 anos e glicemia limítrofe em exame de rotina.', 'Saúde metabólica', '96.8', '178', 'Não', 'Nenhuma', 'Ruim', 'Anti-hipertensivo (uso há 2 anos)', 'Nenhuma', 'Pai com diabetes tipo 2.']],
  ['P03', 'NUTRO', 'Anamnese nutrológica', '2026-09-16 11:35', 'AND', 'REVIEWED',
    ['Deseja melhorar disposição e composição corporal.', 'Ganho de massa magra', '61.5', '168', 'Sim', '3-4x por semana', 'Boa', 'Anticoncepcional oral', 'Lactose (leve)', 'Sem histórico relevante.']],
  ['P03', 'NUTRI', 'Anamnese nutricional', '2026-09-18 10:35', 'LAR', 'FILLED',
    ['5', '2', 'Gosta de preparações caseiras e frutas.', 'Fígado e jiló', 'Sim', 'Regular', 'Ter um plano que caiba na rotina de audiências.']],
  ['P06', 'NUTRO', 'Anamnese — programa de emagrecimento', '2026-09-24 14:35', 'AND', 'REVIEWED',
    ['Compulsão por doces à noite e sedentarismo.', 'Emagrecimento', '82.3', '163', 'Não', 'Nenhuma', 'Regular', 'Não utiliza', 'Nenhuma', 'Avó materna com diabetes.'],
    'Combinado início de caminhada 3x por semana.'],
  ['P08', 'NUTRI', 'Anamnese nutricional', '2026-09-17 15:35', 'LAR', 'REVIEWED',
    ['4', '1.5', 'Prefere refeições salgadas; gosta de cozinhar aos fins de semana.', 'Frutos do mar', 'Não', 'Constipado', 'Reduzir inchaço e organizar a alimentação.']],
  ['P04', 'EST', 'Anamnese estética facial', '2026-09-19 13:35', 'LAR', 'FILLED',
    ['Facial', 'Perda de firmeza e linhas finas na região malar.', 'Sim', 'Limpeza de pele profissional (2025)', 'Sim', 'Não', 'Nenhuma']],
  ['P11', 'EST', 'Anamnese estética — revitalização', '2026-09-29 11:35', 'LAR', 'FILLED',
    ['Facial', 'Textura irregular e manchas leves.', 'Não', '', 'Não', 'Não', 'Nenhuma'], 'Orientado uso diário de protetor solar.'],
  ['P31', 'EST', 'Anamnese estética corporal', '2026-09-25 17:35', 'LAR', 'FILLED',
    ['Corporal', 'Flacidez abdominal após emagrecimento.', 'Não', '', 'Sim', 'Não', 'Dipirona']],
  ['P12', 'NUTRO', 'Anamnese — check-up integrado', '2026-10-02 11:35', 'BEA', 'FILLED',
    ['Check-up anual solicitado pela empresa; refere estresse elevado.', 'Saúde metabólica', '88.0', '181', 'Sim', '1-2x por semana', 'Regular', 'Não utiliza', 'Nenhuma', 'Pai com infarto aos 62 anos.']],
  ['P17', 'NUTRO', 'Anamnese nutrológica', '2026-10-02 17:35', 'AND', 'DRAFT',
    ['Cansaço frequente e dificuldade de manter a dieta.', 'Saúde metabólica', '70.4', '160', 'Não', 'Nenhuma', 'Ruim', '', '', ''], 'Completar histórico familiar no retorno.'],
];

// [paciente, profissional, tipo, título, conteúdo, data]
export const RECORDS: [string, string, 'EVOLUTION' | 'OBSERVATION' | 'HISTORY' | 'PROCEDURE', string, string, string][] = [
  ['P01', 'AND', 'EVOLUTION', 'Consulta inicial — nutrologia', 'Queixa principal: dificuldade para perder peso e cansaço vespertino. Avaliação: IMC 27,3, sem sinais de alarme. Conduta: plano alimentar com déficit calórico moderado, hidratação de 2,5 L/dia e caminhada 3x/semana. Solicitados exames de rotina. Plano de acompanhamento: retorno em 10 dias e acompanhamento mensal por 3 meses.', '2026-10-05 09:55'],
  ['P02', 'BEA', 'EVOLUTION', 'Consulta inicial — endocrinologia', 'Paciente com ganho de peso progressivo e glicemia limítrofe em exame de rotina. Conduta: mudança de estilo de vida, plano alimentar com baixo índice glicêmico e atividade física supervisionada. Solicitado painel metabólico. Plano: acompanhamento mensal por 6 meses.', '2026-09-15 09:55'],
  ['P02', 'BEA', 'EVOLUTION', 'Retorno — teleconsulta', 'Paciente refere melhora da disposição e boa adesão ao plano alimentar. Redução de 2,4 kg no período. Exames dentro do esperado para a fase. Mantida conduta. Próximo retorno em 29/10.', '2026-10-01 10:58'],
  ['P03', 'AND', 'EVOLUTION', 'Consulta inicial — nutrologia', 'Objetivo de ganho de massa magra. Composição corporal adequada para o perfil. Conduta: ajuste proteico e distribuição de refeições. Encaminhada para nutrição clínica (programa integrado).', '2026-09-16 12:28'],
  ['P03', 'LAR', 'EVOLUTION', 'Consulta nutricional', 'Elaborado plano alimentar com 5 refeições/dia e opções práticas para a rotina de trabalho. Orientações sobre leitura de rótulos e substituições sem lactose.', '2026-09-18 11:25'],
  ['P03', 'LAR', 'EVOLUTION', 'Retorno nutricional 1/4', 'Boa adesão ao plano. Ajustadas as opções de lanche da tarde. Paciente relata mais disposição nos treinos.', '2026-10-02 15:58'],
  ['P04', 'CAR', 'PROCEDURE', 'Procedimento estético facial — sessão 1/2', 'Realizada aplicação de bioestimulador em região malar e mandibular, conforme protocolo. Procedimento bem tolerado. Orientações pós-procedimento entregues por escrito. Retorno para sessão 2 em 21/10.', '2026-09-26 11:25'],
  ['P04', 'CAR', 'OBSERVATION', 'Avaliação estética facial', 'Pele com perda leve de firmeza e linhas finas. Indicado protocolo de bioestimulação em 2 sessões com intervalo de 25 a 30 dias.', '2026-09-19 14:10'],
  ['P05', 'AND', 'HISTORY', 'Check-up Integrado', 'Realizados consulta clínica, bioimpedância e coleta laboratorial. Paciente assintomático. Sem alterações ao exame físico. Aguardando resultados laboratoriais para revisão em 22/10.', '2026-10-01 09:25'],
  ['P06', 'AND', 'EVOLUTION', 'Consulta inicial — programa de emagrecimento', 'Queixa de compulsão alimentar noturna e sedentarismo. Conduta: plano alimentar estruturado, estratégias comportamentais e início de atividade física leve. Encaminhada para consulta nutricional. Retorno em 15 dias.', '2026-09-24 15:28'],
  ['P07', 'BEA', 'EVOLUTION', 'Consulta inicial — endocrinologia', 'Queixa de cansaço e ganho de peso. Exames de julho com TSH discretamente elevado. Conduta: repetir função tireoidiana e acompanhar. Retorno em 30 dias.', '2026-09-09 11:15'],
  ['P08', 'LAR', 'EVOLUTION', 'Consulta nutricional inicial', 'Relata inchaço e constipação. Plano alimentar com aumento de fibras e hidratação. Retornos quinzenais programados.', '2026-09-17 16:28'],
  ['P09', 'AND', 'HISTORY', 'Acompanhamento mensal — setembro', 'Paciente em acompanhamento desde 2024. Peso estável, exames em dia. Mantida conduta.', '2026-09-04 09:28'],
  ['P09', 'AND', 'EVOLUTION', 'Acompanhamento mensal — outubro', 'Mantém bons resultados. Ajuste fino no plano alimentar para o período de viagens. Próximo acompanhamento em 30/10.', '2026-10-02 09:28'],
  ['P10', 'AND', 'EVOLUTION', 'Teleconsulta inicial', 'Atendimento remoto. Objetivo: melhorar composição corporal para competição amadora. Conduta: plano nutrológico com periodização. Retorno por teleconsulta em 23/10.', '2026-09-30 09:42'],
  ['P11', 'CAR', 'OBSERVATION', 'Avaliação estética facial', 'Textura irregular e discromia leve. Indicado protocolo de revitalização em sessão única com retorno de controle.', '2026-09-29 12:10'],
  ['P12', 'BEA', 'EVOLUTION', 'Consulta inicial — check-up integrado', 'Paciente assintomático, refere estresse elevado. Solicitados exames do check-up integrado e avaliação corporal. Orientações sobre sono e atividade física.', '2026-10-02 12:25'],
  ['P31', 'CAR', 'PROCEDURE', 'Procedimento estético corporal — sessão 1/3', 'Sessão de tratamento para flacidez abdominal realizada sem intercorrências. Próxima sessão em 15/10.', '2026-10-01 15:28'],
  ['P22', 'AND', 'EVOLUTION', 'Retomada de acompanhamento', 'Paciente antigo retomando acompanhamento após 8 meses. Solicitados exames de rotina. Retorno em 20/10.', '2026-09-11 15:12'],
];

// Pedidos de exame: [paciente, profissional, data, itens (nomes do catálogo), indicação]
export const EXAM_REQUESTS: [string, string, string, string[], string][] = [
  ['P05', 'AND', '2026-10-01 09:20', ['Hemograma completo', 'Glicemia de jejum', 'Hemoglobina glicada (HbA1c)', 'Perfil lipídico — Colesterol Total', 'Perfil lipídico — HDL', 'Perfil lipídico — LDL', 'Perfil lipídico — Triglicerídeos', 'TSH', 'Creatinina'], 'Check-up Integrado — avaliação preventiva anual.'],
  ['P02', 'BEA', '2026-09-15 09:50', ['Glicemia de jejum', 'Insulina de jejum', 'Hemoglobina glicada (HbA1c)', 'TSH', 'Perfil lipídico — Triglicerídeos'], 'Avaliação metabólica — glicemia limítrofe.'],
  ['P07', 'BEA', '2026-09-09 11:10', ['TSH', 'Hemograma completo', 'Glicemia de jejum'], 'Repetir função tireoidiana.'],
  ['P12', 'BEA', '2026-10-02 12:20', ['Hemograma completo', 'Glicemia de jejum', 'Perfil lipídico — Colesterol Total', 'Perfil lipídico — LDL', 'TGO (AST)', 'TGP (ALT)', 'Creatinina'], 'Check-up integrado.'],
];

// Documentos (PDF gerado) e imagens (PNG sintético em assets/)
export const DOCUMENTS: [string, 'EXAM' | 'REPORT' | 'CONTRACT' | 'CONSENT' | 'RECEIPT' | 'OTHER', string, string, string][] = [
  ['P01', 'OTHER', 'Plano de acompanhamento nutrológico', 'Plano de acompanhamento de 3 meses: consultas mensais, metas de composição corporal, hidratação diária de 2,5 L e caminhada 3x por semana. Reavaliação com bioimpedância a cada 30 dias.', '2026-10-05 10:10'],
  ['P04', 'CONSENT', 'Termo de atendimento — procedimento estético', 'Declaro ter recebido as informações sobre o procedimento estético facial, seus cuidados, possíveis efeitos e o intervalo entre sessões.', '2026-09-26 10:20'],
  ['P04', 'OTHER', 'Orientações pós-procedimento', 'Evitar exposição solar por 7 dias, não massagear a região tratada por 48 horas e manter hidratação da pele. Em caso de dúvidas, falar com a clínica.', '2026-09-26 11:30'],
  ['P03', 'REPORT', 'Plano alimentar — fase 1', 'Plano com 5 refeições diárias, opções sem lactose, lanches práticos para dias de audiência e lista de substituições.', '2026-09-18 11:30'],
  ['P05', 'EXAM', 'Resumo de exames do check-up', 'Resumo dos exames laboratoriais do check-up integrado. Valores dentro dos limites de referência — documento demonstrativo, sem dados reais.', '2026-10-03 16:00'],
];
export const IMAGES: [string, 'BEFORE' | 'AFTER' | 'EXAM' | 'CLINICAL' | 'DOCUMENT' | 'OTHER', string, string, string][] = [
  ['P01', 'EXAM', 'bio.png', 'Bioimpedância — avaliação inicial', '2026-10-05 09:40'],
  ['P06', 'CLINICAL', 'evo.png', 'Evolução de peso e circunferências', '2026-10-06 10:00'],
  ['P02', 'EXAM', 'bio.png', 'Bioimpedância — reavaliação mensal', '2026-10-01 10:50'],
  ['P04', 'CLINICAL', 'facial.png', 'Mapa de avaliação facial', '2026-09-19 14:05'],
  ['P11', 'CLINICAL', 'facial.png', 'Mapa de avaliação facial — revitalização', '2026-09-29 12:05'],
];

// Timeline (anotações manuais da equipe) — [paciente, tipo, título, conteúdo, data, autor]
export const TIMELINE: [string, string, string, string, string, string][] = [
  ['P01', 'WHATSAPP', 'Primeiro contato', 'Lead chegou pelo Instagram e pediu horário para a semana. Atendida pelo WhatsApp.', '2026-10-02 10:40', 'DIE'],
  ['P01', 'APPOINTMENT', 'Consulta agendada', 'Consulta de nutrologia marcada para 05/10 às 9h com o Dr. André Lacerda.', '2026-10-03 09:15', 'JES'],
  ['P01', 'PHONE_CALL', 'Consulta confirmada', 'Paciente confirmou presença por telefone.', '2026-10-04 09:47', 'JES'],
  ['P01', 'NOTE', 'Orçamento aprovado', 'Programa Nutrologia — 3 meses (R$ 1.890,00) aprovado após a consulta.', '2026-10-05 11:20', 'DIE'],
  ['P01', 'NOTE', 'Pagamento recebido', 'Parcela 1/3 (R$ 630,00) recebida via PIX.', '2026-10-06 09:12', 'REN'],
  ['P01', 'APPOINTMENT', 'Retorno agendado', 'Retorno marcado para 15/10 às 10h30.', '2026-10-06 09:20', 'JES'],
  ['P02', 'PHONE_CALL', 'Primeiro contato', 'Ligação após cadastro pelo Google Ads; consulta marcada para 15/09.', '2026-09-08 15:10', 'DIE'],
  ['P02', 'NOTE', 'Orçamento aprovado', 'Acompanhamento Endocrinológico — 6 meses aprovado com desconto de fidelidade.', '2026-09-17 16:00', 'DIE'],
  ['P02', 'APPOINTMENT', 'Teleconsulta realizada', 'Retorno de 01/10 realizado por telemedicina.', '2026-10-01 11:00', 'BEA'],
  ['P03', 'NOTE', 'Indicação', 'Indicada pela paciente Patrícia Gomes Silveira.', '2026-09-10 09:25', 'JES'],
  ['P03', 'NOTE', 'Orçamento aprovado', 'Programa integrado aprovado — pagamento em 3x.', '2026-09-18 12:00', 'JES'],
  ['P04', 'NOTE', 'Orçamento aprovado', 'Protocolo facial (2 sessões) aprovado.', '2026-09-20 10:30', 'DIE'],
  ['P05', 'WHATSAPP', 'Primeiro contato', 'Pediu informações sobre check-up pelo WhatsApp.', '2026-09-25 11:55', 'JES'],
  ['P05', 'APPOINTMENT', 'Check-up realizado', 'Check-up Integrado realizado. Exames enviados ao laboratório parceiro.', '2026-10-01 09:30', 'AND'],
  ['P06', 'WHATSAPP', 'Contato pelo Instagram', 'Respondeu ao story e foi atendida pelo direct.', '2026-09-19 09:05', 'DIE'],
  ['P07', 'WHATSAPP', 'Cobrança de parcela', 'Enviado lembrete da parcela 2/3 vencida em 01/10.', '2026-10-02 09:15', 'JES'],
  ['P08', 'NOTE', 'Pagamento parcial', 'Paciente pagou R$ 300,00 da parcela 2/2; restante combinado para 10/10.', '2026-10-03 17:42', 'REN'],
  ['P12', 'NOTE', 'Contrato enviado', 'Contrato do check-up enviado para assinatura; aguardando o paciente.', '2026-10-05 18:20', 'JES'],
  ['P15', 'NOTE', 'Orçamento recusado', 'Paciente recusou o protocolo corporal por questão de preço.', '2026-10-03 14:00', 'DIE'],
  ['P24', 'PHONE_CALL', 'Falta registrada', 'Não compareceu à consulta de 05/10. Reagendado para 30/10.', '2026-10-06 09:20', 'JES'],
  ['P27', 'PHONE_CALL', 'Falta registrada', 'Não compareceu em 22/09. Reagendada para 21/10.', '2026-09-24 15:40', 'JES'],
];

export const AUTOMATIONS = [
  { name: 'Boas-vindas ao novo paciente', event: 'PATIENT_CREATED', active: true, actions: [{ actionType: 'CREATE_FOLLOW_UP', config: { title: 'Ligar para dar boas-vindas ao novo paciente', dueInDays: 1 } }] },
  { name: 'Pós-venda de oportunidade ganha', event: 'DEAL_WON', active: true, actions: [
    { actionType: 'CREATE_FOLLOW_UP', config: { title: 'Enviar orientações iniciais do programa', dueInDays: 2 } },
    { actionType: 'SEND_NOTIFICATION', config: { title: 'Nova venda fechada', message: 'Uma oportunidade foi marcada como ganha no CRM.' } }] },
  { name: 'Aviso interno de novo agendamento', event: 'APPOINTMENT_CREATED', active: false, actions: [{ actionType: 'SEND_NOTIFICATION', config: { title: 'Novo agendamento', message: 'Uma consulta foi agendada.' } }] },
];

export const NOTIFICATIONS: [string, string, 'INFO' | 'SUCCESS' | 'WARNING', string][] = [
  ['Contrato assinado', 'Thiago Barbosa assinou "Contrato — Teleconsulta + Plano de Acompanhamento".', 'SUCCESS', '2026-10-01 12:40'],
  ['Nova venda fechada', 'Programa Nutrologia 3 meses — Mariana Almeida marcado como ganho.', 'SUCCESS', '2026-10-05 11:20'],
  ['Parcela vencida', 'Lucas Moreira — parcela 2/3 de R$ 550,00 venceu em 01/10.', 'WARNING', '2026-10-02 08:00'],
  ['Novo lead', 'Márcio Leal chegou pelo anúncio de check-up executivo.', 'INFO', '2026-10-06 08:31'],
  ['Consulta remarcada', 'Marcelo Antunes remarcou a consulta para 16/10 às 17h30.', 'INFO', '2026-10-05 10:00'],
];
