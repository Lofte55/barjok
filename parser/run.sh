#!/usr/bin/env bash
# Бар Жоқ — периодический сбор данных отключений (по расписанию, напр. каждые 3 часа).
# Пишет map/data.json и лог в parser/parser.log. Требует: node, unzip, сеть.
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DIR" || exit 1

CITY="${1:-pavlodar}"
LOG="parser/parser.log"
TS="$(date '+%Y-%m-%d %H:%M:%S')"

echo "[$TS] === start ($CITY) ===" >> "$LOG"
# Пишем во временный файл и подменяем только при успехе —
# чтобы на проде никогда не оказался пустой/битый data.json.
BACKUP="map/data.prev.json"
[ -f map/data.json ] && cp map/data.json "$BACKUP"

if node parser/index.js "$CITY" >> "$LOG" 2>&1; then
  # санити-чек: файл валиден и непустой
  if node -e 'const d=require("./map/data.json");if(!d.houses||!d.houses.length)process.exit(1)' 2>/dev/null; then
    echo "[$TS] === ok ===" >> "$LOG"

    # Коммитим и пушим ТОЛЬКО известные data-файлы парсера (никогда git add -A —
    # чтобы случайно не закоммитить что-то постороннее). Если нечего коммитить
    # (данные не изменились с прошлого запуска) — молча пропускаем.
    DATA_FILES="map/data.json map/addresses.json parser/geocache.json"
    git add $DATA_FILES >> "$LOG" 2>&1
    if git diff --cached --quiet -- $DATA_FILES; then
      echo "[$TS] данные не изменились — коммит пропущен" >> "$LOG"
      PUSHED=0
    else
      COUNTS="$(node -e 'const d=require("./map/data.json");console.log(d.counts.houses+" домов, "+d.counts.outages+" отключений")' 2>/dev/null)"
      if git commit -m "parser($CITY): автообновление данных — $COUNTS [$TS]" -- $DATA_FILES >> "$LOG" 2>&1 \
        && git pull --rebase --autostash origin main >> "$LOG" 2>&1 \
        && git push origin main >> "$LOG" 2>&1; then
        echo "[$TS] === закоммичено и запушено ===" >> "$LOG"
        PUSHED=1
      else
        echo "[$TS] === git commit/push FAILED (см. лог выше) — данные остались только локально ===" >> "$LOG"
        git rebase --abort >> "$LOG" 2>&1
        PUSHED=0
      fi
    fi

    # IndexNow имеет смысл слать ТОЛЬКО когда изменения реально ушли в git
    # (иначе на проде ещё старые данные, и уведомление будет ложным).
    if [ "${PUSHED:-0}" = "1" ]; then
      node parser/indexnow-ping.js >> "$LOG" 2>&1 || echo "[$TS] indexnow ping failed (не критично)" >> "$LOG"
    fi
  else
    echo "[$TS] === BAD DATA → откат ===" >> "$LOG"
    [ -f "$BACKUP" ] && cp "$BACKUP" map/data.json
  fi
else
  echo "[$TS] === FAILED → откат ===" >> "$LOG"
  [ -f "$BACKUP" ] && cp "$BACKUP" map/data.json
fi
# держим лог компактным (последние 500 строк)
tail -n 500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
