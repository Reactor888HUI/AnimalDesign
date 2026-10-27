// Две страницы Chromium через сервер игроков (python3 -m server): комната, 30 поз с частотой 50 в секунду, задержка.
// Библиотеки arcade/lib подключены обычными скриптами — так, как будут работать в игре.
// Запуск: PW=$(npm root -g)/playwright node tools/net-browser.cjs
const { spawn } = require("child_process"), path = require("path");
const { chromium } = require(process.env.PW || "playwright");
const ROOT = path.resolve(__dirname, "..");
(async () => {
  const proc = spawn("python3", ["-m", "server", "--port", "0"], { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
  const url = await new Promise((res, rej) => { proc.stdout.once("data", d => { const m = /:(\d+)\/ws/.exec(String(d)); m ? res(`ws://127.0.0.1:${m[1]}/ws`) : rej(new Error(String(d))); }); proc.once("exit", rej); });
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const errs = [], page = async () => {
    const p = await b.newPage(); p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text()));
    await p.goto("file://" + path.join(ROOT, "tools/net-page.html"));
    await p.evaluate(u => {
      const WORLD = { x0: -580, x1: 3640, z0: -3800, z1: 260, y0: -20, y1: 220 };
      window.log = { rooms: [], poses: [], errors: [] };
      window.cl = createRoomClient({ url: u, world: WORLD });
      cl.on("room", r => log.rooms.push(r)); cl.on("error", e => log.errors.push(e));
      cl.on("pose", (slot, p) => log.poses.push({ slot, p, at: Date.now() }));
    }, url);
    await p.evaluate(() => cl.connect());
    return p;
  };
  const wait = (p, fn, arg) => p.waitForFunction(fn, arg, { timeout: 5000 });
  const A = await page(), B = await page();
  await A.evaluate(() => cl.create("Аня")); await wait(A, () => log.rooms.length);
  const code = await A.evaluate(() => log.rooms[0].code);
  await B.evaluate(c => cl.join(c, "Боря"), code); await wait(B, () => log.rooms.length);
  await A.evaluate(async () => { for (let i = 0; i < 30; i++) { cl.sendPose({ x: 1000 + i, y: 3, z: -3160, yaw: 0, pitch: 0, roll: 0, v: 20, steer: 0, flags: 0 }); await new Promise(r => setTimeout(r, 20)); } });
  await wait(B, () => log.poses.length >= 30);
  const res = await B.evaluate(() => {
    const d = log.poses.map(g => ((g.at >>> 0) - g.p.t + 2 ** 32) % 2 ** 32).sort((x, y) => x - y);
    return { got: log.poses.length, slot: log.poses[0].slot, medianMs: d[d.length >> 1], maxMs: d[d.length - 1], x0: +log.poses[0].p.x.toFixed(1), x29: +log.poses[29].p.x.toFixed(1), players: log.rooms.at(-1).players.length, secure: isSecureContext };
  });
  const ok = !errs.length && res.got === 30 && res.slot === 0 && res.medianMs <= 100 && res.players === 2 && Math.abs(res.x29 - 1029) < .1;
  console.log(JSON.stringify({ ok, ...res, errs }));
  await b.close(); proc.kill(); process.exit(ok ? 0 : 1);
})();
