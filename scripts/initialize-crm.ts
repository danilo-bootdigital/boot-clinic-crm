import { PrismaClient } from '@prisma/client';
import { getDefaultStages } from '../src/lib/validations/crm';

const prisma = new PrismaClient();

async function createDefaultPipeline(companyId: string, clinicId: string) {
  try {
    // Verificar se já existe um pipeline padrão para esta clínica
    const existingPipeline = await prisma.pipeline.findFirst({
      where: {
        companyId,
        clinicId,
        isDefault: true,
      },
    });

    if (existingPipeline) {
      console.log('Pipeline padrão já existe para esta clínica');
      return existingPipeline;
    }

    // Criar pipeline padrão
    const pipeline = await prisma.pipeline.create({
      data: {
        name: 'Pipeline Padrão',
        description: 'Pipeline padrão para gestão de oportunidades',
        companyId,
        clinicId,
        isDefault: true,
        status: 'ACTIVE',
      },
    });

    // Criar etapas padrão
    const defaultStages = getDefaultStages();

    for (const stage of defaultStages) {
      await prisma.pipelineStage.create({
        data: {
          name: stage.name,
          order: stage.order,
          color: stage.color,
          probability: stage.probability,
          isFinal: stage.isFinal,
          finalType: stage.finalType,
          companyId,
          pipelineId: pipeline.id,
        },
      });
    }

    console.log('Pipeline padrão criado com sucesso');
    return pipeline;
  } catch (error) {
    console.error('Erro ao criar pipeline padrão:', error);
    throw error;
  }
}

// Função para criar fontes e motivos de perda padrão
async function createDefaultCRMData(companyId: string, clinicId: string) {
  try {
    // Criar fontes padrão
    const defaultSources = [
      { name: 'Website' },
      { name: 'Indicação' },
      { name: 'Telefone' },
      { name: 'WhatsApp' },
      { name: 'Redes Sociais' },
      { name: 'Passagem' },
      { name: 'E-mail' },
      { name: 'Outro' },
    ];

    for (const source of defaultSources) {
      await prisma.dealSource.upsert({
        where: {
          companyId_name: {
            companyId,
            name: source.name,
          },
        },
        update: {},
        create: {
          name: source.name,
          companyId,
        },
      });
    }

    // Criar motivos de perda padrão
    const defaultLossReasons = [
      { name: 'Preço alto' },
      { name: 'Concorrência' },
      { name: 'Não precisou mais' },
      { name: 'Horário não combinou' },
      { name: 'Desistência' },
      { name: 'Outro' },
    ];

    for (const reason of defaultLossReasons) {
      await prisma.dealLossReason.upsert({
        where: {
          companyId_name: {
            companyId,
            name: reason.name,
          },
        },
        update: {},
        create: {
          name: reason.name,
          companyId,
        },
      });
    }

    console.log('Dados CRM padrão criados com sucesso');
  } catch (error) {
    console.error('Erro ao criar dados CRM padrão:', error);
    throw error;
  }
}

// Função para inicializar dados CRM para uma empresa
async function initializeCRMForCompany(companyId: string, clinicId?: string) {
  try {
    // Se não for informada clínica, usar a primeira clínica da empresa
    if (!clinicId) {
      const clinic = await prisma.clinic.findFirst({
        where: { companyId },
      });
      if (!clinic) {
        throw new Error('Nenhuma clínica encontrada para esta empresa');
      }
      clinicId = clinic.id;
    }

    // Criar pipeline padrão
    await createDefaultPipeline(companyId, clinicId);

    // Criar fontes e motivos de perda padrão
    await createDefaultCRMData(companyId, clinicId);

    console.log('CRM inicializado com sucesso para a empresa', companyId);
  } catch (error) {
    console.error('Erro ao inicializar CRM:', error);
    throw error;
  }
}

// Exemplo de uso
if (require.main === module) {
  const companyId = 'your-company-id';
  const clinicId = 'your-clinic-id'; // opcional

  initializeCRMForCompany(companyId, clinicId)
    .then(() => {
      console.log('CRM inicializado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Erro ao inicializar CRM:', error);
      process.exit(1);
    });
}