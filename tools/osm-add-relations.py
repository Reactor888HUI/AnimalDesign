# Дописать в .osm отношения целиком (все линии и узлы) с api.openstreetmap.org — для Blosm без Overpass (loadMissingMembers=False).
#   python3 -I tools/osm-add-relations.py вход.osm выход.osm 1876517 6194259     (Дон: два мультиполигона воды)
# Без этого река, чьи линии выходят за рамку выгрузки, не собирается в полигон и пропадает.
import sys, urllib.request, xml.etree.ElementTree as ET
src, dst, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
t = ET.parse(src); root = t.getroot(); have = {(e.tag, e.get("id")) for e in root}
add = {"node": [], "way": [], "relation": []}
for rid in ids:
    with urllib.request.urlopen(f"https://api.openstreetmap.org/api/0.6/relation/{rid}/full", timeout=60) as r: full = ET.fromstring(r.read())
    for e in full:
        if e.tag in add and (e.tag, e.get("id")) not in have: have.add((e.tag, e.get("id"))); add[e.tag].append(e)
rest = [e for e in root if e.tag not in add]; by = {k: [e for e in root if e.tag == k] + add[k] for k in add}
for e in list(root): root.remove(e)
for e in rest + by["node"] + by["way"] + by["relation"]: root.append(e)     # порядок OSM: узлы, линии, отношения
t.write(dst, encoding="utf-8", xml_declaration=True)
print("добавлено:", {k: len(v) for k, v in add.items()})
