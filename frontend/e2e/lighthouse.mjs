// Runs Lighthouse (desktop + mobile) on /, /login and /app/dashboard against the production build.
// /app/dashboard is audited signed in: the token is put in localStorage first and storage reset is disabled.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP ?? 'http://localhost:4173';
const API = process.env.API ?? 'http://localhost:8765';
// Chromium-based browser with remote debugging (Edge on Windows by default).
const EDGE = process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9340;
const OUT = process.argv[2] ?? tmpdir();
const sleep = ms => new Promise(r => setTimeout(r, ms));

const login = await (
  await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'farmer', password: 'farmer123' }),
  })
).json();
const user = {
  username: login.username,
  role: login.role,
  email: login.email,
  full_name: login.full_name || login.username,
};

const profile = mkdtempSync(join(tmpdir(), 'ys-lh-'));
const edge = spawn(
  EDGE,
  [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', `--user-data-dir=${profile}`, 'about:blank'],
  { stdio: 'ignore' },
);
let targets;
for (let i = 0; i < 40; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    if (targets.length) break;
  } catch {}
  await sleep(250);
}
const pages = ['/', '/login', '/app/dashboard'];
const name = p => (p === '/' ? 'root' : p.replace(/\W+/g, '_'));
const results = [];
async function seedSession() {
  // Seed session + mark the product tour as seen so it doesn't cover the dashboard.
  const fresh = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const ws = new WebSocket(fresh.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0;
  const send = (method, params = {}) =>
    new Promise(r => {
      const i = ++id;
      const h = e => {
        const m = JSON.parse(e.data);
        if (m.id === i) {
          ws.removeEventListener('message', h);
          r(m);
        }
      };
      ws.addEventListener('message', h);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Page.navigate', { url: APP + '/login' });
  await sleep(1500);
  await send('Runtime.evaluate', {
    expression: `localStorage.setItem('yieldsense_token', ${JSON.stringify(login.access_token)}); localStorage.setItem('yieldsense_user', ${JSON.stringify(JSON.stringify(user))}); localStorage.setItem('yieldsense_tour_done_farmer', 'true'); localStorage.setItem('yieldsense_theme', 'dark');`,
  });
  ws.close();
}

for (const p of pages) {
  if (p.startsWith('/app')) await seedSession();
  for (const preset of ['desktop', 'mobile']) {
    const file = join(OUT, `lh-${preset}-${name(p)}.json`);
    const args = [
      '-y',
      'lighthouse@12',
      APP + p,
      `--port=${PORT}`,
      '--disable-storage-reset',
      '--output=json',
      `--output-path=${file}`,
      '--quiet',
      '--only-categories=performance,accessibility,best-practices,seo',
    ];
    if (preset === 'desktop') args.push('--preset=desktop');
    // The authenticated page must keep its session; public pages are audited signed out.
    try {
      execFileSync('npx', args, { stdio: 'ignore', shell: true, timeout: 180000 });
      const j = JSON.parse(readFileSync(file, 'utf8'));
      const c = j.categories;
      const fails = Object.values(j.audits)
        .filter(a => a.score !== null && a.score < 0.9 && a.scoreDisplayMode === 'binary')
        .map(a => a.id);
      results.push({
        preset,
        page: p,
        perf: Math.round(c.performance.score * 100),
        a11y: Math.round(c.accessibility.score * 100),
        bp: Math.round(c['best-practices'].score * 100),
        seo: Math.round(c.seo.score * 100),
        fails,
        lcp: j.audits['largest-contentful-paint'].displayValue,
        tbt: j.audits['total-blocking-time'].displayValue,
        cls: j.audits['cumulative-layout-shift'].displayValue,
      });
    } catch (e) {
      results.push({ preset, page: p, error: String(e.message).slice(0, 200) });
    }
  }
}
edge.kill();
for (const r of results) console.log(JSON.stringify(r));
