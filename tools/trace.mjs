// Автопрохождение одной комнаты — барбершоп «Пижон» (Эрик + 8 клиентов + Айя) — на экране телефона.
//   node trace.mjs shots  — скриншоты всех состояний в ../screens/pijon/ + галерея index.html + список картинок в кадре
//   node trace.mjs make   — записать эталонный ход игры (реплики, варианты, итоги) в ../etalon/trace-pijon.json
//   node trace.mjs check  — пройти ещё раз и сравнить с эталоном (код выхода 1 при расхождении)
//
// Прохождение детерминировано: Math.random заменён на генератор с фиксированным зерном, ответы выбираются по правилу
// (чётный клиент: 1-е решение верно, 2-е — ошибка; нечётный — наоборот), поэтому видны и похвала, и разбор ошибки.
// Контракт для нового дизайна: должны остаться id #stage #scene #dlg #panel и классы .choice .next .who .say,
// а также кнопки меню — их находим по тексту, который всё равно неизменен.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {chromium} from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const mode = process.argv[2] || 'shots';
const SHOTS = mode === 'shots';
const OUTDIR = path.join(ROOT, 'screens', 'pijon');
const TRACE = path.join(ROOT, 'etalon', 'trace-pijon.json');
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium';

// правильные ответы берём прямо из данных игры
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MEN = JSON.parse(html.match(/^const MEN = (\[.*\]);\s*$/m)[1]).filter(v => v.salon === 'pijon');
const okOf = new Map();
MEN.forEach((v, i) => ['d1', 'd2'].forEach(d => v[d].opts.forEach(o => okOf.set(o.t, {ok: !!o.ok, i, d}))));
const wantOk = (i, d) => (i % 2 === 0) === (d === 'd1');

const TYPES = {'.html': 'text/html; charset=utf-8', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg'};
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': TYPES[path.extname(p)] || 'application/octet-stream'}); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, r));
const URL0 = `http://127.0.0.1:${server.address().port}/index.html`;

const browser = await chromium.launch({executablePath: CHROME});
const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: SHOTS ? 2 : 1, isMobile: true, hasTouch: true,
  reducedMotion: SHOTS ? 'no-preference' : 'reduce', locale: 'ru-RU'});
