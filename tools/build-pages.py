"""Сайт для GitHub Pages (и любого статического хостинга): игра папкой + автономная версия для скачивания.

Запуск: python3 -I tools/build-pages.py   (сначала собирается игра: tools/build-offline.py; здесь — только раскладка)
Результат — dist/pages/ (в git не хранится):
  index.html, js/, lib/, data/, vendor/   — игра (открывается сразу по адресу сайта; пути относительные — подходит любая вложенная папка адреса)
  offline/vosmerka-baklazhan.html          — автономная версия одним файлом (скачать и играть без интернета; прямое соединение с друзьями работает и в ней)
  offline/vosmerka-baklazhan.zip           — то же в архиве
  .nojekyll                                — чтобы GitHub не обрабатывал папки как Jekyll
Публикация: tools/publish-pages.sh (место указывает человек — см. docs/HOSTING.md).
"""
import os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
web, one, zipf = (os.path.join(ROOT, "dist", p) for p in ("vosmerka-web", os.path.join("vosmerka-baklazhan", "index.html"), "vosmerka-baklazhan.zip"))
for p in (web, one, zipf):
    if not os.path.exists(p):
        sys.exit("нет %s — сначала python3 -I tools/build-offline.py" % os.path.relpath(p, ROOT))
out = os.path.join(ROOT, "dist", "pages")
shutil.rmtree(out, ignore_errors=True)
shutil.copytree(web, out)
os.makedirs(os.path.join(out, "offline"))
shutil.copy(one, os.path.join(out, "offline", "vosmerka-baklazhan.html"))
shutil.copy(zipf, os.path.join(out, "offline", "vosmerka-baklazhan.zip"))
open(os.path.join(out, ".nojekyll"), "w").close()
size = sum(os.path.getsize(os.path.join(d, f)) for d, _, fs in os.walk(out) for f in fs)
print("сайт: %s, %d КБ (в т.ч. автономная версия %d КБ)" % (os.path.relpath(out, ROOT), size // 1024, os.path.getsize(one) // 1024))
