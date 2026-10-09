import { spawnSync } from 'node:child_process';
import { mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const archive = 'release/antrian-imei-deploy.zip';
// Explicit source allowlist; never archive the whole working directory.
const sources = [
  '.dockerignore', '.env.example', '.env.production.example', '.gitattributes', '.gitignore',
  'AGENTS.md', 'Dockerfile', 'compose.yaml', 'render.yaml', 'DEPLOYMENT.md', 'README.md',
  'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'tsconfig.json', 'next-env.d.ts',
  'next.config.ts', 'postcss.config.mjs', 'app', 'components', 'lib', 'public', 'scripts',
  'tests', 'deploy', 'prisma/schema.prisma', 'prisma/migrations'
];
mkdirSync(resolve(root, 'release'), { recursive: true });
function tar(args) {
  const result = spawnSync('tar', args, { cwd: root, encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Pembuatan arsip gagal.');
  return result.stdout;
}
tar(['-a', '-c', '-f', archive, ...sources]);
const entries = tar(['-t', '-f', archive]).split(/\r?\n/).filter(Boolean);
const required = [
  'Dockerfile', '.dockerignore', 'render.yaml', 'deploy/entrypoint.sh',
  'scripts/start-production.ts', 'lib/bootstrap.ts', 'lib/config.ts',
  'prisma/schema.prisma', 'prisma/migrations/migration_lock.toml'
];
for (const name of required) if (!entries.includes(name)) throw new Error(`Arsip tidak lengkap: ${name}`);
for (const name of entries) {
  if (/(^|\/)(\.env|\.env\.production|AKSES-LOKAL\.txt)$|\.db($|-)|node_modules|^\.next\/|\.docx$/.test(name)) {
    throw new Error(`Berkas pribadi tidak boleh masuk arsip: ${name}`);
  }
}
console.log(`Paket siap: ${archive} (${statSync(resolve(root, archive)).size} byte).`);
console.log(`${entries.length} entri diperiksa; semua berkas wajib tersedia dan tidak ada kredensial/database lokal.`);
