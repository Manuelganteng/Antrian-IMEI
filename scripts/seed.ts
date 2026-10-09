import 'dotenv/config';
import { db } from '../lib/db';
async function main() {
  await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  for (const [prefix, name] of [['R', 'Registrasi IMEI'], ['K', 'Konsultasi IMEI'], ['P', 'Perbaikan Data']]) {
    await db.service.upsert({ where: { prefix }, update: {}, create: { prefix, name } });
  }
  for (const name of ['Loket 1', 'Loket 2', 'Loket 3']) await db.counter.upsert({ where: { name }, update: {}, create: { name } });
  console.log('Tiga layanan, tiga loket, dan pengaturan awal siap. Jam layanan: 08.00–16.00 WIB.');
}
main().finally(() => db.$disconnect());
