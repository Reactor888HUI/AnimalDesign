// Every page opens without errors and draws a frame.
exports.run = async t => {
  const menu = await t.open('runner/index.html', { game: false });
  await menu.waitForSelector('#menu:not([hidden])', { timeout: 60000 });
  t.ok(await menu.locator('#menu [data-mode]').count() === 3, 'the menu offers three games');
  for (const mode of ['runner', 'guard', 'sniffer']) {
    const page = await t.open('runner/index.html?noworker#' + mode, { live: true });
    await page.waitForTimeout(1500);
    const s = await page.evaluate(() => ({ calls: window.__runner.renderer.info.render.calls, cells: window.__runner.world.cells.size }));
    t.ok(s.calls > 0 && s.cells > 0, mode + ' renders the city', s);
    await page.close();
  }
  const lab = await t.open('runner/whippet.html', { game: false });
  await lab.waitForFunction(() => window.__lab, null, { timeout: 60000 });
  t.ok(await lab.evaluate(() => !!window.__lab.dog.root), 'whippet workshop builds the dog');
};
