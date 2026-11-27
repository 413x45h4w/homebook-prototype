import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const site = resolve(root, 'site');

function ticketShortIds(refNames) {
  const ids = new Set();
  for (const name of refNames) {
    const cleaned = name.replace(/^refs\/remotes\/origin\//, '').replace(/^origin\//, '');
    if (!cleaned.startsWith('ticket/')) continue;
    const shortId = cleaned.slice('ticket/'.length);
    if (/^[A-Za-z0-9._-]{1,40}$/.test(shortId)) ids.add(shortId);
  }
  return [...ids].sort();
}

function run(command, cwd = root, env = process.env) {
  execSync(command, { cwd, stdio: 'inherit', env });
}

rmSync(site, { recursive: true, force: true });
mkdirSync(site, { recursive: true });

console.log('Building production from the current checkout (main).');
run('npm run build', root, { ...process.env, VITE_PREVIEW_ID: '', VITE_BASE: '/homebook-prototype/' });
cpSync(resolve(root, 'dist'), site, { recursive: true });

let refs = [];
try {
  refs = execSync("git for-each-ref --format='%(refname)' refs/remotes/origin/ticket", { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
} catch {
  refs = [];
}

for (const shortId of ticketShortIds(refs)) {
  const ref = `refs/remotes/origin/ticket/${shortId}`;
  const work = resolve(root, '.preview-work', shortId);
  const previewDir = resolve(site, 'preview', shortId);
  console.log(`Building preview ${shortId}`);
  rmSync(work, { recursive: true, force: true });
  try {
    run(`git worktree add --detach "${work}" ${ref}`);
    run(`ln -s "${resolve(root, 'node_modules')}" node_modules`, work);
    run('npm run build', work, {
      ...process.env,
      VITE_PREVIEW_ID: shortId,
      VITE_BASE: `/homebook-prototype/preview/${shortId}/`,
    });
    mkdirSync(previewDir, { recursive: true });
    cpSync(resolve(work, 'dist'), previewDir, { recursive: true });
  } catch (error) {
    mkdirSync(previewDir, { recursive: true });
    writeFileSync(
      resolve(previewDir, 'index.html'),
      `<!doctype html><title>Preview failed</title><p>Preview ${shortId} did not build. Production was left unchanged.</p>`,
    );
    console.error(error);
  } finally {
    try {
      run(`git worktree remove --force "${work}"`);
    } catch {
      rmSync(work, { recursive: true, force: true });
    }
  }
}

console.log('Site ready in ./site');
