#!/usr/bin/env bash
# Ставит парные инструменты навыка ub-mode (crapper, dryer, mutator) в .tools/ рядом с проектом (в git не хранится).
# Версии зафиксированы ниже; mutator ищет crapper рядом (../crapper), поэтому все три лежат в одной папке.
# ВНИМАНИЕ: первый запуск каждого инструмента сам создаёт .venv и ставит из PyPI tree-sitter и tree-sitter-language-pack.
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd); T=$ROOT/.tools; mkdir -p "$T"
pin() {   # имя, коммит
  [ -d "$T/$1/.git" ] || git clone -q --no-checkout "https://github.com/unclebob/$1" "$T/$1"
  git -C "$T/$1" fetch -q --depth 1 origin "$2" && git -C "$T/$1" checkout -q "$2"
  echo "  $1 @ $(git -C "$T/$1" rev-parse --short HEAD)"
}
pin crapper 6fd92c4c9bcc56efb64a2f8743d5a2993bcfd42d
pin dryer   66ff6d21a42c04afcad89c78a80066176d1294b0
pin mutator a5a0cb803b66e0cdb8bf471b3b08af701d424a41
