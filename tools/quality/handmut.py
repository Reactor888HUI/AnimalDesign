"""Ручные мутации — рычаг, пока не разрешён настоящий mutator (docs/QUALITY.md).

Список мутаций — текстовый файл; строка:  файл | было ⇒ стало   (⏎ в тексте — перевод строки; # — комментарий).
Для каждой мутации скрипт копирует нужные папки во временную, подменяет один фрагмент и гоняет тесты:
тесты упали — мутант убит; прошли — ВЫЖИЛ (дыра в тестах: дописать тест, а не удалять мутацию).
Запуск:  python3 -I tools/quality/handmut.py --copy server tests --test "python3 -m unittest discover -s tests/server -t ." tools/quality/mutants/server.txt
Перед мутациями тесты обязаны пройти на нетронутой копии (иначе код выхода 2). Код выхода 0 — выживших нет.
"""
import argparse
import os
import shutil
import subprocess
import sys
import tempfile


def read_spec(path):
    for n, line in enumerate(open(path, encoding="utf8"), 1):
        line = line.rstrip("\n")
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        target, _, change = line.partition(" | ")
        old, sep, new = change.partition(" ⇒ ")
        if not (target and sep):
            sys.exit(f"{path}:{n}: ожидается «файл | было ⇒ стало»")
        yield n, target.strip(), old.replace("⏎", "\n"), new.replace("⏎", "\n")


def prepare(args, change):
    """Временная копия нужных папок проекта; change = (файл, новый текст) — подменяет один файл."""
    work = tempfile.mkdtemp(prefix="handmut-")
    for item in args.copy:
        src, dst = os.path.join(args.root, item), os.path.join(work, item)
        if os.path.isdir(src):
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns("__pycache__", "node_modules"))
        else:
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy(src, dst)
    if change:
        open(os.path.join(work, change[0]), "w", encoding="utf8").write(change[1])
    return work


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument("--copy", nargs="+", required=True, help="папки и файлы проекта, нужные тестам")
    ap.add_argument("--test", required=True, help="команда тестов; код выхода ≠ 0 — тесты упали")
    ap.add_argument("--root", default=os.getcwd())
    args = ap.parse_args()
    survivors = total = 0
    base = prepare(args, None)
    ok = subprocess.run(args.test, shell=True, cwd=base, capture_output=True, text=True)
    shutil.rmtree(base, ignore_errors=True)
    if ok.returncode != 0:     # без этого «упали» любые тесты — и каждый мутант выглядит убитым
        print("БАЗОВЫЕ ТЕСТЫ НЕ ПРОХОДЯТ в копии (не хватает --copy?):\n" + (ok.stdout + ok.stderr)[-1500:])
        sys.exit(2)
    for n, target, old, new in read_spec(args.spec):
        source = open(os.path.join(args.root, target), encoding="utf8").read()
        if source.count(old) < 1:
            print(f"НЕТ ФРАГМЕНТА  {args.spec}:{n}  {old[:50]!r}")
            survivors += 1
            continue
        work = prepare(args, (target, source.replace(old, new, 1)))
        try:
            killed = subprocess.run(args.test, shell=True, cwd=work, capture_output=True).returncode != 0
        finally:
            shutil.rmtree(work, ignore_errors=True)
        total += 1
        survivors += 0 if killed else 1
        print(("убит   " if killed else "ВЫЖИЛ  ") + f"{os.path.basename(target)}: {old[:50]!r} → {new[:30]!r}")
    print(f"выжило {survivors} из {total}")
    sys.exit(1 if survivors else 0)


if __name__ == "__main__":
    main()
