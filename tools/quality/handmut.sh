#!/usr/bin/env bash
# Ручные мутации по всем спискам (рычаг, пока не разрешён настоящий mutator). Код выхода ≠ 0 — есть выжившие.
set -u
cd "$(dirname "$0")/../.."
fail=0
python3 -I tools/quality/handmut.py --copy arcade/lib tests --test "node --test tests/unit/*.test.js" tools/quality/mutants/pose.txt | tail -1 || fail=1
python3 -I tools/quality/handmut.py --copy server tests --test "python3 -m unittest discover -s tests/server -t ." tools/quality/mutants/server.txt | tail -1 || fail=1
exit $fail
