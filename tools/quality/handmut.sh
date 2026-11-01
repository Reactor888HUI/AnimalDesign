#!/usr/bin/env bash
# Ручные мутации по всем спискам (рычаг, пока не разрешён настоящий mutator). Код выхода ≠ 0 — есть выжившие или базовые тесты не прошли.
# JS-тестам нужен и server/: сквозные тесты запускают Python-сервер процессом.
set -u
cd "$(dirname "$0")/../.."
fail=0
for list in pose netclient hub remote direct; do
  echo "-- $list"
  python3 -I tools/quality/handmut.py --copy arcade/lib server tests --test "node --test tests/unit/*.test.js" "tools/quality/mutants/$list.txt" | tail -1 || fail=1
done
echo "-- server"
python3 -I tools/quality/handmut.py --copy server tests --test "python3 -m unittest discover -s tests/server -t ." tools/quality/mutants/server.txt | tail -1 || fail=1
exit $fail
