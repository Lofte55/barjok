#!/usr/bin/env bash
# Пересъёмка декоративного скриншота /map-preview.jpg (превью карты на лендинге,
# api/_lib/seo-blocks.js:mapPreviewHtml). ⚠️ Эта картинка НЕ источник правды —
# просто иллюстрация "как выглядит карта", живые цифры рядом с ней считаются
# отдельно и корректно (api/_lib/city-stats.js, обновляются каждую минуту).
# Без пересъёмки картинка расходится с реальными данными визуально (нашли на
# живом кейсе: цифра "0 горячей воды" верна, а на замороженной картинке
# видны пины ГВС — та проблема, для которой этот скрипт и написан).
#
# Без npm-зависимостей (проект их принципиально не использует): системный
# Chrome/Chromium умеет headless-скриншот из коробки через CLI-флаги.
# --virtual-time-budget=N — встроенный механизм DevTools Protocol, который
# «прокручивает» N мс виртуального времени (таймеры, промисы, fetch) ПЕРЕД
# снимком — без него скриншот делается сразу на событии load, когда карта
# ещё не успела дотянуть /map/data.json и отрисовать пины (пустая подложка).
#
# ⚠️ Окно СНИМАЕТСЯ ШИРЕ целевого (2000px, не 1600) и обрезается СО СДВИГОМ
# слева на 362px — на десктопной раскладке /map/ слева живёт панель фильтров
# (.panel, width:328px + отступ, см. map/styles.css) поверх карты. Прямой
# кроп от x=0 при окне 1600px захватывал панель со списком отключений вместо
# самой карты (найдено на первом прогоне — получился скриншот сайдбара, а не
# карты). Сдвиг подобран так, чтобы попадала карта с шапкой поиска, без панели.
#
# Использование:
#   CHROME_BIN=/path/to/chrome parser/screenshot-preview.sh [URL]
#   (по умолчанию — системный google-chrome / chromium, живой прод-URL)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
URL="${1:-https://barjok.kz/map/pavlodar}"
RAW="$DIR/map-preview.raw.png"
OUT_JPG="$DIR/map-preview.jpg"
W=1600            # целевая ширина картинки (см. width= у <img> в mapPreviewHtml)
H=863             # целевая высота
WIN_W=2000        # окно шире цели — после кропа слева (панель) остаётся ровно W
WIN_H=$((H + 200))
CROP_X=362        # 328 (ширина .panel) + отступы — подобрано визуальной проверкой

# Ищем Chrome/Chromium в типичных местах (CHROME_BIN — явный override).
find_chrome() {
  if [ -n "${CHROME_BIN:-}" ]; then echo "$CHROME_BIN"; return; fi
  for c in google-chrome google-chrome-stable chromium chromium-browser \
           "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$c" >/dev/null 2>&1 || [ -x "$c" ]; then echo "$c"; return; fi
  done
  echo ""
}
CHROME="$(find_chrome)"
if [ -z "$CHROME" ]; then
  echo "⚠️ Chrome/Chromium не найден. Задайте CHROME_BIN=/путь/к/chrome" >&2
  exit 1
fi

echo "Снимаю: $URL → $RAW (окно ${WIN_W}x${WIN_H}, Chrome: $CHROME)"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
  --window-size="${WIN_W},${WIN_H}" --virtual-time-budget=6000 \
  --screenshot="$RAW" "$URL"

if [ ! -s "$RAW" ]; then
  echo "⚠️ Chrome не создал файл скриншота — проверьте URL/доступность сети." >&2
  exit 1
fi

# Обрезка до целевых WxH со сдвигом CROP_X (уводит панель фильтров за левый край) + JPEG.
if command -v magick >/dev/null 2>&1; then
  magick "$RAW" -crop "${W}x${H}+${CROP_X}+0" -quality 85 "$OUT_JPG"
elif command -v convert >/dev/null 2>&1; then
  convert "$RAW" -crop "${W}x${H}+${CROP_X}+0" -quality 85 "$OUT_JPG"
elif command -v sips >/dev/null 2>&1; then
  # sips (macOS). ⚠️ Без -s format jpeg sips пишет PNG-байты в файл с расширением .jpg
  # (расширение не значит формат для sips) — найдено на первом же локальном прогоне.
  # --cropOffset X Y задаёт сдвиг ДО -c HxW (проверено эмпирически на реальном прогоне).
  sips --cropOffset 0 "$CROP_X" -c "$H" "$W" -s format jpeg -s formatOptions 85 "$RAW" --out "$OUT_JPG" >/dev/null
else
  echo "⚠️ Нет ImageMagick (magick/convert) и нет sips — сохранён $RAW как есть," \
       "переименуйте/сконвертируйте вручную в map-preview.jpg (${W}x${H}, сдвиг ${CROP_X}px слева)." >&2
  exit 1
fi

rm -f "$RAW"
echo "Готово: $OUT_JPG"
