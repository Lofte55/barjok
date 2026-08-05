/*
 * Адресный реестр домов Павлодара из OpenStreetMap (Overpass API).
 *
 * Зачем: источники часто пишут только улицу («отключение ГВС на Кутузова»).
 * Чтобы показать КОНКРЕТНЫЕ ДОМА, а не линию улицы, мы один раз выкачиваем все
 * здания с адресом (~40 тыс.) и кэшируем в parser/buildings.json.
 * Дальше `housesOnStreet('Кутузова')` отдаёт список домов с номерами и координатами.
 *
 * Обновить кэш: удалить parser/buildings.json (или node -e "require('./lib/buildings').refresh()").
 */
const fs = require('fs');
const path = require('path');

const CACHE = path.join(__dirname, '..', 'buildings.json');
const BBOX = '52.20,76.85,52.36,77.06';           // Павлодар с пригородом
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const QUERY = `[out:json][timeout:120];
(
  way["addr:housenumber"]["addr:street"](${BBOX});
  node["addr:housenumber"]["addr:street"](${BBOX});
);
out center tags;`;

/* Нормализация названия улицы. Цель: «Кутузова» ↔ «Кутузов көшесі» ↔ «улица Кутузова»
   дают один ключ. ВНИМАНИЕ: \b в JS не работает с кириллицей — границы задаём явно. */
const TYPE_WORDS = ['улица', 'ул', 'проспект', 'пр-т', 'пр', 'переулок', 'пер', 'бульвар', 'б-р',
  'площадь', 'пл', 'шоссе', 'аллея', 'тупик', 'микрорайон', 'мкр', 'квартал',
  'көшесі', 'даңғылы', 'алаңы', 'тұйығы', 'шағын', 'ауданы'];
const ABBR = { 'ак': 'академик', 'акад': 'академик', 'ген': 'генерал', 'им': '' };
// Стоп-слова: титулы, которые в одном источнике есть, в другом нет
const STOP = new Set(['академик', 'академика', 'генерал', 'генерала', 'батыр', 'батыра', 'имени']);

function stem(w) {
  return w.replace(/(ского|ская|ские|ова|ева|ина|ыны|ая|ой|ый|ого|ому|ым|ых|а|я|ы|и|о|е|у)$/i, '');
}
function streetTokens(s) {
  let x = (s || '').toLowerCase().replace(/ё/g, 'е').replace(/[.,()«»"']/g, ' ').replace(/-/g, ' ');
  let words = x.split(/\s+/).filter(Boolean);
  words = words.map((w) => (ABBR[w] !== undefined ? ABBR[w] : w)).filter(Boolean);
  words = words.filter((w) => !TYPE_WORDS.includes(w));
  // ⚠️ Короткие названия («Абая» → stem «аб») не укорачиваем ниже 3 символов,
  // иначе ключ пустеет и улица не разворачивается в дома (был баг: Абая = 0 домов).
  words = words.map((w) => { const st = stem(w); return st.length >= 3 ? st : w; })
    .filter((w) => w.length >= 3 && !STOP.has(w));
  return words;
}
// Ключ = самое длинное значимое слово (обычно фамилия) — устойчиво к вариантам записи
function normStreet(s) {
  const t = streetTokens(s);
  if (!t.length) return '';
  return t.slice().sort((a, b) => b.length - a.length)[0];
}

async function fetchAll() {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'BarJoqParser/1.0' },
        body: 'data=' + encodeURIComponent(QUERY),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const els = (data.elements || []).filter((e) => e.tags && e.tags['addr:street'] && e.tags['addr:housenumber']);
      if (!els.length) throw new Error('пустой ответ Overpass');
      // компактная форма: [street, house, lat, lng]
      return els.map((e) => {
        const c = e.center || e;
        return [e.tags['addr:street'], e.tags['addr:housenumber'], +c.lat.toFixed(5), +c.lon.toFixed(5)];
      }).filter((b) => typeof b[2] === 'number' && typeof b[3] === 'number');
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Overpass недоступен');
}

let INDEX = null;   // normStreet → [{house, lat, lng, street}]

async function load() {
  if (INDEX) return INDEX;
  let rows;
  if (fs.existsSync(CACHE)) {
    rows = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  } else {
    console.log('  адресный реестр OSM: выкачиваю (один раз, ~40 тыс. домов)…');
    rows = await fetchAll();
    fs.writeFileSync(CACHE, JSON.stringify(rows));
    console.log(`  адресный реестр: ${rows.length} домов → parser/buildings.json`);
  }
  INDEX = new Map();
  for (const [street, house, lat, lng] of rows) {
    const key = normStreet(street);
    if (!key) continue;
    if (!INDEX.has(key)) INDEX.set(key, []);
    INDEX.get(key).push({ house, lat, lng, street });
  }
  return INDEX;
}

/* Дома на улице. Возвращает [] если улицы нет в OSM. */
async function housesOnStreet(name, limit = 400) {
  const idx = await load();
  const key = normStreet(name);
  if (!key) return [];
  let list = idx.get(key);
  if (!list) {   // мягкий поиск: ключ входит в другой ключ
    for (const [k, v] of idx) {
      if (k.includes(key) || key.includes(k)) { list = v; break; }
    }
  }
  if (!list) return [];
  // сортировка по номеру дома, ограничение объёма
  const sorted = [...list].sort((a, b) => (parseInt(a.house, 10) || 0) - (parseInt(b.house, 10) || 0));
  return sorted.slice(0, limit);
}

/* Дома внутри полигона (для объявлений «в границах улиц»). */
async function housesInPolygon(poly, limit = 3000) {
  const { pointInPolygon } = require('./geo');
  const idx = await load();
  const out = [];
  for (const list of idx.values()) {
    for (const h of list) {
      if (pointInPolygon([h.lat, h.lng], poly)) {
        out.push(h);
        if (out.length >= limit) return out;
      }
    }
  }
  return out;
}

async function refresh() {
  try { fs.unlinkSync(CACHE); } catch (e) {}
  INDEX = null; return load();
}

module.exports = { housesOnStreet, housesInPolygon, normStreet, load, refresh };
