// Эталон игры: все тексты, игровые данные и логика.
//   node etalon.mjs make   — снять эталон с текущих index.html / normy.html → ../etalon/
//   node etalon.mjs check  — сравнить текущие файлы с эталоном (код выхода 1, если что-то разошлось)
//
// Что считается «нельзя менять» (проверка падает):
//   1. texts      — каждая строка с русскими буквами из скриптов и из HTML (реплики, варианты, подсказки Айи, кнопки);
//   2. data       — все таблицы и константы игры (цены, нормы, баллы, ok-ответы, сценарии), кроме визуальных — см. VISUAL_DATA;
//   3. logic      — исходный код игровых функций без пробелов/комментариев; функции оформления — в VISUAL_FUNCS, их можно менять.
// Визуальные списки — единственное место, которое разрешено править при редизайне.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as acorn from 'acorn';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'etalon');
const FILES = ['index.html', 'normy.html'];

// данные, которые описывают только картинку: размеры спрайтов, координаты, камера, список файлов
const VISUAL_DATA = new Set(['W', 'H', 'VY', 'VH', 'ZH', 'K', 'SP', 'P', 'CHAIR', 'MEN_SCALE', 'ASSET_LIST', 'NAT', 'IMG',
  'svg', 'stage', 'panel', 'dlg', 'NS', 'reduce', 'bust', 'bustImg', 'tmr', 'svcEl', 'SIDE', 'cam']);
// функции оформления: как и где рисуется, а не что происходит в игре
const VISUAL_FUNCS = new Set(['makeChar', 'spec', 'place', 'setPos', 'face', 'pose', 'vis', 'cls', 'walk', 'slide', 'aspect', 'setVB',
  'wideRect', 'closeRect', 'camAnim', 'camSet', 'camTo', 'camWide', 'camClose', 'narrow', 'ayaState', 'portraitSrc', 'showBust', 'tailX',
  'hideDlg', 'showDlg', 'clock', 'clips', 'fitStage', 'el', 'head', 'lineEl', 'skillTile', 'meterCard', 'resetScene', 'setLocation',
  'setLocation2', 'imgSize', 'clientPose', 'menSprite', 'musicBtn', 'soundBtn', 'drillHead', 'prHead', 'menHead', 'talonEl', 'segGrid',
  'svcTime', 'svcAdd', 'track', 'preloadAll']);

const CYR = /[А-Яа-яЁё]/;
const sha = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

function scripts(html){
  const out = []; const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi; let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}
