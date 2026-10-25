"""Сравнение папок кадров tools/arcade-same.cjs: сводка сцены — точно, кадры — средняя разница пикселей.
Игра не повторяет кадры бит-в-бит (шум ~1–3 уровня яркости между двумя прогонами одной версии), поэтому
третьим аргументом даётся папка второго прогона эталона: «после» не должно отличаться сильнее, чем эталон от себя.
Запуск: python3 -I tools/same-diff.py <эталон> <проверяемое> [<эталон-повтор>]   → код выхода 0, если совпало."""
import sys, os, json
from PIL import Image, ImageChops, ImageStat
a, b = sys.argv[1:3]; ref = sys.argv[3] if len(sys.argv) > 3 else None; bad = 0
def md(x, y, f):
    d = ImageChops.difference(Image.open(os.path.join(x, f)).convert("L"), Image.open(os.path.join(y, f)).convert("L"))
    return ImageStat.Stat(d).mean[0]
for f in sorted(x for x in os.listdir(a) if x.endswith(".png")):
    m = md(a, b, f); n = md(a, ref, f) if ref else 0.0; ok = m <= max(n * 1.5, .5)
    print(f"{f:16s} разница {m:6.2f}   шум эталона {n:6.2f}   {'ок' if ok else 'ОТЛИЧАЕТСЯ'}"); bad += not ok
sa, sb = (json.load(open(os.path.join(x, "summary.json"))) for x in (a, b))
for k in sa:
    if sa[k] != sb.get(k): print("сводка отличается:", k, sa[k], "≠", sb.get(k)); bad += 1
print("СОВПАЛО" if not bad else f"РАЗЛИЧИЙ: {bad}"); sys.exit(1 if bad else 0)
