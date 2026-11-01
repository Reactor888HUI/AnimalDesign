#!/usr/bin/env bash
# Выкладка сайта (dist/pages) в ветку репозитория: tools/publish-pages.sh <адрес репозитория> <ветка> [путь внутри ветки]
# Пример для отдельного репозитория под Pages:  tools/publish-pages.sh https://github.com/ВЛАДЕЛЕЦ/vosmerka-baklazhan main
# ВНИМАНИЕ: содержимое ветки (или указанной папки) заменяется. Не указывайте ветку, из которой уже публикуется другая игра
# (см. docs/HOSTING.md: у Reactor888HUI/AnimalDesign адрес Pages занят «Собачьим кварталом 3D»). Скрипт ничего не выбирает за вас.
set -eu
[ $# -ge 2 ] || { sed -n 2,5p "$0"; exit 2; }
ROOT=$(cd "$(dirname "$0")/.." && pwd); SITE=$ROOT/dist/pages; REPO=$1; BRANCH=$2; SUB=${3:-}
[ -f "$SITE/index.html" ] || { echo "нет dist/pages — сначала python3 -I tools/build-offline.py && python3 -I tools/build-pages.py"; exit 1; }
WORK=$(mktemp -d); trap 'rm -rf "$WORK"' EXIT
if git ls-remote --exit-code --heads "$REPO" "$BRANCH" >/dev/null 2>&1; then
  git clone -q --depth 1 --branch "$BRANCH" "$REPO" "$WORK/r"
else                                              # ветки ещё нет (или репозиторий пуст): начнём с чистого листа
  git init -q -b "$BRANCH" "$WORK/r"; git -C "$WORK/r" remote add origin "$REPO"
fi
DEST=$WORK/r${SUB:+/$SUB}; mkdir -p "$DEST"
find "$DEST" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -R "$SITE"/. "$DEST"/
git -C "$WORK/r" add -A
git -C "$WORK/r" -c user.name="${GIT_AUTHOR_NAME:-Claude}" -c user.email="${GIT_AUTHOR_EMAIL:-noreply@anthropic.com}" commit -q -m "Сайт игры «Восьмёрка Баклажан»" || { echo "нечего выкладывать — сайт не изменился"; exit 0; }
git -C "$WORK/r" push origin "$BRANCH"
echo "выложено: $REPO ($BRANCH${SUB:+, /$SUB})"
