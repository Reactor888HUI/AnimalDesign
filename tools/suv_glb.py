"""Чтение GLB внедорожника: узлы с мировыми матрицами, примитивы (позиции, нормали, индексы) — без морфов и текстур."""
import json, struct
import numpy as np

def read(path):
    b = open(path, 'rb').read()
    off, j, binb = 12, None, None
    while off < len(b):
        ln, tp = struct.unpack('<II', b[off:off + 8]); off += 8
        if tp == 0x4E4F534A: j = json.loads(b[off:off + ln])
        elif tp == 0x004E4942: binb = b[off:off + ln]
        off += ln
    CT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16}
    NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
    def acc(i):
        a = j['accessors'][i]; v = j['bufferViews'][a['bufferView']]; dt = CT[a['componentType']]; n = NC[a['type']]
        st = (v.get('byteOffset', 0) + a.get('byteOffset', 0)); stride = v.get('byteStride', 0) or n * np.dtype(dt).itemsize
        if stride == n * np.dtype(dt).itemsize:
            return np.frombuffer(binb, dt, a['count'] * n, st).reshape(a['count'], n) if n > 1 else np.frombuffer(binb, dt, a['count'], st)
        raw = np.frombuffer(binb, np.uint8, a['count'] * stride, st).reshape(a['count'], stride)[:, :n * np.dtype(dt).itemsize]
        return raw.copy().view(dt).reshape(a['count'], n)
    def local(n):
        if 'matrix' in n: return np.array(n['matrix'], np.float64).reshape(4, 4).T
        M = np.eye(4); t = n.get('translation', [0, 0, 0]); r = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
        x, y, z, w = r
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M[:3, :3] = R * np.array(s); M[:3, 3] = t; return M
    parent = {}
    for i, n in enumerate(j['nodes']):
        for c in n.get('children', []): parent[c] = i
    def world(i):
        M = local(j['nodes'][i])
        while i in parent: i = parent[i]; M = local(j['nodes'][i]) @ M
        return M
    def chain(i):
        out = [i]
        while i in parent: i = parent[i]; out.append(i)
        return [j['nodes'][k].get('name', '') for k in out]
    prims = []
    for i, n in enumerate(j['nodes']):
        if 'mesh' not in n: continue
        for p in j['meshes'][n['mesh']]['primitives']:
            pos = acc(p['attributes']['POSITION']).astype(np.float64); nor = acc(p['attributes']['NORMAL']).astype(np.float64)
            idx = acc(p['indices']).astype(np.int64).reshape(-1, 3) if 'indices' in p else np.arange(len(pos)).reshape(-1, 3)
            prims.append(dict(node=i, name=n.get('name', ''), mesh=j['meshes'][n['mesh']].get('name', ''), chain=chain(i), M=world(i), mat=p['material'], pos=pos, nor=nor, idx=idx))
    return j, prims, world, parent
