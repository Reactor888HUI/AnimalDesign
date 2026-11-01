// Прямое соединение без сервера в настоящем Chromium: хозяин создаёт приглашение, гость отвечает кодом, дальше комната и позы.
// Две страницы — два изолированных контекста, как два телефона. Запуск: PW=$(npm root -g)/playwright node tools/direct-browser.cjs
const path = require("path");
const { chromium } = require(process.env.PW || "playwright");
const ROOT = path.resolve(__dirname, "..");
(async () => {
  // Адреса .local (mDNS) в окружении без сети могут не раскрываться — по умолчанию просим настоящие адреса интерфейсов;
  // MDNS=1 — как на телефоне (адреса скрыты за именами .local).
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: process.env.MDNS ? [] : ["--disable-features=WebRtcHideLocalIpsWithMdns"] });
  const errs = [];
  const page = async () => {
    const p = await (await b.newContext()).newPage();
    p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
    await p.goto("file://" + path.join(ROOT, "tools/net-page.html"));
    await p.evaluate(() => {
      window.WORLD = { x0: -580, x1: 3640, z0: -3800, z1: 260, y0: -20, y1: 220 };
      window.log = { rooms: [], poses: [], errors: [] };
      window.hook = c => { c.on("room", r => log.rooms.push(r)); c.on("error", e => log.errors.push(e)); c.on("pose", (slot, p) => log.poses.push({ slot, p, at: Date.now() })); };
    });
    return p;
  };
  const wait = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 15000 });
  const H = await page(), G = await page();

  const t0 = Date.now();
  const invite = await H.evaluate(async () => { window.host = createDirectHost({ gatherMs: 3000 }); window.hc = createRoomClient({ url: "local", world: WORLD, WebSocketImpl: host.Socket }); hook(hc); await hc.connect(); hc.create("Аня"); return await host.invite(); });
  const answer = await G.evaluate(async code => { window.guest = createDirectGuest({ gatherMs: 3000 }); const a = await guest.join(code); return a; }, invite);
  await H.evaluate(code => host.accept(code), answer);
  await G.evaluate(async () => { const sock = await guest.ready; window.gc = createRoomClient({ url: "x", world: WORLD, WebSocketImpl: guest.Socket }); hook(gc); await gc.connect(); gc.join("DRCT", "Боря"); });
  await wait(G, () => log.rooms.length && log.rooms.at(-1).players.length === 2);
  const connectMs = Date.now() - t0;
  await wait(H, () => log.rooms.at(-1).players.length === 2);

  await G.evaluate(async () => { for (let i = 0; i < 30; i++) { gc.sendPose({ x: 1000 + i, y: 3, z: -3160, yaw: 0, pitch: 0, roll: 0, v: 20, steer: 0, flags: 0 }); await new Promise(r => setTimeout(r, 20)); } });
  await wait(H, () => log.poses.length >= 25);                                  // «без повторов»: терять пару поз допустимо
  await H.evaluate(async () => { for (let i = 0; i < 10; i++) { hc.sendPose({ x: 2000 + i, y: 3, z: -3160, yaw: 0, pitch: 0, roll: 0, v: 5, steer: 0, flags: 0 }); await new Promise(r => setTimeout(r, 20)); } });
  await wait(G, () => log.poses.length >= 8);

  const res = await H.evaluate(() => {
    const d = log.poses.map(g => ((g.at >>> 0) - g.p.t + 2 ** 32) % 2 ** 32).sort((x, y) => x - y);
    return { got: log.poses.length, slot: log.poses[0].slot, medianMs: d[d.length >> 1], names: log.rooms.at(-1).players.map(p => p.name), inviteChars: 0 };
  });
  const back = await G.evaluate(() => ({ got: log.poses.length, slot: log.poses[0].slot, you: log.rooms.at(-1).you }));
  res.inviteChars = invite.length; res.answerChars = answer.length;

  // гость закрыл страницу → хозяин видит, что остался один
  await G.evaluate(() => guest.close());
  await wait(H, () => log.rooms.at(-1).players.length === 1);

  const ok = !errs.length && res.got >= 25 && res.slot === 1 && res.medianMs <= 100 && back.got >= 8 && back.slot === 0 && back.you === 1 && res.names.join() === "Аня,Боря";
  console.log(JSON.stringify({ ok, connectMs, ...res, back, errs }));
  await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log(JSON.stringify({ ok: false, error: String(e) })); process.exit(1); });
