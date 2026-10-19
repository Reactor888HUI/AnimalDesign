"""Сборка игры одним файлом для скачивания: Three.js встраивается внутрь, интернет не нужен.

Запуск: python3 -I tools/build-offline.py   (нужен three.min.js r149: скачивается с jsdelivr или берётся из dist/three.min.js)
Результат: dist/vosmerka-baklan/index.html и dist/vosmerka-baklan.zip
"""
import os, sys, urllib.request, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.min.js"
cache = os.path.join(ROOT, "dist", "three.min.js")
if not os.path.exists(cache):
    urllib.request.urlretrieve(URL, cache)
three = open(cache, encoding="utf8").read().replace("</script", "<\\/script")
src = open(os.path.join(ROOT, "arcade", "index.html"), encoding="utf8").read()
tag = '<script src="%s"></script>' % URL
assert src.count(tag) == 1, "в index.html не найден тег Three.js"
head = '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n</head>\n<body>\n'
body = src.replace(tag, "<script>/* Three.js r149, MIT License, (c) 2010-2023 three.js authors — встроен, чтобы игра работала без интернета */\n" + three + "\n</script>")
out_dir = os.path.join(ROOT, "dist", "vosmerka-baklan")
os.makedirs(out_dir, exist_ok=True)
open(os.path.join(out_dir, "index.html"), "w", encoding="utf8").write(head + body + "\n</body>\n</html>\n")
with zipfile.ZipFile(os.path.join(ROOT, "dist", "vosmerka-baklan.zip"), "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in ("index.html", "README.txt"):
        z.write(os.path.join(out_dir, f), "vosmerka-baklan/" + f)
print("index.html %d КБ, zip %d КБ" % (os.path.getsize(os.path.join(out_dir, "index.html")) // 1024, os.path.getsize(os.path.join(ROOT, "dist", "vosmerka-baklan.zip")) // 1024))
