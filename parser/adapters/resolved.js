/*
 * «ВОССТАНОВЛЕНО» — владелец сервиса подтверждает через ту же Google-таблицу, что
 * по адресу отключение реально закончилось, и этот адрес исчезает с карты при
 * следующем прогоне — НЕЗАВИСИМО от того, откуда взялась запись (официальный
 * источник, сообщение жителя через таблицу или ручной список manual-reports.json).
 *
 * Механизм переиспользует существующую форму на сайте: вкладка «Предложение»
 * (kind=suggestion — у неё нет поля «категория») + указанный адрес + текст типа
 * «Дали горячую воду». Модератор одобряет (status=approved) — и это трактуется
 * как «убрать отключение по этому адресу», а не как предложение по фиче.
 * Ресурс определяем по ключевым словам в тексте сообщения (гор.../холод.../свет...
 * /тепл.../газ...) — если слов не нашли, убираем ВСЕ ресурсы по этому адресу.
 *
 * ⚠️ Приватность/безопасность — как в citizen.js: читаем ПРИВАТНЫЙ фид approved
 * через тот же doGet (не публичный CSV всей таблицы).
 *
 * ⚠️ ИЗВЕСТНОЕ ОГРАНИЧЕНИЕ (давнее в проекте, не новое): русское склонение улицы
 * («улица Лермонтова») и казахский/именительный вариант («Лермонтов көшесі») дают
 * РАЗНЫЕ ключи normStreet — «восстановлено» может не сматчиться с записью другого
 * источника, если адрес набран другой формой написания. Надёжнее всего открывать
 * форму «Сообщить о проблеме» ПРЯМО ИЗ КАРТОЧКИ ДОМА (кнопка автоподставляет точный
 * адрес как на карте, см. data-report-addr в map/app.js) — тогда строки совпадут
 * дословно и проблема нормализации не возникает.
 *
 * ⚠️ УСЛОВИЕ (важно для модератора): «Предложение» С ЗАПОЛНЕННЫМ АДРЕСОМ трактуется
 * как сигнал «убрать отключение по этому адресу». Если одобряешь обычное предложение
 * по сайту (не про восстановление), а поле адреса случайно заполнено — оно ТОЖЕ уберёт
 * запись по этому адресу. Оставляй адрес пустым для предложений не про конкретный дом.
 */
const buildings = require('../lib/buildings');

const FEED_URL = process.env.CITIZEN_FEED_URL || process.env.CITIZEN_CSV_URL || '';

const KEYWORDS = [
  [/гор[яа]ч/i, 'hot_water'], [/холод/i, 'cold_water'],
  [/электр|свет/i, 'electricity'], [/тепл|отоплен/i, 'heating'], [/газ/i, 'gas'],
];

/* «улица Лермонтова, 91» → «<normStreet-ключ>|91» — тот же ключ улицы, что использует
   OSM-реестр (buildings.normStreet), устойчив к RU/KZ вариантам написания. */
function addrKey(raw) {
  const m = String(raw || '').match(/^(.*?),\s*([^,]+)$/);
  if (!m) return null;
  const streetKey = buildings.normStreet(m[1]);
  const house = m[2].trim().toLowerCase().replace(/\s+/g, '').replace(/ё/g, 'е');
  if (!streetKey || !house) return null;
  return `${streetKey}|${house}`;
}

async function fetchResolvedSet() {
  if (!FEED_URL) return new Set();
  let rows;
  try {
    const r = await fetch(FEED_URL, { headers: { 'User-Agent': 'BarJoqParser/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = JSON.parse((await r.text()).trim());
    rows = Array.isArray(j) ? j : (j.rows || []);
  } catch (e) { console.warn('  восстановленные адреса: фид недоступен —', e.message); return new Set(); }

  const out = new Set();
  for (const o of rows) {
    if (String(o.status || '').trim().toLowerCase() !== 'approved') continue;
    if (String(o.kind || '').trim() !== 'suggestion') continue;     // только «Предложение»
    const key = addrKey(o.address);
    if (!key) continue;                                             // без адреса — обычное предложение, не сигнал
    const resources = KEYWORDS.filter(([re]) => re.test(o.message || '')).map(([, res]) => res);
    (resources.length ? resources : ['*']).forEach((res) => out.add(`${key}|${res}`));
  }
  if (out.size) console.log(`  восстановленные адреса (через таблицу): ${out.size}`);
  return out;
}

function isResolved(set, address, resource) {
  if (!set.size) return false;
  const key = addrKey(address);
  if (!key) return false;
  return set.has(`${key}|*`) || set.has(`${key}|${resource}`);
}

module.exports = { fetchResolvedSet, isResolved };
