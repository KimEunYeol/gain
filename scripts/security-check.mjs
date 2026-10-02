import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const findings = [];
const git = (...args) => execFileSync('git', args, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const report = (file, rule) => findings.push({ file, rule });
const secrets = [
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['openai-token', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b/],
  ['google-api-key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['groq-api-key', /\bgsk_[A-Za-z0-9_-]{32,}\b/],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['supabase-secret', /\bsb_secret_[A-Za-z0-9_-]{16,}\b/],
  ['supabase-management-token', /\bsbp_[A-Za-z0-9_-]{24,}\b/],
  ['vercel-token', /\b(?:vcp|vci)_[A-Za-z0-9_-]{24,}\b/],
  ['vercel-blob-secret', /\bvercel_blob_rw_[A-Za-z0-9_-]{16,}\b/],
  ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['credential-in-url', /(?:https?|postgres(?:ql)?):\/\/[^\s/:]+:[^\s/@]{8,}@/],
];
const forbidden = /(?:^|\/)(?:node_modules|\.next|dist|\.pnpm-store|\.vercel|\.deployment|\.deploy-tools|\.wsl-migration|\.openai|backups|test-results|playwright-report)(?:\/|$)|(?:^|\/)\.env(?:\.[^/]*)?$|\.(?:log|sqlite|sqlite3|db|pem|key|p12|pfx)$/;

function inspect(file, bytes) {
  if (forbidden.test(file) && !/(?:^|\/)\.env\.example$/.test(file)) report(file, 'private-or-generated-file');
  if (bytes.includes(0)) return;
  const source = bytes.toString('utf8');
  for (const [name, pattern] of secrets) if (pattern.test(source)) report(file, name);
  for (const token of source.match(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g) || []) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      if (payload.role === 'service_role') report(file, 'supabase-service-role-jwt');
    } catch { /* Non-JWT text is not a credential. */ }
  }
}

if (process.argv.includes('--history')) {
  const objects = git('rev-list', '--objects', '--all').toString().trim().split('\n').filter(Boolean);
  for (const entry of objects) {
    const space = entry.indexOf(' ');
    if (space < 0) continue;
    const sha = entry.slice(0, space), path = entry.slice(space + 1);
    if (git('cat-file', '-t', sha).toString().trim() !== 'blob') continue;
    const size = Number(git('cat-file', '-s', sha).toString());
    if (size > 8 * 1024 * 1024) { report(path, 'oversized-history-blob'); continue; }
    inspect(path, git('cat-file', '-p', sha));
  }
} else {
  const staged = process.argv.includes('--staged');
  const names = (staged ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z') : git('ls-files', '-z')).toString().split('\0').filter(Boolean);
  for (const name of names) {
    try { inspect(name, staged ? git('show', ':' + name) : readFileSync(resolve(root, name))); }
    catch { report(name, 'unreadable-tracked-file'); }
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (pkg.packageManager !== 'pnpm@11.19.0' || pkg.engines?.node !== '24.x') report('package.json', 'runtime-standard');
  for (const group of ['dependencies', 'devDependencies']) for (const [name, version] of Object.entries(pkg[group] || {})) {
    if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) report('package.json', 'unpinned-dependency:' + name);
  }
  for (const name of ['lint', 'typecheck', 'test', 'build', 'security:check', 'security:history', 'verify']) if (!pkg.scripts?.[name]) report('package.json', 'missing-script:' + name);
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  if (config.git?.deploymentEnabled !== false) report('vercel.json', 'automatic-deployment-enabled');
}

const unique = [...new Map(findings.map(x => [x.file + ':' + x.rule, x])).values()];
if (unique.length) {
  console.error(JSON.stringify({ status: 'failed', findings: unique }, null, 2));
  process.exitCode = 1;
} else console.log(JSON.stringify({ status: 'passed', mode: process.argv.includes('--history') ? 'history' : 'files', note: 'Heuristic scan; remote account and data permissions require separate verification.' }));
