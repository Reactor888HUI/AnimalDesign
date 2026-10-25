"""Кузов «восьмёрки»: результат tools/blender/vaz-body.py (двоичный: JSON-заголовок + треугольники, уже в осях игры) → компактный
ассет в arcade/data/vaz-body.js (блок `const VAZ_BODY_DATA = "…";`). Формат — как у руля (tools/build-wheel.py): сварка одинаковых
вершин, позиции int16, нормали int8, AO uint8, UV uint16 (нули), индексы uint16/uint32.
Запуск: blender -b --factory-startup --python tools/blender/vaz-body.py -- body.bin && python3 -I tools/build-vaz-body.py body.bin
"""
import base64, json, os, re, struct, sys
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
b = open(sys.argv[1], 'rb').read(); n = struct.unpack('<I', b[:4])[0]; hdr = json.loads(b[4:4 + n]); o = 4 + n
blob, recs = bytearray(), []
for name, cnt in hdr.items():
    a = np.frombuffer(b, np.float32, cnt * 9, o).reshape(-1, 9).astype(np.float64); o += cnt * 36
    key = np.round(a * [1e5, 1e5, 1e5, 100, 100, 100, 50, 1e4, 1e4]).astype(np.int64)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    V, idx = a[first], inv.reshape(-1).astype(np.uint16 if len(first) < 65536 else np.uint32)
    mn, mx = V[:, :3].min(0), V[:, :3].max(0); sc = np.maximum(mx - mn, 1e-6)
    qp = np.round((V[:, :3] - mn) / sc * 65535 - 32768).astype(np.int16)
    nn = V[:, 3:6] / np.maximum(np.linalg.norm(V[:, 3:6], axis=1, keepdims=True), 1e-9); qn = np.round(nn * 127).astype(np.int8)
    qa = np.round(np.clip(V[:, 6], 0, 1) * 255).astype(np.uint8); quv = np.round(np.clip(V[:, 7:9], 0, 1) * 65535).astype(np.uint16)
    rec = {'m': name, 'n': len(V), 'i': len(idx), 'big': idx.dtype == np.uint32, 'mn': [round(float(v), 6) for v in mn], 'sc': [round(float(v), 6) for v in sc], 'o': []}
    for arr in (qp, qn, qa, quv, idx):
        while len(blob) % 4: blob.append(0)
        rec['o'].append(len(blob)); blob += arr.tobytes()
    recs.append(rec); print(f'  {name}: {len(idx) // 3} тр., {len(V)} верш.')
hj = json.dumps(recs, separators=(',', ':')).encode(); data = struct.pack('<I', len(hj)) + hj
while len(data) % 4: data += b'\0'
out = base64.b64encode(data + bytes(blob)).decode()
html = os.path.join(ROOT, 'arcade', 'data', 'vaz-body.js')
if not os.path.exists(html): open(html, 'w', encoding='utf-8').write('// Данные игры — подключаются <script src> до кода игры (работает и с file://).\n// Источник: tools/blender/vaz-body.py → tools/build-vaz-body.py. Руками не править.\nconst VAZ_BODY_DATA = "";\n')
s = open(html, encoding='utf-8').read()
s2, k = re.subn(r'const VAZ_BODY_DATA = "[^"]*";', 'const VAZ_BODY_DATA = "%s";' % out, s)
if k != 1: sys.exit('нет метки const VAZ_BODY_DATA = "…"; в arcade/data/vaz-body.js')
open(html, 'w', encoding='utf-8').write(s2); print(f'кузов: {len(out) // 1024} КБ base64 → {html}')
