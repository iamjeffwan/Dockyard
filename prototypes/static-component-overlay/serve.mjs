import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const safe = normalize(join(root, pathname));
  if (!safe.startsWith(root)) { res.writeHead(403); res.end(); return; }
  try { const data = await readFile(safe); res.writeHead(200, { 'Content-Type': mime[extname(safe)] ?? 'application/octet-stream' }); res.end(data); }
  catch { res.writeHead(404); res.end('Not found'); }
}).listen(4174, () => console.log('Static component prototype: http://localhost:4174/prototypes/static-component-overlay.logic.html'));
