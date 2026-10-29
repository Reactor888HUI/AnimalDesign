// Time of day: the auto clock goes day -> sunset -> night -> dawn; the button cycles the modes;
// a picked time blends in smoothly instead of switching at once.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner');
  const r = await page.evaluate(() => {
    const r = window.__runner, D = r.daytime;
    r.setTheme('auto');
    const at = x => { D.t = x; const T = D.update(0); return { lamp: +T.lampK.toFixed(2), sun: +T.sunOffset[1].toFixed(0), sky: T.horizon }; };
    const out = { day: at(0.2), sunset: at(0.46), night: at(0.7), dawn: at(0.94) };
    D.t = 0.2; D.update(D.cycle * 0.25); out.after = +D.t.toFixed(2);              // the clock runs
    const modes = [];
    for (let i = 0; i < 4; i++) { document.getElementById('themeBtn').click(); modes.push(D.mode); }
    out.modes = modes.join(',');
    r.setTheme('day'); D.set('night');
    out.fadeMid = +D.update(0.8).lampK.toFixed(2); out.fadeEnd = +D.update(2).lampK.toFixed(2);
    return out;
  });
  t.ok(r.day.lamp === 0 && r.night.lamp === 1, 'lamps off by day, on at night', r);
  t.ok(r.sunset.lamp > 0.3 && r.sunset.sun < 30, 'sunset: low sun, lamps coming on', r.sunset);
  t.ok(r.dawn.lamp < 0.6 && r.dawn.sun < 30, 'dawn: low sun, lamps going out', r.dawn);
  t.ok(Math.abs(r.after - 0.45) < 0.01, 'the clock moves on', r.after);
  t.ok(r.modes === 'day,sunset,night,auto', 'the button cycles day / sunset / night / auto', r.modes);
  t.ok(r.fadeMid > 0.1 && r.fadeMid < 0.9 && r.fadeEnd === 1, 'a picked time blends in', [r.fadeMid, r.fadeEnd]);
};
