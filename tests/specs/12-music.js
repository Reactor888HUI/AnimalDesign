// Music: the notes keep coming, the music gets tense when the cat is close and calms down
// when it is far; the sound button goes: sound + music -> sound only -> silence.
exports.run = async t => {
  const page = await t.open('runner/index.html?noworker&nopost#runner', { live: true });
  await page.evaluate(() => { window.__runner.input.poll = () => {}; window.R.audio.start(); });
  await page.waitForFunction(() => window.R.music.ready && window.R.audio.ctx.state === 'running', null, { timeout: 10000 });
  const calm = await page.evaluate(async () => {
    const M = window.R.music, mode = window.R.modes.runner, real = mode.tension;
    // the real tension from the cat's distance, then a stand-in so the test controls it
    window.__real = [99, 20, 4].map(d => { const c = window.__runner.cat, o = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(c), 'dist'); Object.defineProperty(c, 'dist', { value: d, configurable: true, writable: true }); const v = real(); delete c.dist; return +v.toFixed(2); });
    window.__tension = 0.05; mode.tension = () => window.__tension;
    const s0 = M.step;
    await new Promise(ok => setTimeout(ok, 2500));
    return { steps: M.step - s0, level: +M.level.toFixed(2), real: window.__real };
  });
  const tense = await page.evaluate(async () => {
    const M = window.R.music; window.__tension = 0.95;
    await new Promise(ok => setTimeout(ok, 6000));
    return { level: +M.level.toFixed(2) };
  });
  t.ok(calm.real[0] < 0.3 && calm.real[1] > calm.real[0] && calm.real[2] > 0.8, 'chase tension grows as the cat gets close', calm.real);
  t.ok(calm.steps > 10, 'the music keeps playing (notes scheduled)', calm.steps);
  t.ok(calm.level < 0.45, 'calm when the game is calm', calm);
  t.ok(tense.level > 0.6, 'tense when the game is tense', tense);
  const states = await page.evaluate(() => {
    const b = document.getElementById('muteBtn'), A = window.R.audio, M = window.R.music, out = [];
    if (A.muted) b.click();
    if (!M.on) { b.click(); b.click(); }
    for (let i = 0; i < 3; i++) { b.click(); out.push((A.muted ? 'silent' : M.on ? 'all' : 'sound') ); }
    return out.join(',');
  });
  t.ok(states === 'sound,silent,all', 'the sound button cycles sound only / silence / sound and music', states);
};