await ctx.addInitScript(() => {
  let a = 20261013; Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  try { localStorage.setItem('romashka_sound', 'off'); localStorage.setItem('romashka_music', 'off'); sessionStorage.setItem('aya_hi', '1'); } catch(e){}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL0);
await page.waitForTimeout(1500);

if (SHOTS){ fs.rmSync(OUTDIR, {recursive: true, force: true}); fs.mkdirSync(OUTDIR, {recursive: true}); }
const trace = [], shots = [], images = new Set();
let n = 0, scene = 'menu';
const sleep = ms => page.waitForTimeout(ms);

async function seen(){
  const list = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('#scene image').forEach(im => {
      const g = im.closest('.spr'); if (g && getComputedStyle(g).opacity === '0') return;
      const h = im.getAttribute('href'); if (h) out.push(h);
    });
    document.querySelectorAll('#dlg img, #bust.on img, #aya img, #panel img').forEach(im => im.getAttribute('src') && out.push(im.getAttribute('src')));
    return out;
  });
  list.forEach(s => images.add(s.replace(/^.*assets\//, '').replace(/\.webp$/, '')));
}
async function shot(kind, note){
  await seen();
  if (!SHOTS) return;
  await sleep(350);           // дать дорисоваться анимации входа
  const name = String(++n).padStart(3, '0') + '-' + scene + '-' + kind + '.jpg';
  await page.screenshot({path: path.join(OUTDIR, name), type: 'jpeg', quality: 80});
  shots.push({name, scene, kind, note: note || ''});
}
async function clickText(sel, text){
  const loc = page.locator(sel, {hasText: text}).first();
  await loc.waitFor({state: 'visible', timeout: 15000});
  await loc.click();
}
// текст панели: все текстовые узлы через пробел (без таймера); сравнение — без учёта пробелов, чтобы вёрстку можно было менять
const panelText = () => page.evaluate(() => {
  const p = document.getElementById('panel').cloneNode(true); p.querySelectorAll('.timer,.tmr').forEach(x => x.remove());
  const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT), out = []; let x;
  while ((x = w.nextNode())) if (x.nodeValue.trim()) out.push(x.nodeValue.trim());
  return out.join(' ');
});

// ---------- меню → выбор героя → выбор салона ----------
await shot('menu', 'Главное меню');
await clickText('button', 'Выбор салона');
await sleep(800); scene = 'hero'; await shot('select', 'Выбор героя');
await clickText('button', 'Эрик'); await sleep(400); await shot('picked', 'Эрик выбран');
await clickText('button', 'Играть за Эрика');
await sleep(1200); scene = 'salons'; await shot('grid', 'Выбор салона, совет Айи на «Пижоне»');
await clickText('button.seg', 'Пижон');

// ---------- смена в «Пижоне» ----------
let lastLine = '', lastWho = null, lastPanelKey = '', client = -1, step = 0, idle = 0, finished = false;
const t0 = Date.now();
while (!finished && Date.now() - t0 < 15 * 60 * 1000){
  const st = await page.evaluate(() => {
    const d = document.getElementById('dlg'), h1 = document.querySelector('#panel .head h1, #panel h1');
    const choices = [...document.querySelectorAll('#panel .choice')];
    const nexts = [...document.querySelectorAll('#panel button.next')].filter(b => !b.disabled && b.offsetParent);
    return {
      dlgOn: d.classList.contains('on'), more: d.classList.contains('more'), narr: d.classList.contains('is-narr'),
      who: (d.querySelector('.who') || {}).textContent || '', say: (d.querySelector('.say') || {}).textContent || '',
      head: h1 ? h1.textContent : '', step: (document.querySelector('#panel .menStep') || {}).textContent || '',
      choices: choices.filter(c => !c.disabled).map(c => c.lastChild.textContent),
      next: nexts.map(b => ({t: b.textContent, alt: b.classList.contains('alt')}))
    };
  });
  // номер клиента — по заголовку «Имя, возраст — запрос»
  const ci = MEN.findIndex(v => st.head.startsWith(v.name + ', ' + v.age));
  if (ci !== -1 && ci !== client){ client = ci; scene = 'c' + (ci + 1) + '-' + MEN[ci].img; lastWho = null; }

  if (st.dlgOn && st.say && st.say !== lastLine){
    lastLine = st.say;
    const who = st.narr ? 'рассказчик' : st.who;
    trace.push({t: 'line', who, say: st.say});
    if (who !== lastWho){ lastWho = who; await shot('line-' + ({'рассказчик': 'narr', 'Айя': 'aya', 'Эрик': 'eric'}[who] || 'client'), who + ': ' + st.say.slice(0, 90)); }
    idle = 0;
  }
  if (st.choices.length){
    const d = /Решение 2/.test(st.step) ? 'd2' : 'd1';
    trace.push({t: 'choices', step: st.step, opts: st.choices});
    await shot('choices-' + d, st.step);
    const want = wantOk(client, d);
    const pick = st.choices.find(t => (okOf.get(t) || {}).ok === want) || st.choices[0];
    trace.push({t: 'pick', say: pick, ok: (okOf.get(pick) || {}).ok});
    await page.locator('#panel .choice', {hasText: pick.slice(0, 40)}).first().click();
    lastWho = null; idle = 0; await sleep(300); continue;
  }
  const prim = st.next.find(b => !b.alt);
  if (prim && !st.more){
    const key = scene + '|' + prim.t;
    if (key !== lastPanelKey){
      lastPanelKey = key;
      trace.push({t: 'panel', button: prim.t, text: await panelText()});
      const kind = {'В кресло': 'feedback-d1', 'Финал визита': 'feedback-d2', 'Следующий клиент': 'final', 'Итог смены': 'final', 'Ещё раз': 'summary'}[prim.t] || 'next';
      if (kind === 'summary'){
        scene = 'shift'; await shot('summary', 'Итог смены');
        await page.evaluate(() => document.getElementById('panel').scrollTo(0, 99999)); await shot('summary-end', 'Итог смены, низ');
        finished = true; break;
      }
      await shot(kind, prim.t);
      if (kind === 'final'){ await page.evaluate(() => document.getElementById('panel').scrollTo(0, 99999)); await shot('final-end', 'Итог визита, низ'); }
      await page.locator('#panel button.next:not(.alt)', {hasText: prim.t}).first().click();
      lastWho = null; idle = 0; await sleep(400); continue;
    }
  }
  if (st.dlgOn && st.more){ await sleep(SHOTS ? 250 : 60); await page.locator('#stage').click({position: {x: 30, y: 30}}).catch(() => {}); }
  await sleep(120);
  if (++idle > 600) throw new Error('Прохождение застряло: ' + JSON.stringify(st).slice(0, 400));
}
await browser.close(); server.close();
if (!finished){ console.error('Не дошли до итога смены'); process.exit(1); }

const result = {room: 'Барбершоп «Пижон»', hero: 'Эрик', clients: MEN.map(v => v.name), events: trace};
if (mode === 'make'){ fs.writeFileSync(TRACE, JSON.stringify(result, null, 1)); console.log(`Эталон хода записан: ${trace.length} событий.`); }
if (mode === 'check'){
  const et = JSON.parse(fs.readFileSync(TRACE, 'utf8')).events;
  const key = e => JSON.stringify(e).replace(/\s+/g, '');
  const a = et.map(key), b = trace.map(key);
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  if (i === a.length && a.length === b.length) console.log(`✓ ход игры совпадает с эталоном (${a.length} событий)`);
  else { console.log(`✗ ход игры разошёлся на событии ${i + 1}:\n  было:  ${a[i] || '—'}\n  стало: ${b[i] || '—'}`); process.exitCode = 1; }
}
if (SHOTS){
  const cast = [...images].sort();
  fs.writeFileSync(path.join(OUTDIR, 'shots.json'), JSON.stringify({shots, images: cast}, null, 1));
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const groups = {}; shots.forEach(s => (groups[s.scene] = groups[s.scene] || []).push(s));
  const page = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Пижон — скриншоты</title><style>
:root{--bg:#f4f4f1;--ink:#1d1f1c;--muted:#666b63;--card:#fff;--line:#dcdcd5}
@media (prefers-color-scheme:dark){:root{--bg:#141513;--ink:#e8e9e4;--muted:#9a9e95;--card:#1e201d;--line:#30332e}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}
h1{margin:0 0 4px}h2{margin:36px 0 12px;font-size:18px}p{color:var(--muted);margin:0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:14px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
figure img{display:block;width:100%;height:auto}figcaption{padding:8px 10px;font-size:12px;color:var(--muted)}
figcaption b{display:block;color:var(--ink);font-size:12px}
.cast{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px}
.cast figure img{height:120px;object-fit:contain;background:repeating-conic-gradient(#0001 0 25%,#0000 0 50%) 0 0/16px 16px}
</style></head><body><main><h1>Барбершоп «Пижон»: все экраны</h1>
<p>${shots.length} скриншотов, экран 390×844 (iPhone 14). Эрик, 8 клиентов, Айя. Сгенерировано <code>node tools/trace.mjs shots</code>.</p>
${Object.entries(groups).map(([g, list]) => `<h2>${esc(g)}</h2><div class="grid">${list.map(s => `<figure><a href="${s.name}"><img loading="lazy" src="${s.name}" alt=""></a><figcaption><b>${esc(s.kind)}</b>${esc(s.note)}</figcaption></figure>`).join('')}</div>`).join('\n')}
<h2>Картинки, попавшие в кадр (${cast.length})</h2><div class="cast">${cast.map(c => `<figure><img loading="lazy" src="../../assets/${c}.webp" alt=""><figcaption>${esc(c)}</figcaption></figure>`).join('')}</div>
</main></body></html>`;
  fs.writeFileSync(path.join(OUTDIR, 'index.html'), page);
  console.log(`Скриншотов: ${shots.length}, картинок в кадре: ${cast.length} → screens/pijon/`);
}
if (errors.length){ console.log('Ошибки на странице:', errors); process.exitCode = 1; }
