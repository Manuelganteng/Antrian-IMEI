import { z } from 'zod';
import { db, transaction } from './db';
import { hashPassword } from './password';

/** Only initialize a fresh database. Restarts never reset settings or accounts. */
export async function bootstrapProduction(env: Record<string, string | undefined> = process.env) {
  const hasAdmin = await db.user.count({ where: { role: 'ADMIN', active: true } });
  let administrator: { email: string; passwordHash: string; name: string } | undefined;
  if (!hasAdmin) {
    const email = z.email().parse(env.ADMIN_EMAIL?.trim().toLowerCase());
    const password = z.string().min(16).max(128).parse(env.ADMIN_PASSWORD);
    administrator = { email, passwordHash: await hashPassword(password), name: env.ADMIN_NAME?.trim() || 'Administrator' };
  }
  return transaction(async tx => {
    const settings = await tx.settings.findUnique({ where: { id: 1 } });
    if (!settings) {
      await tx.settings.create({ data: { id: 1 } });
      for (const [prefix, name] of [['R', 'Registrasi IMEI'], ['K', 'Konsultasi IMEI'], ['P', 'Perbaikan Data']]) {
        await tx.service.upsert({ where: { prefix }, create: { prefix, name }, update: {} });
      }
      for (const name of ['Loket 1', 'Loket 2', 'Loket 3']) await tx.counter.upsert({ where: { name }, create: { name }, update: {} });
    }
    if (administrator && !await tx.user.count({ where: { role: 'ADMIN', active: true } })) {
      if (await tx.user.findUnique({ where: { email: administrator.email } })) throw new Error('ADMIN_EMAIL sudah digunakan akun lain. Pilih email baru untuk bootstrap admin.');
      await tx.user.create({ data: { ...administrator, role: 'ADMIN' } });
      return { initialized: !settings, adminCreated: true };
    }
    return { initialized: !settings, adminCreated: false };
  });
}
