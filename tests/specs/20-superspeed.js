// Super speed and arrow flights: holding full gallop switches super speed on (faster than the normal
// top speed, an energy bar that runs down and switches it off); in a turn the dog leans over much more;
// a kicker flight becomes an "arrow" (stretched pose, steerable, a trick of its own); the light streaks
// show; and the whippet's poses stay sound (no NaN, paws above ground) at super speed and as an arrow.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const r = await page.evaluate(() => {
    const R_ = window.__runner, p = R_.player, M = window.R.modes.runner, ctx = R_.ctx, w = R_.world, inp = R_.input, out = {};
    w.dynamic = []; R_.traffic.update = () => {};
    const step = (n, fn) => { for (let k = 0; k < n; k++) { fn && fn(k); M.update(1 / 30, ctx); w.update(p.x, p.z, 2); } };
    Object.assign(p, { x: 37.5, z: 60, heading: 0, vx: 0, vz: 0, speed: 0 }); w.update(p.x, p.z, 99);
    step(45, () => { inp.throttle = 1; inp.steer = 0; });
    out.normalTop = +p.vel.toFixed(1); out.superAt45 = p.superOn;
    step(75, () => { inp.throttle = 1; });
    out.superSpeed = +p.vel.toFixed(1); out.on = p.superOn; out.energy = +p.energy.toFixed(2);
    // the lean in a hard turn: at super speed vs normal
    let leanS = 0; step(12, () => { inp.throttle = 1; inp.steer = 1; leanS = Math.max(leanS, Math.abs(p.lean.rotation.z)); });
    // run the energy out
    inp.steer = 0; let offAt = -1; step(260, k => { inp.throttle = 1; if (offAt < 0 && !p.superOn) offAt = k; });
    out.offAfter = offAt; out.energyEnd = +p.energy.toFixed(2);
    // normal-speed lean for comparison (super off, low energy)
    p.energy = 0; p.superOn = false; p.superK = 0; Object.assign(p, { x: 37.5, z: 60, heading: 0, vx: 0, vz: -16, speed: 16 }); w.update(p.x, p.z, 99);
    let leanN = 0; step(12, () => { inp.throttle = 1; inp.steer = 1; leanN = Math.max(leanN, Math.abs(p.lean.rotation.z)); });
    out.leanSuper = +leanS.toFixed(2); out.leanNormal = +leanN.toFixed(2);
    // the kicker: an arrow flight with the trick
    p.energy = 1;
    for (const o of M.debug().rings().values()) { o.active = true; o.t = 0; }
    Object.assign(p, { x: -26, z: 62, y: 0, vy: 0, heading: -Math.PI / 2, vx: 14, vz: 0, speed: 14, air: false, superOn: false, superK: 0, fullT: 0, crash: -1, limp: 0, yawRate: 0, steerS: 0 });
    w.update(p.x, p.z, 99);
    let arrow = false, maxArrowK = 0, nan = false, streak = false; const v = new THREE.Vector3();
    step(90, () => { inp.throttle = 1; inp.steer = 0; arrow = arrow || p.arrow; maxArrowK = Math.max(maxArrowK, p.arrowK);
      R_.speedTrail.update(1 / 30, p, Math.max(p.superK, p.arrowK), false); streak = streak || R_.speedTrail.ribs.some(x => x.m.visible);
      p.root.updateMatrixWorld(true); for (const b of p.ent.mesh.skeleton.bones) { b.getWorldPosition(v); if (!isFinite(v.x + v.y + v.z)) nan = true; } });
    out.arrow = arrow; out.arrowK = +maxArrowK.toFixed(2); out.nan = nan; out.streak = streak; out.crash = p.crash >= 0;
    // the arrow trick is in the chain
    const ch = M.debug().chain(); out.chain = ch ? ch.names : [];
    out.sounds = ['setWind', 'boost', 'trick', 'fanfare'].every(k => typeof ctx.au[k] === 'function');
    // the boost button: at once from a fast run; again: off
    Object.assign(p, { x: 37.5, z: 60, y: 0, heading: 0, vx: 0, vz: -12, speed: 12, superOn: false, superK: 0, fullT: 0, energy: 1, yawRate: 0, steerS: 0 }); w.update(p.x, p.z, 99);
    inp._boostEdge = true; step(2, () => { inp.throttle = 0.8; });
    out.btnOn = p.superOn;
    inp._boostEdge = true; step(2, () => { inp.throttle = 0.8; });
    out.btnOff = !p.superOn;
    // the records tab lists what was done
    ctx.quests.saveStats();
    document.getElementById('questBtn').click(); document.querySelector('[data-tab="records"]').click();
    out.records = [...document.querySelectorAll('#quests .records div')].map(d => d.textContent);
    document.querySelector('#quests .close').click();
    // on a phone the jump zone covers the lower right; the HUD buttons there must still get the tap
    const tu = document.getElementById('touchUI'), was = tu.hidden; tu.hidden = false;
    out.tappable = ['questBtn', 'minimap'].filter(id => { const e = document.getElementById(id); if (e.hidden) return true; const b = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)); });
    tu.hidden = was;
    return out;
  });
  t.ok(!r.superAt45 && r.normalTop <= 16.1, 'full gallop first, at the normal top speed', r);
  t.ok(r.on && r.superSpeed > 20, 'holding it switches super speed on: much faster', { speed: r.superSpeed });
  t.ok(r.offAfter > 0 && r.energyEnd < 0.25, 'the energy runs down and super speed switches off', { offAfter: r.offAfter, energy: r.energyEnd });
  t.ok(r.leanSuper > r.leanNormal * 1.5, 'it leans over much more in a turn at super speed', { super: r.leanSuper, normal: r.leanNormal });
  t.ok(r.arrow && r.arrowK > 0.8 && !r.nan && !r.crash, 'a kicker flight becomes an arrow (stretched, sound, landed)', r);
  t.ok(r.chain.includes('arrow'), 'the arrow is a trick in the chain', r.chain);
  t.ok(r.streak, 'light streaks behind the dog', r.streak);
  t.ok(r.sounds, 'the wind, boost, trick and fanfare sounds are there', r.sounds);
  t.ok(r.btnOn && r.btnOff, 'the boost button switches super speed on at once, and off again', { on: r.btnOn, off: r.btnOff });
  t.ok(r.tappable.length === 2, 'the quest button and the map are above the jump zone', r.tappable);
  t.ok(r.records.length > 10 && /Полётов стрелой\s*[1-9]/.test(r.records.join('|')) && /Максимальная скорость\s*5\d/.test(r.records.join('|')), 'records: arrow flights and the top speed are counted', r.records.slice(0, 9));
};
