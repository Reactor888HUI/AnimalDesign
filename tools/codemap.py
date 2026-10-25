"""Карта кода: какие разделы и имена верхнего уровня лежат в каком файле arcade/js/*.js и arcade/data/*.js.
Запуск: python3 -I tools/codemap.py   → docs/CODEMAP.md (пересоздаётся целиком; руками не править).
Имена — по строкам, начинающимся с const/let/function/class (у «const A = …, B = …» берётся только A)."""
import os, re, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DECL = re.compile(r"^(?:const|let|function|class) ([A-Za-z_$][\w$]*)")
SECT = re.compile(r"^/\* -+ (.*?) -+ \*/")
out = ["# Карта кода «Восьмёрки Баклажан»", "",
       "Создаётся `python3 -I tools/codemap.py` — руками не править. Файлы грузятся в этом порядке; все имена верхнего уровня общие.",
       "Как устроено и зачем — в `docs/ARCHITECTURE.md`.", ""]
idx = {}
for kind, pat in (("Код", "arcade/js/*.js"), ("Данные", "arcade/data/*.js")):
    out += [f"## {kind}: `{os.path.dirname(pat)}/`", ""]
    for p in sorted(glob.glob(os.path.join(ROOT, pat))):
        L = open(p, encoding="utf8").read().split("\n"); f = os.path.basename(p)
        desc = L[0].split("—", 1)[-1].strip().rstrip(".") if L and L[0].startswith("//") else ""
        names, sects = [], []
        for i, l in enumerate(L, 1):
            m = SECT.match(l)
            if m: sects.append(f"{m.group(1)} (стр. {i})")
            m = DECL.match(l)
            if m: names.append(m.group(1)); idx.setdefault(m.group(1), f)
        kb = os.path.getsize(p) // 1024
        out += [f"### `{f}` — {len(L)} строк, {kb} КБ", ""]
        if kind == "Код": out += [desc[:1].upper() + desc[1:] + ".", ""] if desc else []
        if sects: out += ["Разделы: " + " · ".join(sects), ""]
        out += ["Имена: " + ", ".join(f"`{n}`" for n in names), ""]
out += ["## Указатель имён", "", "| Имя | Файл |", "|---|---|"] + [f"| `{n}` | `{f}` |" for n, f in sorted(idx.items(), key=lambda x: x[0].lower())]
open(os.path.join(ROOT, "docs", "CODEMAP.md"), "w", encoding="utf8").write("\n".join(out) + "\n")
print(f"docs/CODEMAP.md: {len(idx)} имён")
