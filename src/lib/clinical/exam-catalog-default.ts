// Painel padrão de exames, transcrito do modelo "Solicitação de Exames
// Laboratoriais" fornecido pela clínica.
//
// É SEMENTE, não regra: cada clínica recebe uma cópia no primeiro uso e edita a
// sua. Nada aqui é lido em tempo de emissão — o pedido guarda o nome do exame
// como snapshot (ver ExamRequestItem).

export const GRUPO_FUNDAMENTAIS = 'Exames Fundamentais';
export const GRUPO_HORMONAL = 'Avaliação Hormonal';

export interface ExamSeedItem {
  group: string;
  subgroup?: string;
  name: string;
}

// A ordem aqui é a ordem de exibição e de impressão.
const FUNDAMENTAIS = [
  'Hemograma completo',
  'Glicemia de jejum',
  'Hemoglobina glicada (HbA1c)',
  'Insulina de jejum',
  'Ureia',
  'Creatinina',
  'Sódio',
  'Potássio',
  'TGO (AST)',
  'TGP (ALT)',
  'Gama GT (GGT)',
  'Fosfatase Alcalina (FA)',
  'Bilirrubinas (total e frações)',
  'Albumina',
  // No modelo, "Perfil lipídico" é um título com quatro itens abaixo. Aqui cada
  // um é um exame selecionável, com o prefixo preservado para o médico
  // reconhecer o agrupamento na lista.
  'Perfil lipídico — Colesterol Total',
  'Perfil lipídico — HDL',
  'Perfil lipídico — LDL',
  'Perfil lipídico — Triglicerídeos',
  'TSH',
  'T4 Livre',
  'EAS (Urina Tipo I)',
  'Vitamina D (25-OH)',
  'Vitamina B12',
  'Ferritina',
  'Ferro sérico',
  'Saturação de transferrina',
  'Ácido fólico',
  'Magnésio',
  'Zinco',
  'Ácido úrico',
  'PCR ultrassensível',
  'Homocisteína',
  'Cortisol',
  'DHEA-S',
];

const HORMONAL_MULHERES = [
  'Estradiol',
  'Progesterona',
  'FSH',
  'LH',
  'Testosterona Total',
  'Testosterona Livre',
  'SHBG',
  'Prolactina',
];

const HORMONAL_HOMENS = [
  'Testosterona Total',
  'Testosterona Livre',
  'SHBG',
  'LH',
  'FSH',
  'Estradiol',
  'PSA (conforme idade e fatores de risco)',
];

export const EXAM_CATALOG_SEED: ExamSeedItem[] = [
  ...FUNDAMENTAIS.map((name) => ({ group: GRUPO_FUNDAMENTAIS, name })),
  ...HORMONAL_MULHERES.map((name) => ({ group: GRUPO_HORMONAL, subgroup: 'Mulheres', name })),
  ...HORMONAL_HOMENS.map((name) => ({ group: GRUPO_HORMONAL, subgroup: 'Homens', name })),
];

/** Indicação clínica sugerida no modelo — o médico pode reescrever. */
export const INDICACAO_CLINICA_PADRAO =
  'Avaliação metabólica, nutricional e hormonal para acompanhamento médico.';

/** Observações padrão do modelo, editáveis na emissão. */
export const OBSERVACOES_PADRAO = [
  'Realizar coleta preferencialmente pela manhã.',
  'Manter jejum de 8 a 12 horas para os exames metabólicos e perfil lipídico, conforme orientação do laboratório.',
  'Seguir as orientações específicas do laboratório para exames hormonais, quando aplicáveis.',
].join('\n');
