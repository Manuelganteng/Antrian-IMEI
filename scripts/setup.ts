import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (!existsSync('.env')) {
  writeFileSync('.env', `DATABASE_URL="file:./dev.db"\nAPP_URL="http://localhost:3000"\nAPP_SECRET="${randomBytes(32).toString('hex')}"\nTRUST_PROXY="false"\nCOOKIE_SECURE="false"\n`);
  console.log('.env lokal dibuat. Lanjutkan dengan db:migrate, db:seed, dan admin:create.');
} else console.log('.env sudah tersedia dan dipertahankan.');
