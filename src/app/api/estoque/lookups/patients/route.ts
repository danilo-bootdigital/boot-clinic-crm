import { NextRequest, NextResponse } from 'next/server';
import { resolveStockUser } from '@/lib/api/stock-access';
import { prisma } from '@/lib/db/prisma';

// GET /api/estoque/lookups/patients?q= — busca enxuta (id/nome) para a saída
// de item rastreado por paciente. Exige `consume`; nada além do nome sai daqui.
export async function GET(request: NextRequest) {
  const { dbUser, error } = await resolveStockUser('consume');
  if (error) return error;
  const q = request.nextUrl.searchParams.get('q')?.trim() || '';
  if (q.length < 2) return NextResponse.json([]);
  const rows = await prisma.patient.findMany({
    where: { companyId: dbUser!.companyId, deletedAt: null, name: { contains: q, mode: 'insensitive' } },
    orderBy: { name: 'asc' },
    take: 10,
    select: { id: true, name: true },
  });
  return NextResponse.json(rows);
}
