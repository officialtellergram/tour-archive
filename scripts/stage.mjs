/**
 * The fitting before the show — `npm run stage`.
 *
 * Gate, then build the EXACT artefact Pages serves (vite build + the static
 * inventory snapshot, so the store, mosaics and carousels render real data),
 * then serve it locally and open the browser. What you see at :4173 is
 * byte-for-byte what production will serve — eyeball the hero here first and
 * the CDN's ten-minute cache can never gaslight you again.
 *
 * Ctrl+C closes the preview. Port is strict: a clash errors loudly rather
 * than silently shifting somewhere your muscle memory won't look.
 */

import { spawnSync, spawn } from 'node:child_process';

const C = { green: '\x1b[32m', dim: '\x1b[2m', off: '\x1b[0m' };
const PORT = 4173;

const run = (label, cmd, args) => {
  console.log(`\n${C.dim}── stage · ${label} ──${C.off}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: true });
  if (r.status) process.exit(r.status);
};

run('gate', 'npm', ['run', 'check']);
run('build (the Pages artefact)', 'npm', ['run', 'build:pages']);

console.log(`\n${C.green}✔ staged${C.off} ${C.dim}— this is what Pages will serve: http://localhost:${PORT}  (Ctrl+C to close)${C.off}\n`);
spawn('cmd', ['/c', 'start', '', `http://localhost:${PORT}`], { stdio: 'ignore', detached: true }).unref();
spawnSync('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'inherit',
  shell: true,
});
