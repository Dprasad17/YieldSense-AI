// End-to-end browser test over CDP for all three roles. Needs the API (seeded) and the Vite app running:
//   APP=http://localhost:5199 node e2e/app.e2e.mjs
// Full UI smoke test: public pages, auth, every screen for each role, both themes, mobile width.
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const APP = process.env.APP ?? 'http://localhost:5199';
const API = process.env.API ?? 'http://localhost:8765';
// Chromium-based browser with remote debugging (Edge on Windows by default).
const EDGE = process.env.BROWSER_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9335;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'ys-e2e-'));
const edge = spawn(
  EDGE,
  [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    `--user-data-dir=${profile}`,
    '--window-size=1440,900',
    'about:blank',
  ],
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
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener('message', ev => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
  if (msg.method === 'Runtime.exceptionThrown')
    consoleErrors.push(
      'EXCEPTION ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text),
    );
  if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error' || msg.params.type === 'warning'))
    consoleErrors.push(
      `${msg.params.type.toUpperCase()} ` +
        msg.params.args
          .map(a => a.value ?? a.description)
          .join(' ')
          .slice(0, 400),
    );
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error')
    consoleErrors.push('LOG ' + msg.params.entry.text + ' ' + (msg.params.entry.url ?? ''));
});
const send = (method, params = {}) =>
  new Promise(r => {
    const i = ++id;
    pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async expr =>
  (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

const text = () => evaluate('document.body.innerText');
const url = () => evaluate('location.pathname + location.search');
async function waitFor(pred, label, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await pred()) return true;
    await sleep(200);
  }
  throw new Error(
    'Timed out: ' + label + ' | URL ' + (await url()) + ' | ' + (await text())?.slice(0, 300).replace(/\s+/g, ' '),
  );
}
const waitText = (s, t) =>
  waitFor(async () => (await text())?.toLowerCase().includes(s.toLowerCase()), `text "${s}"`, t);
const waitUrl = (s, t) => waitFor(async () => (await url())?.startsWith(s), `url ${s}`, t);
const go = async path => {
  await send('Page.navigate', { url: APP + path });
  await sleep(400);
};
const click = sel =>
  evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`,
  );
const clickText = (sel, s) =>
  evaluate(
    `(() => { const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.innerText.includes(${JSON.stringify(s)})); if (!el) return false; el.click(); return true; })()`,
  );
const noText = async (...bad) => {
  const t = await text();
  for (const b of bad) if (t.includes(b)) throw new Error('unexpected: ' + b);
};
const setInput = (sel, value) =>
  evaluate(
    `(() => { const el = document.querySelector(${JSON.stringify(sel)}); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`,
  );
const signOut = () =>
  evaluate(
    `(async () => { const t = document.querySelector('button[data-account-menu]'); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' })); await new Promise(r => setTimeout(r, 300)); [...document.querySelectorAll('[role=menuitem]')].find(e => e.innerText.includes('Sign out')).click(); })()`,
  );
const skipTour = () => clickText('button', 'Skip tour');
const hasOverflow = () => evaluate(`document.documentElement.scrollWidth > window.innerWidth + 1`);

const results = [];
const check = async (name, fn) => {
  const t0 = Date.now();
  try {
    await Promise.race([
      fn(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('check timed out (90s)')), 90000)),
    ]);
    results.push(['PASS', name]);
    console.log('PASS', name, Math.round((Date.now() - t0) / 1000) + 's');
  } catch (e) {
    results.push(['FAIL', name, e.message]);
    console.log('FAIL', name, e.message.slice(0, 300));
  }
};

await check('landing: static page, CTAs, facts', async () => {
  await go('/');
  await waitText('Know your harvest before you plant it');
  await waitText('28,242');
  await waitText('101');
  await waitText('Frequently asked questions');
  await noText('testimonial', 'Milestone');
});
await check('anonymous app route → /login', async () => {
  await go('/app/weather');
  await waitUrl('/login');
  await waitText('Sign in');
});
await check('sign-in: inline validation + wrong password stays', async () => {
  await click('form button[type=submit]');
  await waitText('Enter your username.');
  await setInput('#si-username', 'admin');
  await setInput('#si-password', 'nope');
  await click('form button[type=submit]');
  await waitText('Incorrect username or password.');
  if (!(await url()).startsWith('/login')) throw new Error('signed in');
});
await check('sign-in: forgot password dialog', async () => {
  await clickText('button', 'Forgot password?');
  await waitText('Contact them with your username');
  await clickText('button', 'Got it');
});
await check('register: 2 steps with validation and strength meter', async () => {
  await go('/register');
  await waitText('Create your account');
  await click('form button[type=submit]');
  await waitText('At least 3 characters.');
  await setInput('#rg-password', 'Abcdefghijk1!');
  await waitText('Password strength: Strong');
});
await check('demo farmer one-click → returns to requested page', async () => {
  await go('/app/weather?region=India');
  await waitUrl('/login');
  await clickText('button', 'Farmer');
  await waitUrl('/app/weather');
  await waitText('Region vs all regions');
});
await check('product tour shows once and can be skipped', async () => {
  await waitText('Step 1 of 4');
  await skipTour();
  await sleep(200);
  await go('/app/dashboard');
  await sleep(800);
  await noText('Step 1 of 4');
});
await check('dashboard: real KPIs, sample pill on regions, crop portfolio', async () => {
  await waitText('Farm records');
  await waitText('28,242');
  await waitText('Data coverage by crop');
  await waitText('28,242 records in total');
  await waitText('the fewest');
  await waitText('Even share per crop');
  await waitText('Crop portfolio');
  await waitText('Yield by crop');
  await waitText('Global mean');
  await noText('Regional yield ranking', 'North India', 'Average yield by crop');
  await noText('Monitored Farms', 'Live Telemetry', '5 Key Crops', 'Telemetry');
});
await check('farmer nav: no EDA / dataset / models; 403 on /app/eda', async () => {
  const labels = await evaluate(
    `[...document.querySelectorAll('nav[aria-label=Main] a')].map(a => a.innerText.trim())`,
  );
  if (labels.includes('EDA') || labels.includes('Dataset Explorer') || labels.includes('Model performance'))
    throw new Error(labels.join(','));
  await go('/app/eda');
  await waitUrl('/403');
});
await check('predictor: validation, predict, insight, what-if, save, history', async () => {
  await go('/app/predict');
  await waitText('Model inputs');
  await waitText('Field conditions (optional)');
  await waitText('6/6');
  await evaluate(`[...document.querySelectorAll('button[type=submit]')].pop().click()`);
  await waitText('Productivity:', 30000);
  await waitText('What if?');
  await waitText('Likely range (P10–P90)');
  await waitText('XGBoost v2.1.0');
  await noText('NDVI');
  await noText('Methodological', 'docs/');
  await clickText('button', 'View in history');
  await waitUrl('/app/history');
  await waitText('Prediction history');
  await waitText('XGBoost v2.1.0');
  await waitFor(
    () => evaluate(`[...document.querySelectorAll('tbody button')].some(b => b.innerText.trim() === 'Re-run')`),
    're-run button',
  );
  await evaluate(`[...document.querySelectorAll('tbody button')].find(b => b.innerText.trim() === 'Re-run').click()`);
  await waitFor(
    () => evaluate(`[...document.querySelectorAll('[title="Same inputs, current model"]')].length > 0`),
    're-run value',
  );
});

await check('phase C: farms list shows demo farms; farm detail with map and seasons', async () => {
  await go('/app/farms');
  await waitText('Green Valley Farm');
  await waitText('Riverbend Fields');
  await clickText('a', 'Green Valley Farm');
  await waitText('Season records');
  await waitText('Farm context');
  await waitText('Soil tests');
  await waitFor(() => evaluate(`!!document.querySelector('.leaflet-container')`), 'map');
});
await check('phase C: create farm, add season, delete farm', async () => {
  await go('/app/farms');
  await waitText('Green Valley Farm');
  await clickText('button', 'Add farm');
  await waitText('Crops grown');
  await setInput('#ff-name', 'E2E Test Farm');
  await setInput('#ff-area', '3.5');
  await evaluate(
    `(() => { const sel = document.querySelector('#ff-region'); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(sel, 'India'); sel.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await evaluate(`[...document.querySelectorAll('[role=group] button')].find(b => b.innerText === 'Rice').click()`);
  await clickText('[role=dialog] button', 'Create farm');
  await waitText('Farm created');
  await waitText('E2E Test Farm');
  await waitFor(
    () => evaluate(`[...document.querySelectorAll('button')].some(b => b.innerText.includes('Add season'))`),
    'Add season button',
  );
  await clickText('button', 'Add season');
  await waitText('What was grown');
  await setInput('#fr-yield', '4200');
  await clickText('[role=dialog] button', 'Save season');
  await waitText('Season added');
  await clickText('button', 'Delete');
  await clickText('[role=dialog] button', 'Delete farm');
  await waitUrl('/app/farms');
});
await check('phase C: data collection wizard imports farm seasons from CSV', async () => {
  await go('/app/collect');
  await waitText('Step 1 of 3');
  await waitFor(
    () => evaluate(`[...document.querySelectorAll('#dc-farm option')].some(o => o.text.startsWith('Green Valley'))`),
    'farm options',
  );
  await evaluate(
    `(() => { const sel = document.querySelector('#dc-farm'); const opt = [...sel.options].find(o => o.text.startsWith('Green Valley')); const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; setter.call(sel, opt.value); sel.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await evaluate(
    `(() => { const input = document.querySelector('#dc-file'); const dt = new DataTransfer(); dt.items.add(new File(['Season,Crop,Hectares,Yield\\n2008,Rice,4,3500\\n2007,Banana,4,1\\n'], 'seasons.csv', { type: 'text/csv' })); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await waitFor(
    () =>
      evaluate(
        `[...document.querySelectorAll('button')].some(b => b.innerText.includes('Upload and continue') && !b.disabled)`,
      ),
    'upload enabled',
  );
  await clickText('button', 'Upload and continue');
  await waitText('Step 2 of 3');
  await clickText('button', 'Validate rows');
  await waitText('1 rows are valid and 1 have errors');
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.innerText.startsWith('Import 1')).click()`);
  await clickText('[role=dialog] button', 'Import');
  await waitText('Imported 1 rows');
  await clickText('button[role=tab]', 'Import history');
  await waitText('seasons.csv');
});
await check('phase C: profile edit and notification preferences persist', async () => {
  await go('/app/settings');
  await waitText('Change password');
  await waitText('Risk alerts');
  await setInput('#pf-name', 'Ramesh K.');
  await clickText('button', 'Save profile');
  await waitText('Profile saved');
  await waitText('Ramesh K.');
  await setInput('#pf-name', 'Ramesh Kumar');
  await clickText('button', 'Save profile');
  await waitText('Profile saved');
});
await check('phase C: farm selector scopes recommendations', async () => {
  await go('/app/farms');
  await waitText('Green Valley Farm');
  const id = await evaluate(
    `[...document.querySelectorAll('a')].find(a => a.innerText.includes('Green Valley')).getAttribute('href').split('/').pop()`,
  );
  await go('/app/recommendations?farm=' + id);
  await waitText('India · Rice');
});

await check('phase E: history compare two predictions', async () => {
  await go('/app/predict');
  await waitText('6/6');
  await evaluate(`[...document.querySelectorAll('button[type=submit]')].pop().click()`);
  await waitText('Likely range', 30000);
  await go('/app/history');
  await waitText('Prediction history');
  await waitFor(() => evaluate(`document.querySelectorAll('tbody input[type=checkbox]').length >= 2`), 'two rows');
  await evaluate(
    `(() => { const b = document.querySelectorAll('tbody input[type=checkbox]'); b[0].click(); b[1].click(); })()`,
  );
  await waitText('Comparison');
  await waitText('Differences are highlighted');
});
await check('predictor: harvest estimate for the selected farm', async () => {
  await go('/app/farms');
  await waitText('Green Valley Farm');
  const id = await evaluate(
    `[...document.querySelectorAll('a')].find(a => a.innerText.includes('Green Valley')).getAttribute('href').split('/').pop()`,
  );
  await go('/app/predict?farm=' + id + '&region=India&crop=Rice');
  await waitText('6/6');
  await evaluate(`[...document.querySelectorAll('button[type=submit]')].pop().click()`);
  await waitText('Estimated harvest for Green Valley Farm', 30000);
});
await check('phase G: predictor has 6 model inputs, no rainfall what-if, labelled insight', async () => {
  await go('/app/predict?region=India&crop=Rice');
  await waitText('6/6');
  await noText('Growing period');
  await waitText('cross-country association');
  await evaluate(`[...document.querySelectorAll('button[type=submit]')].pop().click()`);
  await waitText('Likely range', 30000);
  await waitText('Rainfall is left out');
  await waitFor(async () => /AI · Groq|Fallback · rule engine/.test(await text()), 'insight source label', 40000);
});
await check('phase G: real soil (SoilGrids) and nutrient ratings on the farm and Soil pages', async () => {
  await go('/app/farms');
  await waitText('Green Valley Farm');
  const id = await evaluate(
    `[...document.querySelectorAll('a')].find(a => a.innerText.includes('Green Valley')).getAttribute('href').split('/').pop()`,
  );
  const status = await evaluate(
    `fetch('${API}/api/soil-tests', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('yieldsense_token') || sessionStorage.getItem('yieldsense_token')) }, body: JSON.stringify({ farm_id: ${'${id}'}, sampled_on: '2026-09-01', ph: 7.9, nitrogen_kg_ha: 240, phosphorus_kg_ha: 14, potassium_kg_ha: 310, organic_carbon_percent: 0.62 }) }).then(r => r.status)`.replace(
      '${id}',
      id,
    ),
  );
  if (status !== 201) throw new Error('soil test POST ' + status);
  await go('/app/farms/' + id);
  await waitText('Real · SoilGrids', 150000);
  await waitText('Nutrient analysis');
  await waitText('Fertilizer guidance');
  await waitText('Available N');
  await waitText('Low below / High above');
  await go('/app/soil?farm=' + id + '&region=India&crop=Rice');
  await waitText('Real · SoilGrids', 150000);
  await waitText('Reference dataset view');
  await waitText('Synthetic soil columns');
});
await check('phase G: rainfall impact is not estimated; drought and flood are structural', async () => {
  await go('/app/recommendations?region=Egypt');
  await waitText('cross-country association', 40000);
  await go('/app/risk?region=India&crop=Rice');
  await waitText('Risk timeline');
  await waitText('Structural');
  await waitText('climate-zone risks');
});
await check('phase E: risk page matrix, timeline, anomalies, mitigation', async () => {
  await go('/app/risk?region=India&crop=Rice');
  await waitText('Risk matrix');
  await waitText('Risk timeline');
  await waitText('Yield anomalies');
  await waitText('Related recommendations');
  await clickText('a', 'Related recommendations');
  await waitUrl('/app/recommendations');
  await waitText('Severity');
});
await check('phase E: notifications bell and page', async () => {
  await go('/app/dashboard?region=India&crop=Rice');
  await sleep(1500);
  await evaluate(
    `document.querySelector('[data-notification-bell]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }))`,
  );
  await evaluate(`document.querySelector('[data-notification-bell]').click()`);
  await waitText('View all notifications');
  await clickText('button', 'View all notifications');
  await waitUrl('/app/notifications');
  await waitText('unread');
});
await check('phase E: year in context, analytics farms, productivity report', async () => {
  await go('/app/analytics?year=2010&crop=Rice');
  await waitText('Your farms vs the regional reference');
  await waitText('Green Valley Farm');
  await go('/report/productivity?region=India&crop=Rice&year=2010');
  await waitText('Productivity report');
  await waitText('Year: 2010');
  await waitText('Yield by year');
  await waitText('Farms vs regional reference', 30000);
  await waitText('Recommendations');
});
await check('phase E: weather climate trend and soil bands', async () => {
  await go('/app/weather?region=India');
  await waitText('Yearly climate trend', 30000);
  await waitFor(
    async () => (await text()).includes('per decade') || (await text()).includes('Dataset values'),
    'trend text',
    40000,
  );
  await go('/app/soil?crop=Wheat');
  await waitText('Optimal bands for every metric');
  await waitText('Records in band');
  await waitText('synthetic');
});
await check('weather: rings, comparison chart, live toggle', async () => {
  await go('/app/weather?region=India');
  await waitText('Heat stress');
  await waitText('Lower is better');
  await waitText('Based on');
  await noText('datasets/processed', 'Telemetry');
  await clickText('button[role=radio]', 'Live');
  await sleep(1500);
});
await check('soil: gauge, range bars, guidance', async () => {
  await go('/app/soil?crop=Wheat');
  await waitText('Moisture sufficiency');
  await waitText('Acidic');
  await waitText('Guidance');
  const svg = await evaluate(`!!document.querySelector('svg[aria-label^="Soil pH"]')`);
  if (!svg) throw new Error('no gauge');
});
await check('recommendations: real rule engine, create task persisted', async () => {
  await go('/app/recommendations?region=India');
  await waitText('Expected impact');
  await waitText('records analysed');
  await noText('Sample data', 'Sector B4', 'Pivot');
  await evaluate(
    `[...document.querySelectorAll('article button')].find(b => b.innerText.startsWith('Create'))?.click()`,
  );
  await waitText('Create a field task');
  await clickText('[role=dialog] button', 'Create task');
  await waitText('Field task created');
  await clickText('button[role=radio]', 'All');
  await waitText('Task open');
});
await check('analytics: real yearly trend, band, record table, export', async () => {
  await go('/app/analytics?region=India&crop=Rice');
  await waitText('Yield by year (1990');
  await waitText('Model expectation');
  await waitText('Top records by yield');
  await noText('Milestone 3', 'Sample data');
  await waitFor(() => evaluate(`document.querySelectorAll('table').length >= 2`), 'tables');
  await evaluate(`[...document.querySelectorAll('table')].pop().querySelector('tbody tr').click()`);
  await waitText('Risk flags');
});
await check('settings + help', async () => {
  await go('/app/settings');
  await waitText('Preferences');
  await waitText('Default region');
  await go('/app/help');
  await waitText('Glossary');
  await waitText('Keyboard shortcuts');
});
await check('light theme renders app screens', async () => {
  await evaluate(`localStorage.setItem('yieldsense_theme','light')`);
  await go('/app/dashboard');
  await waitText('Farm records');
  const bg = await evaluate(`getComputedStyle(document.body).backgroundColor`);
  if (!bg.includes('247')) throw new Error('bg ' + bg);
  await evaluate(`localStorage.setItem('yieldsense_theme','dark')`);
});
await check('sign out', async () => {
  await go('/app/dashboard');
  await waitText('Farm records');
  await signOut();
  await waitUrl('/login');
});

await check('admin: users, audit log, system metrics, agronomist screens', async () => {
  await waitText('explore with a demo account');
  await clickText('button', 'Admin');
  await waitUrl('/app/dashboard');
  await waitText('Step 1 of 4');
  await skipTour();
  await go('/app/users');
  await waitText('Users & roles');
  await waitText('agronomist@yieldsense.ai');
  await clickText('button[role=tab]', 'Audit log');
  await sleep(500);
  await evaluate(
    `(() => { const b = [...document.querySelectorAll('button[role=tab]')].find(e => e.innerText.includes('System metrics')); b.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); b.click(); })()`,
  );
  await waitText('API latency p50 / p95');
  await waitText('Inference p50 / p95');
  await waitText('Busiest routes');
  await waitText('Recommendation effectiveness');
  await waitText('Completion rate');
  await waitText('Data processing speed');
  await waitText('rows/s');
  await go('/app/models');
  await waitText('Model comparison');
  await go('/app/data');
  await waitText('1–15 of 28,242');
  await signOut();
  await waitUrl('/login');
});
await check('agronomist: dataset explorer table, drawer → predictor prefill', async () => {
  await waitText('explore with a demo account');
  await clickText('button', 'Agronomist');
  await waitUrl('/app/');
  await waitText('Step 1 of 4');
  await skipTour();
  await go('/app/data');
  await waitText('1–15 of 28,242');
  await waitText('Temp (°C)');
  await waitText('S · Synthetic');
  await waitFor(
    () => evaluate(`document.querySelectorAll('thead [title^="Derived"]').length > 0`),
    'provenance header badges',
  );
  await evaluate(`document.querySelector('tbody tr').click()`);
  await waitText('Predict with these values');
  await clickText('button', 'Predict with these values');
  await waitUrl('/app/predict');
  await waitText('Model inputs');
  await waitText('6/6');
});
await check('agronomist: EDA 4 real charts, no orphan', async () => {
  await go('/app/eda');
  await waitText('Rainfall vs yield');
  await waitText('R²');
  await waitText('Soil pH vs yield');
  await sleep(2500);
  const n = await evaluate(`document.querySelectorAll('svg.recharts-surface').length`);
  if (n < 4) throw new Error('charts ' + n);
  await noText('Sample data');
});
await check('agronomist: EDA for a single country shows "No fit" instead of crashing', async () => {
  await go('/app/eda?region=India&crop=Rice');
  await waitText('Rainfall vs yield');
  await waitText('No fit');
  await waitText('single long-term value per country');
  await noText('Something went wrong');
  await go('/app/eda?region=Albania&crop=Cassava');
  await waitText('No records for this context');
  await noText('Something went wrong');
});
await check('agronomist: model performance from the model card', async () => {
  await go('/app/models');
  await waitText('Model comparison');
  await waitText('Served');
  await waitText('P10–P90 coverage · held out');
  await waitText('Weather impact (ablation)');
  await waitText('without rainfall');
  await waitText('Before / after · v2.0.0 → v2.1.0');
  await waitText('Selection rule');
  await waitText('Permutation importance');
  await waitText('Keras MLP');
  await waitText('Train ≤ 2008, test 2009–2013');
  await clickText('button[role=radio]', 'Unseen regions');
  await waitText('20% of regions held out entirely');
  await clickText('button[role=radio]', 'Random');
  await waitText('Random 80/20');
});
await check('mobile 360px: no horizontal overflow, drawer nav', async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
  for (const p of [
    '/app/dashboard',
    '/app/predict',
    '/app/data',
    '/app/eda',
    '/app/risk',
    '/app/history',
    '/app/notifications',
    '/app/recommendations',
    '/app/analytics',
    '/app/weather',
    '/app/soil',
    '/app/models',
    '/app/farms',
    '/report/productivity',
    '/',
  ]) {
    await go(p);
    await sleep(1500);
    if (await hasOverflow()) throw new Error('overflow on ' + p);
  }
  await go('/app/dashboard');
  await waitText('Farm records');
  await click('button[aria-label="Open navigation"]');
  await waitText('Intelligence');
  await send('Emulation.clearDeviceMetricsOverride');
});
await check('404 inside app', async () => {
  await go('/app/nope');
  await waitText('Page not found');
});

for (const r of results) console.log(r.join('  '));
const relevant = consoleErrors.filter(e => !/401 \(Unauthorized\)|403 \(Forbidden\)|status of 40[13]/.test(e));
console.log(`\nconsole errors/warnings: ${relevant.length}`);
for (const e of relevant.slice(0, 20)) console.log('  ' + e.slice(0, 300));
ws.close();
edge.kill();
process.exit(results.some(r => r[0] === 'FAIL') ? 1 : 0);
