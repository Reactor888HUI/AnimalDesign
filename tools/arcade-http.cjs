// Игра по ссылке: сборка «папкой» (dist/vosmerka-web) отдаётся по http из вложенной папки адреса, как на GitHub Pages
// (/<репозиторий>/), и запускается без ошибок. Запуск: PW=$(npm root -g)/playwright node tools/arcade-http.cjs
const http = require("http"), fs = require("fs"), path = require("path");
const { chromium } = require(process.env.PW || "playwright");
const ROOT = path.resolve(__dirname, "../dist/vosmerka-web"), BASE = "/AnimalDesign/";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mp3": "audio/mpeg", ".png": "image/png", ".jpg": "image/jpeg" };
const seen = [], notFound = [];
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]); seen.push(url);
  if (!url.startsWith(BASE)) { notFound.push(url); res.writeHead(404); return res.end(); }
  const file = path.join(ROOT, url.slice(BASE.length) || "index.html");
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { notFound.push(url); res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }); fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  const port = server.address().port;
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await b.newPage(), errs = [];
  p.on("pageerror", e => errs.push(e.message)); p.on("console", m => m.type() === "error" && errs.push(m.text())); p.on("requestfailed", r => errs.push("не загрузилось: " + r.url()));
  await p.goto(`http://127.0.0.1:${port}${BASE}index.html#test`);
  await p.waitForFunction(() => window.__t, null, { timeout: 120000 }); await p.waitForTimeout(3000);
  const info = await p.evaluate(() => window.__t.info()), secure = await p.evaluate(() => isSecureContext);
  const fatal = await p.evaluate(() => document.getElementById("fatal")?.textContent || null);
  const missing = seen.filter(u => u.startsWith(BASE) && !fs.existsSync(path.join(ROOT, u.slice(BASE.length) || "index.html")));
  const ok = !errs.length && !fatal && info.calls > 10 && !missing.length;
  console.log(JSON.stringify({ ok, files: seen.length, calls: info.calls, secure, fatal, errs, notFound, missing }));
  await b.close(); server.close(); process.exit(ok ? 0 : 1);
})();
