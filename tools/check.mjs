#!/usr/bin/env node
// Zero-dependency sanity check: validate manifest.json and syntax-check every
// JS file (ES modules + the classic content script). Exits non-zero on failure.
//
//   npm run lint
//
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
const fail = (m) => { console.error('  ✗ ' + m); failed++; };
const ok = (m) => console.log('  ✓ ' + m);

// 1) manifest.json parses and has the essentials
try {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.json'), 'utf8'));
  if (m.manifest_version !== 3) fail('manifest_version is not 3');
  if (!m.background?.service_worker) fail('missing background.service_worker');
  if (!m.action?.default_popup) fail('missing action.default_popup');
  if (!Array.isArray(m.permissions)) fail('permissions is not an array');
  if (failed === 0) ok('manifest.json valid (MV3)');
} catch (e) {
  fail('manifest.json did not parse: ' + e.message);
}

// 2) syntax-check all source JS
const files = [];
for await (const f of glob('src/**/*.js', { cwd: ROOT })) files.push(f);
for await (const f of glob('tools/*.mjs', { cwd: ROOT })) files.push(f);

for (const rel of files.sort()) {
  const abs = join(ROOT, rel);
  const isModule = rel.endsWith('.mjs') || !rel.includes('content-script');
  try {
    if (isModule) {
      execFileSync(process.execPath, ['--check', '--input-type=module'],
        { input: readFileSync(abs), stdio: ['pipe', 'ignore', 'pipe'] });
    } else {
      execFileSync(process.execPath, ['--check', abs], { stdio: ['ignore', 'ignore', 'pipe'] });
    }
    ok(rel);
  } catch (e) {
    fail(rel + ' — ' + (e.stderr?.toString().trim().split('\n')[0] || e.message));
  }
}

if (failed) { console.error(`\n${failed} check(s) failed.`); process.exit(1); }
console.log('\nAll checks passed.');