function htmlTexts(html){
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
  const out = [];
  for (const m of body.matchAll(/>([^<]+)</g)){ const t = m[1].replace(/\s+/g, ' ').trim(); if (CYR.test(t)) out.push(t); }
  for (const m of body.matchAll(/\b(?:alt|title|aria-label|placeholder|content)="([^"]*)"/g)) if (CYR.test(m[1])) out.push(m[1]);
  return out;
}
function walkAst(node, fn){
  if (!node || typeof node.type !== 'string') return;
  fn(node);
  for (const k in node){
    if (k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach(x => x && typeof x.type === 'string' && walkAst(x, fn));
    else if (v && typeof v.type === 'string') walkAst(v, fn);
  }
}
// код без пробелов и комментариев: токены acorn через пробел
function norm(src){
  const toks = [];
  for (const t of acorn.tokenizer(src, {ecmaVersion: 'latest'})) toks.push(t.type.label === 'string' || t.type.label === 'template' ? JSON.stringify(t.value) : (t.value !== undefined ? String(t.value) : t.type.label));
  return toks.join(' ');
}
// верхний уровень: тело большого IIFE (или сам скрипт)
function topStatements(ast){
  const st = [];
  for (const s of ast.body){
    const call = s.type === 'ExpressionStatement' && s.expression.type === 'CallExpression' ? s.expression : null;
    const fn = call && /Function/.test(call.callee.type) ? call.callee : null;
    if (fn && fn.body.type === 'BlockStatement') st.push(...fn.body.body); else st.push(s);
  }
  return st;
}

function snapshot(){
  const snap = {texts: {}, data: {}, logic: {}, other: {}};
  for (const f of FILES){
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const texts = htmlTexts(html).map(t => '[html] ' + t);
    scripts(html).forEach((code, si) => {
      const ast = acorn.parse(code, {ecmaVersion: 'latest', sourceType: 'script'});
      walkAst(ast, n => {
        if (n.type === 'Literal' && typeof n.value === 'string' && CYR.test(n.value)) texts.push(n.value);
        if (n.type === 'TemplateLiteral') n.quasis.forEach(q => { if (CYR.test(q.value.cooked)) texts.push(q.value.cooked); });
      });
      const put = (name, node, kind) => {
        const key = f + ' › ' + name, src = code.slice(node.start, node.end);
        const visual = kind === 'func' ? VISUAL_FUNCS.has(name) : VISUAL_DATA.has(name);
        (visual ? snap.other : kind === 'func' ? snap.logic : snap.data)[key] = {hash: sha(norm(src)), src};
      };
      for (const s of topStatements(ast)){
        if (s.type === 'FunctionDeclaration') put(s.id.name, s, 'func');
        else if (s.type === 'VariableDeclaration') s.declarations.forEach(d => {
          if (d.id.type !== 'Identifier') return put('decl ' + sha(norm(code.slice(d.start, d.end))).slice(0, 8), d, 'data');
          const fnInit = d.init && /FunctionExpression|ArrowFunctionExpression/.test(d.init.type);
          put(d.id.name, d, fnInit ? 'func' : 'data');
        });
        else put('stmt ' + s.type + ' ' + sha(norm(code.slice(s.start, s.end))).slice(0, 8), s, 'func');   // безымянный код — по отпечатку, чтобы вставки выше не сдвигали имена
      }
    });
    snap.texts[f] = texts;
  }
  return snap;
}

function strip(s){ const o = {}; for (const k in s) o[k] = s[k].hash; return o; }

function diffMap(a, b){
  const changed = [], added = [], removed = [];
  for (const k in a) if (!(k in b)) removed.push(k); else if (a[k] !== b[k]) changed.push(k);
  for (const k in b) if (!(k in a)) added.push(k);
  return {changed, added, removed};
}
function diffTexts(a, b){
  const count = arr => arr.reduce((m, t) => m.set(t, (m.get(t) || 0) + 1), new Map());
  const ca = count(a), cb = count(b), lost = [], extra = [];
  for (const [t, n] of ca) if ((cb.get(t) || 0) < n) lost.push(t);
  for (const [t, n] of cb) if ((ca.get(t) || 0) < n) extra.push(t);
  return {lost, extra};
}

const mode = process.argv[2] || 'check';
const cur = snapshot();
if (mode === 'make'){
  fs.mkdirSync(OUT, {recursive: true});
  const meta = {made: new Date().toISOString(), files: Object.fromEntries(FILES.map(f => [f, sha(fs.readFileSync(path.join(ROOT, f), 'utf8'))]))};
  fs.writeFileSync(path.join(OUT, 'etalon.json'), JSON.stringify({meta, texts: cur.texts, data: strip(cur.data), logic: strip(cur.logic), visual: strip(cur.other)}, null, 1));
  // читаемая копия всех текстов — удобно искать и вычитывать
  const md = ['# Все тексты игры (эталон)', '', 'Сгенерировано `node tools/etalon.mjs make`. Не править вручную.', ''];
  for (const f of FILES){ md.push('## ' + f + ' — ' + cur.texts[f].length + ' строк', ''); cur.texts[f].forEach((t, i) => md.push((i + 1) + '. ' + t.replace(/\n/g, ' ⏎ '))); md.push(''); }
  fs.writeFileSync(path.join(OUT, 'texts.md'), md.join('\n'));
  const nT = FILES.reduce((s, f) => s + cur.texts[f].length, 0);
  console.log(`Эталон снят: текстов ${nT}, таблиц данных ${Object.keys(cur.data).length}, игровых функций ${Object.keys(cur.logic).length}, визуальных (можно менять) ${Object.keys(cur.other).length}.`);
} else {
  const et = JSON.parse(fs.readFileSync(path.join(OUT, 'etalon.json'), 'utf8'));
  let fail = false;
  for (const f of FILES){
    const {lost, extra} = diffTexts(et.texts[f], cur.texts[f]);
    if (lost.length || extra.length){ fail = true; console.log(`✗ ${f}: тексты изменились`); lost.forEach(t => console.log('   − ' + t.slice(0, 160))); extra.forEach(t => console.log('   + ' + t.slice(0, 160))); }
    else console.log(`✓ ${f}: все ${et.texts[f].length} текстов на месте`);
  }
  for (const [title, key] of [['данные', 'data'], ['логика', 'logic']]){
    const d = diffMap(et[key], strip(key === 'data' ? cur.data : cur.logic));
    const n = d.changed.length + d.added.length + d.removed.length;
    if (n){ fail = true; console.log(`✗ ${title}: изменено ${d.changed.length}, добавлено ${d.added.length}, удалено ${d.removed.length}`); [...d.changed.map(k => '~ ' + k), ...d.added.map(k => '+ ' + k), ...d.removed.map(k => '− ' + k)].forEach(l => console.log('   ' + l)); }
    else console.log(`✓ ${title}: без изменений (${Object.keys(et[key]).length})`);
  }
  const v = diffMap(et.visual, strip(cur.other));
  const nv = v.changed.length + v.added.length + v.removed.length;
  console.log(nv ? `• оформление: изменено ${nv} (это разрешено): ${[...v.changed, ...v.added, ...v.removed].join(', ')}` : '• оформление: без изменений');
  console.log(fail ? '\nПРОВЕРКА НЕ ПРОЙДЕНА' : '\nПРОВЕРКА ПРОЙДЕНА');
  process.exit(fail ? 1 : 0);
}
