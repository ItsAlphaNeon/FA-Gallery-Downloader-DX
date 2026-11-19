// UI preview: serves the real startup/gallery pages in a normal browser at http://localhost:5177 so layout
// work doesn't need the full app. The gallery is backed by your local database (read only); downloads,
// login and the status log are faked.
//
//   npm run preview:ui     then open http://localhost:5177/html/gallery.html or /html/startup.html
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(process.argv[2] || '.');
const PORT = 5177;
process.chdir(REPO);
const db = await import(new URL('file:///' + path.join(REPO, 'js/database-interface.js').replace(/\\/g, '/')).href);
await db.init();

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.gif': 'image/gif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.pdf': 'application/pdf', '.txt': 'text/plain' };

const galleryMock = `<script>
const api = (p, d) => fetch('/api/' + p, { method: 'POST', body: JSON.stringify(d ?? null) }).then(r => r.json());
window.getGalleryPage = (d) => api('gallery', d);
window.getSubmissionPage = (id) => api('submission', id);
window.downloadComments = async () => { await new Promise(r => setTimeout(r, 800)); return true; };
window.downloadContent = async () => { await new Promise(r => setTimeout(r, 800)); return true; };
window.openUrl = (u) => console.log('openUrl', u);
window.getContentPath = async () => location.origin + '/content';
api('names').then(d => setTimeout(() => window.setPageInfo?.(d), 300));
</script>`;

const startupMock = `<script>
window.userPath = (d) => { console.log('userPath', JSON.stringify(d)); window.__calls = (window.__calls || []).concat(d); };
setTimeout(async () => {
  const names = await fetch('/api/names', { method: 'POST' }).then(r => r.json());
  window.setPageInfo?.({ username: 'BallooNeon', accounts: ['ballooneon'], current: '2.9.0', latest: '2.9.1', downloadAccounts: names.usernames });
  const lines = ['Starting up...', '[Data] Logged in as: BallooNeon', '[Data] Downloading: ballooneon', '[Data] Gallery page 1 found 24 submissions', '[File] Saved 1762623497.ballooneon_a_long_file_name_here.png'];
  lines.forEach((text, i) => setTimeout(() => window.logMsg?.({ text }), 100 * i));
  window.setActive?.(true);
  window.logProgress?.({ bar: 'data', value: 12, max: 29 });
  window.logProgress?.({ bar: 'file', value: 40, max: 100, filename: '1762623497.ballooneon_example.png' });
}, 300);
</script>`;

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/api/')) {
      let body = '';
      for await (const c of req) body += c;
      const data = body ? JSON.parse(body) : null;
      let out;
      const which = url.pathname.slice(5);
      if (which === 'gallery') out = await db.getGalleryPage(data.offset, data.count, data.query, data.sortOrder, data.ratingFilter);
      else if (which === 'submission') out = await db.getSubmissionPage(String(data));
      else if (which === 'names') out = { favUsernames: await db.getAllFavUsernames(), usernames: await db.getAllUsernames() };
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(out ?? null));
    }
    let file;
    if (url.pathname.startsWith('/content/')) file = path.join(REPO, 'fa_gallery_downloader/downloaded_content', decodeURIComponent(url.pathname.slice(9)));
    else file = path.join(REPO, decodeURIComponent(url.pathname));
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
    let content = fs.readFileSync(file);
    const ext = path.extname(file).toLowerCase();
    if (ext === '.html' && /html[\\/](gallery|startup)\.html$/.test(file)) {
      const mock = /gallery\.html$/.test(file) ? galleryMock : startupMock;
      content = content.toString().replace('<script type="importmap">', mock + '\n<script type="importmap">').replace(/<script src="https:\/\/unpkg[^<]*<\/script>/, '');
    }
    res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(content);
  } catch (e) {
    res.writeHead(500); res.end(String(e.stack));
  }
}).listen(PORT, () => console.log('preview on http://localhost:' + PORT));
