"""Рельеф по настоящим высотам: Copernicus GLO-30 (DSM, 30 м) → сетка высот земли в координатах игры → arcade/data/height.js.

Запуск: python3 -I tools/dem-to-game.py <тайл Copernicus N47 E039 .tif> [масштаб=0.85] [шаг=20]
Тайл: https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N47_00_E039_00_DEM/Copernicus_DSM_COG_10_N47_00_E039_00_DEM.tif
(© DLR e.V. 2010–2014 и © Airbus Defence and Space GmbH 2014–2018, предоставлено в рамках Copernicus ЕС и ЕКА).

DSM — это поверхность с крышами и деревьями; землю получаем минимумом в окне ~150 м и сглаживанием (точность ±3–5 м
в плотной застройке). Вода в данных ровно 0. Координаты — та же система, что у tools/osm-to-game.py (якорь —
arcade/refs/rostov-center.osm, карта повёрнута на 180°). Масштаб 0,85 разрешён заказчиком (ТЗ, раздел 9).
Сетка — полоса основной карты с запасом 240 м по x (как прежний придуманный холм), по z — от Дона до края у автобана.
Выход: const HEIGHT = { x0, z0, step, nx, nz, q: "<base64 uint8, высота/0,25 м, строки по z>" }.
"""
import sys, os, math, json, base64
import xml.etree.ElementTree as ET
import numpy as np, tifffile
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIF = sys.argv[1]; SCALE = float(sys.argv[2]) if len(sys.argv) > 2 else .85; STEP = float(sys.argv[3]) if len(sys.argv) > 3 else 20.0
bd = ET.parse(os.path.join(ROOT, "arcade", "refs", "rostov-center.osm")).getroot().find("bounds").attrib
LA0, LA1, LO0, LO1 = (float(bd[k]) for k in ("minlat", "maxlat", "minlon", "maxlon"))
KX = 111320 * math.cos(math.radians((LA0 + LA1) / 2)); KY = 110574
W, H = (LO1 - LO0) * KX, (LA1 - LA0) * KY
X_CENTER, Z_TOP = 280.0, -82.0
def latlon(x, z):                                  # обратное к game(local(lat, lon)) из osm-to-game.py
    e = X_CENTER + W / 2 - x; n = z - Z_TOP + H
    return LA0 + n / KY, LO0 + e / KX
osm = open(os.path.join(ROOT, "arcade", "data", "osm-main.js"), encoding="utf8").read()
clip = json.loads(osm[osm.index("/*OSM-DATA*/") + 12: osm.index("/*/OSM-DATA*/")])["clip"]
X0, Z0, X1, Z1 = clip[0] / 10, clip[1] / 10, clip[2] / 10, clip[3] / 10
X0, X1 = min(X0, X1) - 240, max(X0, X1) + 240; Z0, Z1 = min(Z0, Z1), max(Z0, Z1)
a = tifffile.imread(TIF).astype(np.float32); R, C = a.shape          # тайл 1°×1°, строка 0 — север (широта 48)
g = ndimage.uniform_filter(ndimage.minimum_filter(a, size=(5, 7)), size=(5, 7))   # ~150 м: без домов и деревьев
g[a <= 0] = 0                                                         # вода — ноль
def dem(lat, lon):                                                    # билинейно
    r, c = (48 - lat) * R - .5, (lon - 39) * C - .5; r0, c0 = int(r), int(c); fr, fc = r - r0, c - c0
    v = g[r0:r0 + 2, c0:c0 + 2]
    return float(v[0, 0] * (1 - fr) * (1 - fc) + v[0, 1] * (1 - fr) * fc + v[1, 0] * fr * (1 - fc) + v[1, 1] * fr * fc)
nx, nz = int(math.ceil((X1 - X0) / STEP)) + 1, int(math.ceil((Z1 - Z0) / STEP)) + 1
grid = np.zeros((nz, nx), np.float32)
for j in range(nz):
    for i in range(nx): grid[j, i] = max(0., dem(*latlon(X0 + i * STEP, Z0 + j * STEP))) * SCALE
q = np.clip(np.round(grid / .25), 0, 255).astype(np.uint8)
out = {"x0": X0, "z0": Z0, "step": STEP, "nx": nx, "nz": nz, "scale": SCALE, "q": base64.b64encode(q.tobytes()).decode()}
dst = os.path.join(ROOT, "arcade", "data", "height.js")
open(dst, "w", encoding="utf8").write("// Данные игры — подключаются <script src> до кода игры (работает и с file://).\n"
    "// Источник: tools/dem-to-game.py (Copernicus GLO-30 © DLR e.V. 2010–2014 и © Airbus Defence and Space GmbH 2014–2018,\n"
    "// предоставлено в рамках Copernicus ЕС и ЕКА). Руками не править.\nconst HEIGHT = " + json.dumps(out, separators=(",", ":")) + ";\n")
print(f"сетка {nx}×{nz}, шаг {STEP:.0f} м, x {X0:.0f}…{X1:.0f}, z {Z0:.0f}…{Z1:.0f}, макс. {grid.max():.1f} м (масштаб {SCALE}), {os.path.getsize(dst) // 1024} КБ")
