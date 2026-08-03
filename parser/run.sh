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
