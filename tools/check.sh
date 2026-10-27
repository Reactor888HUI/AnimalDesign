#!/usr/bin/env bash
# Одна команда проверки перед коммитом.
#   tools/check.sh          быстро (~5 мин): синтаксис, сборка, запуск без ошибок, бюджет кадра, «ничего не изменилось» к HEAD
#   tools/check.sh full     + все автотесты (~40 мин): стабильные блокируют, нестабильные — только в отчёт
#   tools/check.sh same REF сравнить кадры с другим коммитом (по умолчанию HEAD)
# Отчёт: .check/report.txt (папка в git не хранится). Код выхода 0 — всё стабильное прошло.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd); cd "$ROOT"
export PW=${PW:-$(npm root -g)/playwright}
MODE=${1:-quick}; REF=${2:-HEAD}
OUT=$ROOT/.check; rm -rf "$OUT"; mkdir -p "$OUT"
REP=$OUT/report.txt; FAIL=0
say() { echo "$*" | tee -a "$REP"; }
res() { if [ "$2" = 0 ]; then say "  ок      $1"; else say "  ОШИБКА  $1"; FAIL=1; fi; }

# Стабильные тесты должны проходить всегда. Нестабильные гоняют бота по настоящим часам, а программная отрисовка
# в контейнере даёт 1–3 кадра/с — физика считается разными шагами, падают разные пункты (см. docs/ARCHITECTURE.md).
STABLE="arcade-smoke arcade-roads arcade-landing arcade-multitouch arcade-arena arena-race bridge-trainer bridge-audit"
FLAKY="arcade-eight arcade-inner arcade-menu arcade-p1 arcade-p2 arcade-p3 arcade-pro arcade-reach"

say "== проверка ($MODE) $(date '+%F %T'), $(git rev-parse --short HEAD)$(git diff --quiet || echo ' + несохранённые правки')"

say "-- синтаксис arcade/js, arcade/data"
bad=0; for f in arcade/js/*.js arcade/data/*.js; do node --check "$f" 2>>"$OUT/syntax.log" || { say "  ошибка в $f"; bad=1; }; done; res "синтаксис" $bad

say "-- сборка"
python3 -I tools/build-offline.py > "$OUT/build.log" 2>&1; res "tools/build-offline.py ($(tail -2 "$OUT/build.log" | tr '\n' ' '))" $?

say "-- чистая логика (arcade/lib): тесты Node"
npm test --silent > "$OUT/unit.log" 2>&1; res "npm test ($(grep -E '^# (pass|fail)' "$OUT/unit.log" | tr '\n' ' '))" $?

say "-- запуск (рабочая версия, один файл, папкой): без ошибок, кадры идут"
cat > "$OUT/boot.cjs" <<'EOF'
const { chromium } = require(process.env.PW);
(async () => { const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + require('path').resolve(process.argv[2]) + '#test'); await p.waitForTimeout(9000);
  const i = await p.evaluate(() => window.__t && window.__t.info()); const fatal = await p.evaluate(() => document.getElementById('fatal')?.textContent || null);
  console.log(JSON.stringify({ i, fatal, errs })); await b.close(); process.exit(i && i.calls > 10 && !fatal && !errs.length ? 0 : 1); })();
EOF
for h in arcade/index.html dist/vosmerka-baklazhan/index.html dist/vosmerka-web/index.html; do
  node "$OUT/boot.cjs" "$h" > "$OUT/boot-$(echo $h | tr / _).log" 2>&1; res "$h $(cut -c1-110 "$OUT/boot-$(echo $h | tr / _).log")" $?
done

say "-- по ссылке: сборка папкой по http из вложенной папки адреса (как на хостинге)"
node tools/arcade-http.cjs > "$OUT/http.log" 2>&1; res "tools/arcade-http.cjs $(cut -c1-110 "$OUT/http.log")" $?

say "-- бюджет кадра (≤120 вызовов, ≤150 тыс. треугольников): «восьмёрка» и внедорожник, кабина"
for v in "vaz chase" "suv chase" "suv cockpit"; do set -- $v
  VEH=$1 CAM=$2 node tools/arcade-perf.cjs > "$OUT/perf-$1-$2.log" 2>&1
  python3 - "$OUT/perf-$1-$2.log" "$1/$2" >> "$REP" <<'EOF'
import sys, re, json
rows = [json.loads(m) for m in re.findall(r'(\{"calls".*?\})', open(sys.argv[1]).read())]
worst = max(rows, key=lambda r: r["calls"]) if rows else None
ok = bool(rows) and all(r["calls"] <= 120 and r["tris"] <= 150000 for r in rows)
print(f"  {'ок     ' if ok else 'ОШИБКА '} {sys.argv[2]}: " + ", ".join(f"{r['calls']} выз./{r['tris'] // 1000} тыс." for r in rows))
sys.exit(0 if ok else 1)
EOF
  [ $? = 0 ] || FAIL=1
done

say "-- «ничего не изменилось» к $REF (кадры 7 точек и сводка сцены; шум — второй прогон эталона)"
WT=$OUT/ref; git worktree add -q --detach "$WT" "$REF" 2>>"$OUT/same.log"
if [ -f "$WT/arcade/index.html" ]; then
  node tools/arcade-same.cjs "$WT/arcade/index.html" "$OUT/same-ref1" >>"$OUT/same.log" 2>&1 &
  node tools/arcade-same.cjs "$WT/arcade/index.html" "$OUT/same-ref2" >>"$OUT/same.log" 2>&1 &
  node tools/arcade-same.cjs arcade/index.html "$OUT/same-now" >>"$OUT/same.log" 2>&1; wait
  python3 -I tools/same-diff.py "$OUT/same-ref1" "$OUT/same-now" "$OUT/same-ref2" | sed 's/^/  /' | tee -a "$REP" | tail -1 | grep -q СОВПАЛО
  res "кадры совпадают с $REF (если менялась картинка — ожидаемо, смотри .check/same-*)" $?
fi
git worktree remove --force "$WT" 2>/dev/null

if [ "$MODE" = full ]; then
  for grp in STABLE FLAKY; do
    say "-- $([ $grp = STABLE ] && echo 'стабильные тесты' || echo 'нестабильные тесты (не блокируют)')"
    for t in ${!grp}; do
      s=$(date +%s); timeout 1200 node "tools/$t.cjs" > "$OUT/$t.log" 2>&1; rc=$?; d=$(( $(date +%s) - s ))
      if [ $grp = STABLE ]; then res "$t (${d} с)" $rc; else say "  $([ $rc = 0 ] && echo 'ок     ' || echo 'упал   ') $t (${d} с) — не блокирует"; fi
    done
  done
fi

say "== итог: $([ $FAIL = 0 ] && echo 'ВСЁ СТАБИЛЬНОЕ ПРОШЛО' || echo 'ЕСТЬ ОШИБКИ') · отчёт $REP"
exit $FAIL
