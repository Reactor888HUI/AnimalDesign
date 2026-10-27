#!/usr/bin/env bash
# Ворота качества по навыку ub-mode — для ИЗМЕНЁННОГО и нового кода (git: добавлено и правлено относительно HEAD).
#   tools/quality/run.sh            чистая логика: тесты + покрытие, CRAP < 10, дублирование < 0,8, мутации
#   tools/quality/run.sh --fast     без мутаций (они долгие)
# Старый код не трогаем, пока его не правят: см. docs/QUALITY.md («храповик»). Код выхода ≠ 0 — ворота не пройдены.
set -eu
ROOT=$(cd "$(dirname "$0")/../.." && pwd); cd "$ROOT"; T=$ROOT/.tools
[ -x "$T/crapper/crapper" ] || { echo "нет .tools — сначала tools/quality/setup.sh"; exit 1; }
echo "-- тесты и покрытие"; npm run coverage --silent
echo "-- CRAP (порог 10)";        "$T/crapper/crapper" --use-existing-coverage --changed --threshold 10
echo "-- дублирование (порог 0,8)"; "$T/dryer/dryer" --changed --threshold 0.8
[ "${1:-}" = "--fast" ] || { echo "-- мутации"; "$T/mutator/mutator" --changed --use-existing-coverage --test-command "npm test --silent"; }
