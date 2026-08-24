import { execFile, spawn } from 'node:child_process';
import { join } from 'node:path';
import net from 'node:net';

const root = process.cwd();
const port = 5173;
const reviewPort = 5174;
const viteCli = join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const electronBin = join(root, 'node_modules', 'electron', 'dist', 'electron.exe');
let vite = null;
let reviewBridge = null;
let electron = null;
let stopping = false;

function portOpen(checkPort = port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: 'localhost', port: checkPort });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
  });
}

async function waitForPort(checkPort = port, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await portOpen(checkPort)) return;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`服务未能在 ${checkPort} 端口启动`);
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], () => {});
  } else {
    child.kill('SIGTERM');
  }
}

function killDockyardElectron() {
  if (process.platform !== 'win32') return;
  const target = electronBin.replaceAll("'", "''");
  execFile('powershell.exe', ['-NoProfile', '-Command', `$target='${target}'; Get-Process -Name electron -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $target } | Stop-Process -Force`], () => {});
}

function stop(code = 0) {
  if (stopping) return;
  killTree(reviewBridge);
  stopping = true;
  killTree(electron);
  killTree(vite);
  killDockyardElectron();
  setTimeout(() => process.exit(code), 250);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

if (await portOpen()) {
  console.error(`端口 ${port} 已被占用，请先关闭已有的 Dockyard/Vite 开发进程。`);
  process.exitCode = 1;
} else {
  vite = spawn(process.execPath, [viteCli], { cwd: root, stdio: 'inherit', windowsHide: false, shell: false });
  vite.once('error', error => { console.error('Vite 启动失败:', error.message); stop(1); });
  vite.once('exit', code => { if (!stopping && code !== 0) stop(code || 1); });
  try {
    await waitForPort(port);
    reviewBridge = spawn(process.execPath, [join(root, 'scripts', 'review-bridge.mjs')], { cwd: root, stdio: 'inherit', windowsHide: false, shell: false });
    reviewBridge.once('error', error => { console.error('评审桥接启动失败:', error.message); stop(1); });
    await waitForPort(reviewPort);
    electron = spawn(electronBin, ['.', '--disable-gpu', '--disable-gpu-compositing', '--no-sandbox'], { cwd: root, stdio: 'inherit', windowsHide: false, shell: false });
    electron.once('error', error => { console.error('Electron 启动失败:', error.message); stop(1); });
    electron.once('exit', code => stop(code || 0));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    stop(1);
  }
}
