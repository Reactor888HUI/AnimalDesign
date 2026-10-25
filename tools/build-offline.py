"""Сборка игры для скачивания — две версии, обе работают без интернета и открываются прямо из файла:

1) dist/vosmerka-baklazhan/index.html — всё в одном файле (Three.js, данные, песня внутри) + dist/vosmerka-baklazhan.zip;
2) dist/vosmerka-web/ — папкой: index.html (код) + data/*.js (карта, модели, фото, звуки, песня) + vendor/three.min.js.
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
mline = re.search(r'^const PARTY_MUSIC = "refs/music/party\.mp3";.*\n', src, flags=re.M)
assert mline, "в index.html не найдена ссылка на песню вечеринки"
mp3 = base64.b64encode(open(os.path.join(ARC, "refs", "music", "party.mp3"), "rb").read()).decode()
music_js = 'const PARTY_MUSIC = "data:audio/mpeg;base64,%s";   /*PARTY-MUSIC*/' % mp3
DATA = re.findall(r'<script src="(data/[a-z0-9-]+\.js)"></script>', src)
assert DATA, "в index.html нет подключений data/*.js"
head = '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n'
tail = "\n</body>\n</html>\n"
esc = lambda s: s.replace("</script", "<\\/script")
three_note = "/* Three.js r149, MIT License, (c) 2010-2023 three.js authors — встроен, чтобы игра работала без интернета */\n"

# --- 1) один файл
one = src.replace(tag, "<script>" + three_note + esc(three) + "\n</script>")
for d in DATA:
    one = one.replace('<script src="%s"></script>' % d, "<script>\n" + esc(open(os.path.join(ARC, d), encoding="utf8").read()) + "</script>")
one = one.replace(mline.group(0), music_js + "\n")
out_dir = os.path.join(ROOT, "dist", "vosmerka-baklazhan")
os.makedirs(out_dir, exist_ok=True)
open(os.path.join(out_dir, "index.html"), "w", encoding="utf8").write(head + one + tail)
with zipfile.ZipFile(os.path.join(ROOT, "dist", "vosmerka-baklazhan.zip"), "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in ("index.html", "README.txt"):
        z.write(os.path.join(out_dir, f), "vosmerka-baklazhan/" + f)

# --- 2) папкой
web = os.path.join(ROOT, "dist", "vosmerka-web")
shutil.rmtree(web, ignore_errors=True)
os.makedirs(os.path.join(web, "data")); os.makedirs(os.path.join(web, "vendor"))
for d in DATA:
    shutil.copyfile(os.path.join(ARC, d), os.path.join(web, d))
open(os.path.join(web, "data", "music.js"), "w", encoding="utf8").write(
    "// Песня вечеринки (файл игрока, arcade/refs/music/party.mp3) — data:-адрес; собирает tools/build-offline.py.\n" + music_js + "\n")
open(os.path.join(web, "vendor", "three.min.js"), "w", encoding="utf8").write(three_note + three)
w = src.replace(tag, '<script src="vendor/three.min.js"></script>').replace(mline.group(0), "")
w = w.replace('<script src="%s"></script>' % DATA[-1], '<script src="%s"></script>\n<script src="data/music.js"></script>' % DATA[-1])
open(os.path.join(web, "index.html"), "w", encoding="utf8").write(head + w + tail)
shutil.copyfile(os.path.join(out_dir, "README.txt"), os.path.join(web, "README.txt"))

kb = lambda p: os.path.getsize(p) // 1024
print("один файл: index.html %d КБ, zip %d КБ" % (kb(os.path.join(out_dir, "index.html")), kb(os.path.join(ROOT, "dist", "vosmerka-baklazhan.zip"))))
print("папкой: index.html %d КБ, data/ %d КБ, vendor/ %d КБ" % (kb(os.path.join(web, "index.html")),
      sum(kb(os.path.join(web, "data", f)) for f in os.listdir(os.path.join(web, "data"))), kb(os.path.join(web, "vendor", "three.min.js"))))
