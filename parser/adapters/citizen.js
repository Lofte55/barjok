/*
 * Адаптер: СООБЩЕНИЯ ЖИТЕЛЕЙ (подтверждённые модератором).
 *
 * Источник — Google-таблица, куда serverless (api/report.js) дописывает жалобы.
 * Модератор в таблице ставит status = approved у проверенных строк. Парсер читает
 * ОПУБЛИКОВАННЫЙ CSV таблицы (env CITIZEN_CSV_URL), берёт approved-строки и отдаёт их
 * ОТДЕЛЬНЫМ слоем (флаг citizen:true) — на карте визуально отделены от официальных.
 *
 * Если CITIZEN_CSV_URL не задан — адаптер тихо ничего не возвращает (слой отключён).
 * Ожидаемые колонки таблицы (первая строка — заголовки, регистр не важен):
 *   ts | kind | category | address | message | status | lat | lng
 */
const { geocode } = require('../lib/geocode');

const CSV_URL = process.env.CITIZEN_CSV_URL || '';
const NOW = process.env.BARJOQ_NOW ? Date.parse(process.env.BARJOQ_NOW) : Date.now();
const TTL = 3 * 86400000;            // одобренное сообщение живёт 3 дня (иначе засорит карту)
const CENTER = [52.2871, 76.9674];
// категория из формы → ресурс(ы) карты
const CAT_RES = {
  hot_water: ['hot_water'], cold_water: ['cold_water'], electricity: ['electricity'],
  heating: ['heating'], gas: ['gas'], water_light: ['cold_water', 'electricity'],
};

// минимальный CSV-парсер (учитывает кавычки и запятые/переводы строк внутри полей)
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function fetchCitizen() {
  if (!CSV_URL) return { records: [] };
  let text;
  try {
    const r = await fetch(CSV_URL, { headers: { 'User-Agent': 'BarJoqParser/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    text = await r.text();
  } catch (e) { console.warn('  сообщения жителей: CSV недоступен —', e.message); return { records: [] }; }

  const rows = parseCSV(text);
  if (rows.length < 2) return { records: [] };
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (n) => head.indexOf(n);
  const ci = { ts: col('ts'), kind: col('kind'), category: col('category'), address: col('address'), message: col('message'), status: col('status'), lat: col('lat'), lng: col('lng') };

  const records = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const get = (k) => (ci[k] >= 0 ? (r[ci[k]] || '').trim() : '');
    if (get('status').toLowerCase() !== 'approved') continue;   // только одобренные
    if (get('kind') === 'suggestion') continue;                 // предложения не на карту
    const resources = CAT_RES[get('category')]; if (!resources) continue;
    const address = get('address'); if (!address) continue;
    const ts = Date.parse(get('ts')) || NOW;
    if (ts + TTL < NOW) continue;                               // устарело — не показываем

    let lat = parseFloat(get('lat')), lng = parseFloat(get('lng'));
    if (!(lat && lng)) { const g = await geocode(address); if (!g) continue; lat = g.lat; lng = g.lng; }
    if (Math.abs(lat - CENTER[0]) > 0.22 || Math.abs(lng - CENTER[1]) > 0.35) continue;

    const start = new Date(ts).toISOString();
    const end = new Date(ts + TTL).toISOString();
    const message = get('message');
    for (const resource of resources) {
      records.push({
        address, district: 'Сообщение жителя',
        lat: +lat.toFixed(5), lng: +lng.toFixed(5),
        resource, type: 'emergency', status: 'current', start, end,
        reason: message || 'Сообщение жителя (подтверждено модератором)',
        provider: 'Житель · подтверждено модератором',
        citizen: true, streetWide: false,
      });
    }
  }
  if (records.length) console.log(`  сообщения жителей: ${records.length} подтверждённых`);
  return { records, source: 'Сообщения жителей (подтверждённые)' };
}

module.exports = { fetch: fetchCitizen };
