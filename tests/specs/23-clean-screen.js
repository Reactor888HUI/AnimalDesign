// A clean screen in the runner: while running nothing but the road, the dog, the controls and the ⋮
// button — no panels, no cat pointer, no trick chain, no messages. The numbers and the last messages are
// in the ⋮ menu ("Забег"); with a panel open, messages show again.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const r = await page.evaluate(() => {
    const $ = id => document.getElementById(id), R_ = window.__runner, ctx = R_.ctx, out = {};
    const shown = el => { if (!el) return false; const cs = getComputedStyle(el), b = el.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05 && b.width > 0 && b.height > 0; };
    $('touchUI').hidden = false;
    ctx.say('Кольцо! +5'); $('trick').hidden = false;
    // everything with text that is visible over the game
    out.visibleText = [...document.querySelectorAll('body *')].filter(e => shown(e) && !e.closest('#more, #menu, #loading, #quests, #bigmap') && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).map(e => e.id || e.className || e.tagName);
    out.controls = ['jumpBtn', 'slideBtn', 'boostBtn', 'moreBtn'].filter(id => shown($(id)));
    out.translucent = ['jumpBtn', 'slideBtn'].every(id => +getComputedStyle($(id)).opacity < 0.6);
    $('moreBtn').click();
    out.run = [...document.querySelectorAll('#more .run dd')].map(d => d.textContent);
    out.log = [...document.querySelectorAll('#more .run .log li')].map(l => l.textContent);
    out.uiOpen = document.body.classList.contains('ui-open') || ctx.paused;
    ctx.say('Нужно 5 ★'); out.toastWhenOpen = shown($('toast'));
    $('moreBtn').click();
    return out;
  });
  t.ok(r.visibleText.length === 0, 'while running there is no text on the screen', r.visibleText);
  t.ok(r.controls.length === 4 && r.translucent, 'only the controls (icons, see-through) and the ⋮ button', r);
  t.ok(r.run.length === 6 && r.run.every(v => v.trim()) && r.log.includes('Кольцо! +5'), 'the numbers and the last messages are in the ⋮ menu', r);
  t.ok(r.toastWhenOpen, 'with a panel open, messages show', r);
};
