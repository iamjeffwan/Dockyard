import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';

const root = process.cwd();
const port = 5173;
const viteCli = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const electronBin = join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
const electronTsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc');
const logRoot = join(root, '.tmp', 'logs');
let vite = null;
let electron = null;
let stopping = false;
let cleaned = false;

function portOpen() {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: 'localhost', port });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

async function waitForPort(timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await portOpen()) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`Vite 未能在 ${port} 端口启动`);
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  child.kill('SIGTERM');
}

function killDockyardElectron() {
  if (process.platform !== 'win32') return;
  const target = electronBin.replaceAll("'", "''");
  spawnSync('powershell.exe', ['-NoProfile', '-Command', `$target='${target}'; Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $target } | Stop-Process -Force`], { stdio: 'ignore' });
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  killTree(electron);
  killTree(vite);
  killDockyardElectron();
}

function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  cleanup();
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
process.on('exit', cleanup);

if (await portOpen()) {
  console.error('[ERROR] dev.port_in_use');
  process.exitCode = 1;
} else {
  mkdirSync(logRoot, { recursive: true });
  const compile = spawnSync(process.execPath, [electronTsc, '-p', join(root, 'tsconfig.electron.json')], { cwd: root, stdio: 'inherit', windowsHide: false });
  if (compile.status !== 0) process.exit(compile.status || 1);
  vite = spawn(process.execPath, [viteCli], { cwd: root, stdio: 'inherit', windowsHide: false, shell: false });
  vite.once('error', () => { console.error('[ERROR] dev.vite_start_failed'); stop(1); });
  vite.once('exit', code => { if (!stopping && code !== 0) stop(code || 1); });
  try {
    await waitForPort();
    const electronEnv = { ...process.env, ELECTRON_LOG_FILE: join(logRoot, 'chromium.log') };
    delete electronEnv.ELECTRON_ENABLE_LOGGING;
    electron = spawn(electronBin, ['.', '--disable-gpu', '--disable-gpu-compositing', '--no-sandbox', '--enable-logging=file', `--log-file=${join(logRoot, 'chromium.log')}`], { cwd: root, stdio: ['ignore', 'inherit', 'pipe'], windowsHide: false, shell: false, env: electronEnv });
    const electronStderr = createWriteStream(join(logRoot, 'electron-stderr.raw'));
    electron.stderr?.pipe(electronStderr);
    electron.once('close', () => electronStderr.end());
    electron.once('error', () => { console.error('[ERROR] dev.electron_start_failed'); stop(1); });
    electron.once('exit', code => stop(code || 0));
  } catch (error) {
    console.error('[ERROR] dev.start_failed');
    stop(1);
  }
}
