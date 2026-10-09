import { PrismaClient, Prisma } from '@prisma/client';
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalDb.prisma = db;

// SQLite has one writer. Retry complete transactions on transient contention.
export async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { maxWait: 15000, timeout: 15000 });
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt >= 5 || !['P1008', 'P2034', 'P2028'].includes(code ?? '')) throw error;
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1) + Math.random() * 70));
    }
  }
}
