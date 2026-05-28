import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const indexPath = resolve(__dirname, '../src/index.html');
const indexHtml = readFileSync(indexPath, 'utf8');

const checks = [
  {
    name: 'html lang must be Spanish',
    valid: /<html\s+[^>]*lang="es"/.test(indexHtml),
  },
  {
    name: 'browser translation must be disabled for fixed Spanish UI labels',
    valid: /<html\s+[^>]*translate="no"/.test(indexHtml),
  },
  {
    name: 'Google Translate must be disabled',
    valid: /<meta\s+name="google"\s+content="notranslate"\s*>/.test(indexHtml),
  },
];

const failures = checks.filter((check) => !check.valid);

if (failures.length > 0) {
  console.error('Index language verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure.name}`);
  }
  process.exit(1);
}

console.log('Index language verification passed.');
