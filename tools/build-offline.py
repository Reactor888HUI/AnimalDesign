"""Сборка игры для скачивания — две версии, обе работают без интернета и открываются прямо из файла:

1) dist/vosmerka-baklazhan/index.html — всё в одном файле (Three.js, данные, песня внутри) + dist/vosmerka-baklazhan.zip;
2) dist/vosmerka-web/ — папкой: index.html + js/*.js (код) + data/*.js (карта, модели, фото, звуки, песня) + vendor/three.min.js.
   Данные подключаются через <script src>, а не fetch: так браузер разрешает и с file://, и с сайта.

Запуск: python3 -I tools/build-offline.py   (нужен three.min.js r149: скачивается с jsdelivr или берётся из dist/three.min.js)
Песня вечеринки arcade/refs/music/party.mp3 встраивается как data:-адрес.
"""
import os, re, shutil, urllib.request, zipfile, base64

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARC = os.path.join(ROOT, "arcade")
URL = "https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"
cache = os.path.join(ROOT, "dist", "three.min.js")
if not os.path.exists(cache):
    urllib.request.urlretrieve(URL, cache)
three = open(cache, encoding="utf8").read()
src = open(os.path.join(ARC, "index.html"), encoding="utf8").read()
tag = '<script src="%s"></script>' % URL
assert src.count(tag) == 1, "в index.html не найден тег Three.js"
FILES = re.findall(r'<script src="((?:data|js)/[0-9a-z-]+\.js)"></script>', src)
assert FILES, "в index.html нет подключений data/*.js и js/*.js"
TEXT = {f: open(os.path.join(ARC, f), encoding="utf8").read() for f in FILES}
MRE = re.compile(r'^const PARTY_MUSIC = "refs/music/party\.mp3";.*\n', flags=re.M)
mfile = [f for f in FILES if MRE.search(TEXT[f])]
assert len(mfile) == 1, "не найдена ссылка на песню вечеринки (const PARTY_MUSIC) в js/*.js"
mfile = mfile[0]
mp3 = base64.b64encode(open(os.path.join(ARC, "refs", "music", "party.mp3"), "rb").read()).decode()
music_js = 'const PARTY_MUSIC = "data:audio/mpeg;base64,%s";   /*PARTY-MUSIC*/' % mp3
head = '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n'
tail = "\n</body>\n</html>\n"
esc = lambda s: s.replace("</script", "<\\/script")
three_note = "/* Three.js r149, MIT License, (c) 2010-2023 three.js authors — встроен, чтобы игра работала без интернета */\n"

# --- 1) один файл
one = src.replace(tag, "<script>" + three_note + esc(three) + "\n</script>")
for f in FILES:
    t = MRE.sub(lambda m: music_js + "\n", TEXT[f]) if f == mfile else TEXT[f]
    one = one.replace('<script src="%s"></script>' % f, "<script>\n" + esc(t) + "</script>")
out_dir = os.path.join(ROOT, "dist", "vosmerka-baklazhan")
os.makedirs(out_dir, exist_ok=True)
open(os.path.join(out_dir, "index.html"), "w", encoding="utf8").write(head + one + tail)
with zipfile.ZipFile(os.path.join(ROOT, "dist", "vosmerka-baklazhan.zip"), "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in ("index.html", "README.txt"):
        z.write(os.path.join(out_dir, f), "vosmerka-baklazhan/" + f)

# --- 2) папкой
web = os.path.join(ROOT, "dist", "vosmerka-web")
shutil.rmtree(web, ignore_errors=True)
for d in ("data", "js", "vendor"): os.makedirs(os.path.join(web, d))
for f in FILES:      # песня — отдельным data/music.js (грузится до кода), строка-ссылка из кода убирается
    open(os.path.join(web, f), "w", encoding="utf8").write(MRE.sub("", TEXT[f]) if f == mfile else TEXT[f])
open(os.path.join(web, "data", "music.js"), "w", encoding="utf8").write(
    "// Песня вечеринки (файл игрока, arcade/refs/music/party.mp3) — data:-адрес; собирает tools/build-offline.py.\n" + music_js + "\n")
open(os.path.join(web, "vendor", "three.min.js"), "w", encoding="utf8").write(three_note + three)
w = src.replace(tag, '<script src="vendor/three.min.js"></script>\n<script src="data/music.js"></script>')
open(os.path.join(web, "index.html"), "w", encoding="utf8").write(head + w + tail)
shutil.copyfile(os.path.join(out_dir, "README.txt"), os.path.join(web, "README.txt"))

kb = lambda p: os.path.getsize(p) // 1024
print("один файл: index.html %d КБ, zip %d КБ" % (kb(os.path.join(out_dir, "index.html")), kb(os.path.join(ROOT, "dist", "vosmerka-baklazhan.zip"))))
dkb = lambda d: sum(kb(os.path.join(web, d, f)) for f in os.listdir(os.path.join(web, d)))
print("папкой: index.html %d КБ, js/ %d КБ, data/ %d КБ, vendor/ %d КБ" % (kb(os.path.join(web, "index.html")), dkb("js"), dkb("data"), dkb("vendor")))
