// Local server for the RockGuard site:  node tools/dev-server.js [port]   (default 5190)
//   - serves the static files of the project root
//   - /api/* and /admin/* are forwarded to the CMS backend  https://cmsapi.qpaix.com/rockguard/...
//     (same thing the Netlify / Vercel redirects do in production), so login works from the local site
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 5190);
const BACKEND = { host: 'cmsapi.qpaix.com', prefix: '/rockguard' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

function proxy(req, res) {
  const headers = Object.assign({}, req.headers, { host: BACKEND.host });
  // the browser talks to this server (same origin), so the backend must not see a foreign Origin/Referer
  delete headers.origin; delete headers.referer; delete headers['accept-encoding'];
  const up = https.request({ host: BACKEND.host, port: 443, method: req.method, path: BACKEND.prefix + req.url, headers }, r => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on('error', e => { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'CMS backend not reachable', detail: e.message })); });
  req.pipe(up);
}

// the page rewrites of vercel.json (item pages: /blog-<slug>.html -> blog-details.html ...); a real file always wins, like on the host
const VERCEL = path.join(ROOT, 'vercel.json');
const REWRITES = ((fs.existsSync(VERCEL) ? JSON.parse(fs.readFileSync(VERCEL, 'utf8')).rewrites : []) || []).filter(r => /\.html$/.test(r.destination))
  .map(r => ({ re: new RegExp('^' + r.source.split('.').join('\\.').replace(':slug', '[^/]+') + '$'), to: r.destination }));

function serveFile(req, res) {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  if (!fs.existsSync(path.join(ROOT, p))) { const r = REWRITES.find(x => x.re.test(p)); if (r) p = r.to; }
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT) || /[\\/](tools|_original|node_modules)[\\/]/.test(file)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

http.createServer((req, res) => {
  if (/^\/(api|admin)\//.test(req.url)) return proxy(req, res);
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method not allowed'); }
  serveFile(req, res);
}).listen(PORT, '0.0.0.0', () => console.log('RockGuard on http://localhost:' + PORT + '  (/api and /admin -> https://' + BACKEND.host + BACKEND.prefix + ')'));
