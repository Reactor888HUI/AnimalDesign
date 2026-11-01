// Две настоящие страницы игры соединяются напрямую через меню «Друзья»: обмен кодами, комната, чужая машина на дороге.
// Запуск: PW=$(npm root -g)/playwright node tools/link-browser.cjs [папка со скриншотами]
const path = require("path"), fs = require("fs");
const { chromium } = require(process.env.PW || "playwright");
const PAGE = "file://" + path.resolve(__dirname, "../" + (process.env.HTML || "arcade/index.html")) + "#test";
const SHOTS = process.argv[2];
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--disable-features=WebRtcHideLocalIpsWithMdns"] });
  const errs = [];
  const open = async nick => {
    const ctx = await b.newContext({ viewport: { width: 800, height: 520 } }), p = await ctx.newPage();
    p.on("pageerror", e => errs.push(nick + ": " + e.message)); p.on("console", m => m.type() === "error" && errs.push(nick + ": " + m.text()));
    await p.addInitScript(() => { try { localStorage.setItem("baklan3d-v1", JSON.stringify({ unlocked: 1, best: {}, quality: "low", time: "day" })); } catch (e) {} });
    await p.goto(PAGE); await p.waitForFunction(() => window.__t, null, { timeout: 120000 }); await p.waitForTimeout(1500);
    await p.click("#dock-btn"); await p.click("#m-link"); await p.waitForSelector("#ov-link:not([hidden])");
    await p.fill("#lk-nick", nick);
    return p;
  };
  const [H, G] = await Promise.all([open("Аня"), open("Боря")]);

  await H.click("#lk-host");
  await H.waitForFunction(() => document.getElementById("lk-out").value.startsWith("BK1.O."), null, { timeout: 20000 });
  const invite = await H.inputValue("#lk-out");

  await G.click("#lk-guest"); await G.fill("#lk-in", invite); await G.click("#lk-act");
  await G.waitForFunction(() => document.getElementById("lk-out").value.startsWith("BK1.A."), null, { timeout: 20000 });
  const answer = await G.inputValue("#lk-out");

  await H.fill("#lk-in", "  «" + answer.slice(0, 30) + "\n" + answer.slice(30) + "»  ");        // как после мессенджера: переносы и кавычки
  await H.click("#lk-act");
  const both = () => document.querySelectorAll("#lk-players li").length === 2;
  await Promise.all([H.waitForFunction(both, null, { timeout: 30000 }), G.waitForFunction(both, null, { timeout: 30000 })]);
  const names = await G.$$eval("#lk-players li", l => l.map(x => x.textContent.trim()));

  const guestCodesHidden = await G.evaluate(() => document.getElementById("lk-out-l").hidden && document.getElementById("lk-in").hidden && document.getElementById("lk-act").hidden);
  await H.click("#lk-close"); await G.click("#lk-close");

  // Аня уезжает в город; Боря стоит позади неё и смотрит ей вслед
  await H.evaluate(() => { __t.teleport(880, -560, -Math.PI / 2); __t.setCar({ v: 12 }); });
  await G.evaluate(() => { __t.teleport(880, -590, -Math.PI / 2); });
  await G.waitForFunction(() => LINK.debug().remotes.some(r => r.visible && Math.abs(r.x - 880) < 15 && Math.abs(r.z + 560) < 40), null, { timeout: 30000 });
  const seen = await G.evaluate(() => LINK.debug());
  await G.waitForTimeout(1500);
  // цвет: машина друга — красная (цвет места хозяина), а не белая: смотрим пиксели вокруг середины кузова
  const colour = await G.evaluate(() => new Promise(done => {
    const f = LINK.debug().remotes.find(x => x.visible); renderer.render(scene, camera);
    const img = new Image(); img.onload = () => {
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const cx = Math.round((f.nx * .5 + .5) * c.width), cy = Math.round((-f.ny * .5 + .5) * c.height), d = g.getImageData(cx - 3, cy - 3, 7, 7).data; let R = 0, G_ = 0, B = 0;
      for (let i = 0; i < d.length; i += 4) { R += d[i]; G_ += d[i + 1]; B += d[i + 2]; }
      const n = d.length / 4; done({ r: Math.round(R / n), g: Math.round(G_ / n), b: Math.round(B / n) });
    };
    img.src = renderer.domElement.toDataURL();
  }));
  const withCar = await G.evaluate(() => __t.info().calls);
  await G.evaluate(() => { LINK.mesh.visible = false; });
  await G.waitForTimeout(1500);
  const without = await G.evaluate(() => __t.info().calls);
  await G.evaluate(() => { LINK.mesh.visible = true; });
  if (SHOTS) {                                                    // крупный план: Аня стоит, Боря подъехал сзади
    await H.evaluate(() => { __t.teleport(880, -560, -Math.PI / 2); __t.setCar({ v: 0 }); }); await G.evaluate(() => { __t.teleport(880, -578, -Math.PI / 2); __t.setCar({ v: 0 }); });
    await G.waitForTimeout(3500);
  }
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await G.screenshot({ path: path.join(SHOTS, "link-guest-view.png") }); await H.screenshot({ path: path.join(SHOTS, "link-host-view.png") }); }
  await G.click("#dock-btn"); await G.click("#m-link"); await G.waitForSelector("#ov-link:not([hidden])");

  // Боря выходит — у Ани остаётся один игрок
  await G.click("#lk-stop");
  await H.waitForFunction(() => document.querySelectorAll("#lk-players li").length === 1, null, { timeout: 30000 });

  const r = seen.remotes.find(x => x.visible);
  const ok = !errs.length && names.length === 2 && r && r.name === "Аня" && withCar - without === 1 && guestCodesHidden && colour.r > colour.g * 1.25 && colour.r > colour.b * 1.25;
  console.log(JSON.stringify({ ok, names, remote: r && { name: r.name, x: Math.round(r.x), z: Math.round(r.z) }, drawCallsForFriend: withCar - without, guestCodesHidden, colour, sent: seen.sent, received: seen.received, errs }));
  await b.close(); process.exit(ok ? 0 : 1);
})().catch(e => { console.log(JSON.stringify({ ok: false, error: String(e).slice(0, 300) })); process.exit(1); });
