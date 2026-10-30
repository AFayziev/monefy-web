// Runs the Worker (wrangler dev) and the web app (vite) together: `npm run dev`.
// Stops both on Ctrl+C, or when either one exits.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';

const isWindows = process.platform === 'win32';

// wrangler refuses to start if the assets directory does not exist yet.
mkdirSync('web/dist', { recursive: true });

const children = [
  start('api', '\x1b[34m', 'npx', ['wrangler', 'dev']),
  start('web', '\x1b[32m', 'npm', ['run', 'dev', '-w', 'web']),
];

function start(name, color, command, args) {
  const child = spawn(command, args, { shell: isWindows, stdio: ['inherit', 'pipe', 'pipe'] });
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) =>
      console.log(`${color}[${name}]\x1b[0m ${line}`),
    );
  }
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    stopAll(code ?? 1);
  });
  return child;
}

let stopping = false;
function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    // On Windows the shell wrapper must be killed together with its process tree.
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
    else child.kill('SIGTERM');
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
