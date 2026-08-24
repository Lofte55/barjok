/*
 * Адаптер: СООБЩЕНИЯ ЖИТЕЛЕЙ (подтверждённые модератором).
 *
 * Приватность: raw-таблицу НЕ публикуем. Парсер читает JSON-фид Apps Script (doGet),
 * который отдаёт ТОЛЬКО approved-строки. Так new/rejected и личные тексты не утекают —
 * наружу видно лишь то, что и так попадёт на публичную карту.
 *   env CITIZEN_FEED_URL — тот же /exec-URL Apps Script, GET-запрос → {rows:[...]}.
 * Если не задан — тихий no-op (слой отключён).
 *
 * Совместимость: если фид отдаёт CSV (старый вариант «опубликовать в интернете»), тоже разберём.
 * Безопасность: весь пользовательский текст санитизируем (срезаем HTML) — защита от XSS,
 * т.к. reason рендерится в карточке. Дополнительно фронт эскейпит при выводе.
 */
const { geocode } = require('../lib/geocode');

const FEED_URL = process.env.CITIZEN_FEED_URL || process.env.CITIZEN_CSV_URL || '';
const NOW = process.env.BARJOQ_NOW ? Date.parse(process.env.BARJOQ_NOW) : Date.now();
const TTL = 3 * 86400000;
const CENTER = [52.2871, 76.9674];
// Поддержаны ОБА формата колонки category в таблице: старый код (hot_water) и
// новый русский текст (api/report.js с какого-то момента пишет текст для читаемости
// при модерации) — иначе уже одобренные строки со старым форматом перестали бы работать.
const CAT_RES = {
  hot_water: ['hot_water'], cold_water: ['cold_water'], electricity: ['electricity'],
  heating: ['heating'], gas: ['gas'], water_light: ['cold_water', 'electricity'],
  'нет горячей воды': ['hot_water'], 'нет холодной воды': ['cold_water'],
  'нет электричества': ['electricity'], 'нет тепла': ['heating'], 'нет газа': ['gas'],
  'нет воды и света': ['cold_water', 'electricity'],
};

// срезаем любые теги и угловые скобки, схлопываем пробелы, ограничиваем длину
function clean(s, max = 400) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) { if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// нормализуем вход к массиву объектов {ts,kind,category,address,message,status,lat,lng}
async function loadRows() {
  const r = await fetch(FEED_URL, { headers: { 'User-Agent': 'BarJoqParser/1.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const body = await r.text();
  const trimmed = body.trim();
  if (trimmed[0] === '{' || trimmed[0] === '[') {              // JSON-фид Apps Script
    const j = JSON.parse(trimmed);
    return Array.isArray(j) ? j : (j.rows || []);
  }
  const grid = parseCSV(body);                                 // фолбэк: CSV
  if (grid.length < 2) return [];
  const head = grid[0].map((h) => h.trim().toLowerCase());
  return grid.slice(1).map((r2) => {
    const o = {}; head.forEach((h, i) => (o[h] = r2[i]));
    return o;
  });
}

async function fetchCitizen() {
  if (!FEED_URL) return { records: [] };
  let rows;
  try { rows = await loadRows(); }
  catch (e) { console.warn('  сообщения жителей: фид недоступен —', e.message); return { records: [] }; }

  const records = [];
  for (const o of rows) {
    if (String(o.status || '').trim().toLowerCase() !== 'approved') continue;
    if (String(o.kind || '').trim() === 'suggestion') continue;
    const resources = CAT_RES[String(o.category || '').trim().toLowerCase()]; if (!resources) continue;
    const address = clean(o.address, 120); if (!address) continue;
    const ts = Date.parse(o.ts) || NOW;
    if (ts + TTL < NOW) continue;

    let lat = parseFloat(o.lat), lng = parseFloat(o.lng);
    if (!(lat && lng)) { const g = await geocode(address); if (!g) continue; lat = g.lat; lng = g.lng; }
    if (Math.abs(lat - CENTER[0]) > 0.22 || Math.abs(lng - CENTER[1]) > 0.35) continue;

    const start = new Date(ts).toISOString();
    const end = new Date(ts + TTL).toISOString();
    const message = clean(o.message, 300);
    for (const resource of resources) {
      records.push({
        address, district: 'Сообщение жителя',
        lat: +lat.toFixed(5), lng: +lng.toFixed(5),
        resource, type: 'emergency', status: 'current', start, end,
        reason: message || 'Сообщение жителя (подтверждено модератором)',
        provider: 'Житель · подтверждено модератором',
        citizen: true, streetWide: false,
        precision: 'community', sourceTrust: 'community',
      });
    }
  }
  if (records.length) console.log(`  сообщения жителей: ${records.length} подтверждённых`);
  return { records, source: 'Сообщения жителей (подтверждённые)' };
}

module.exports = { fetch: fetchCitizen };
