/*
 * Адаптер: incidents из Supabase (админка + Decision Engine, api/_lib/decision-engine.js).
 *
 * Два эффекта на карту:
 *   1. ACTIVE incident → добавляем как отключение (аналог citizen.js/manual-reports.js).
 *   2. RESTORED incident → ПОДАВЛЯЕМ любую запись по этому адресу+ресурсу из ЛЮБОГО
 *      источника (официального, ГВС-парсера и т.д.) — так же, как resolved.js уже
 *      делает для старого Sheet-механизма. Оба механизма теперь работают параллельно
 *      (resolved.js не удалён — старые «Предложение»-восстановления через таблицу
 *      продолжают работать), пока Sheet-жалобы окончательно не переедут в incidents.
 *
 * Переиспользуем клиент api/_lib/supabase.js (та же переменная SUPABASE_URL/
 * SUPABASE_SECRET_KEY) — код общий, дублировать незачем: parser и Vercel functions
 * лежат в одном репозитории и не бандлятся друг с другом.
 */
const { select } = require('../../api/_lib/supabase');
const buildings = require('../lib/buildings');
const { geocode } = require('../lib/geocode');

const CENTER = [52.2871, 76.9674];
const TTL = 3 * 86400000; // «мягкий» end, обновляется каждый прогон, пока incident активен

/*
 * Разбор адреса на улицу и дом.
 * ⚠️ Раньше требовалась ЗАПЯТАЯ (`/^(.*?),\s*([^,]+)$/`), а в админке адрес набирают
 * руками и запятую ставят не всегда («Сатпаева 21/1»). Без запятой возвращался null:
 * для RESTORED это означало, что подавление НЕ РАБОТАЛО (isRestored ниже строит ключ
 * отсюда), то есть «Восстановлено» из админки молча ничего не убирало с карты.
 */
function splitAddress(address) {
  const s = String(address || '').trim();
  let m = s.match(/^(.*?),\s*([^,]+)$/);
  if (m && m[1].trim() && m[2].trim()) return { street: m[1].trim(), house: m[2].trim() };
  // без запятой: последний токен, начинающийся с цифры, считаем номером дома
  m = s.match(/^(.*?)\s+(\d[\d/\-а-яёa-z]*)$/i);
  if (m && m[1].trim()) return { street: m[1].trim(), house: m[2].trim() };
  return null;
}

const normHouse = (h) => String(h || '').trim().toLowerCase().replace(/\s+/g, '').replace(/ё/g, 'е');

function addrKey(address) {
  const p = splitAddress(address);
  if (!p) return null;
  const streetKey = buildings.normStreet(p.street);
  const house = normHouse(p.house);
  if (!streetKey || !house) return null;
  return `${streetKey}|${house}`;
}

/*
 * Канонический адрес ИЗ РЕЕСТРА OSM + его координаты.
 *
 * ⚠️⚠️ ЗАЧЕМ: groupHouses (parser/index.js) группирует дома по СТРОКЕ адреса. Официальный
 * источник пишет «улица Академика Сатпаева, 21/1», а админка сохраняет то, что набрал
 * человек («Сатпаева 21/1») — это РАЗНЫЕ ключи, и на карте появлялись ДВА дома в одной
 * точке: официальные наряды отдельно, подтверждение админа отдельно. Ровно эти грабли
 * уже ловили в v19 для ручного импорта жалоб и починили там же (build-manual-reports.js
 * берёт h.street из реестра) — сюда фикс тогда не дошёл.
 */
async function canonicalAddress(address) {
  const p = splitAddress(address);
  if (!p) return null;
  let list = [];
  try { list = await buildings.housesOnStreet(p.street, 800); } catch (e) { return null; }
  const want = normHouse(p.house);
  const exact = list.find((h) => normHouse(h.house) === want);
  if (!exact) return null;
  return { address: `${exact.street}, ${exact.house}`, lat: exact.lat, lng: exact.lng };
}

const PROVIDER = {
  MANUAL: 'БарЖок · подтверждено администратором',
  COMMUNITY: 'Житель · подтверждено BARJOK (3+ сообщения)',
  OFFICIAL: 'БарЖок · официальный источник',
  COMMUNITY_AND_OFFICIAL: 'БарЖок · официально и жителями',
};

async function fetchIncidents() {
  if (!process.env.SUPABASE_URL) return { records: [], restoredSet: new Set() };

  let rows;
  try {
    rows = await select('incidents', 'order=updated_at.desc&limit=1000');
  } catch (e) {
    console.warn('  incidents (Supabase) недоступны:', e.message);
    return { records: [], restoredSet: new Set() };
  }

  // На один address+utility_type может существовать НЕСКОЛЬКО incident'ов —
  // старый RESTORED и новый ACTIVE (§20 документа: после восстановления новое
  // отключение создаёт НОВЫЙ incident, старый не переиспользуется). Берём только
  // САМЫЙ СВЕЖИЙ по updated_at на каждую пару — иначе устаревший RESTORED
  // глушил бы актуальный ACTIVE.
  const latestByKey = new Map();
  for (const inc of rows || []) {
    const key = `${inc.address}|${inc.utility_type}`;
    const cur = latestByKey.get(key);
    if (!cur || new Date(inc.updated_at) > new Date(cur.updated_at)) latestByKey.set(key, inc);
  }

  const records = [];
  const restoredSet = new Set();
  const dropped = [];   // ⚠️ раньше записи отбрасывались МОЛЧА — потеря была невидима
  const NOW = process.env.BARJOQ_NOW ? Date.parse(process.env.BARJOQ_NOW) : Date.now();

  for (const inc of latestByKey.values()) {
    if (inc.status === 'RESTORED') {
      const key = addrKey(inc.address);
      if (key) restoredSet.add(`${key}|${inc.utility_type}`);
      continue;
    }
    if (inc.status !== 'ACTIVE') continue;

    // Сначала реестр OSM: он даёт и канонический адрес (иначе дубль дома, см. выше),
    // и точные координаты дома — без похода в Nominatim.
    let address = inc.address, lat, lng;
    const canon = await canonicalAddress(inc.address);
    if (canon) {
      address = canon.address; lat = canon.lat; lng = canon.lng;
    } else {
      const g = await geocode(inc.address);
      if (!g) { dropped.push(`${inc.address} (${inc.utility_type}) — не найден ни в реестре, ни в геокодере`); continue; }
      lat = g.lat; lng = g.lng;
    }
    if (Math.abs(lat - CENTER[0]) > 0.22 || Math.abs(lng - CENTER[1]) > 0.35) {
      dropped.push(`${inc.address} (${inc.utility_type}) — вне границ города`);
      continue;
    }

    const start = inc.confirmed_at || inc.created_at || new Date(NOW).toISOString();
    records.push({
      address, district: 'БарЖок',
      lat: +lat.toFixed(5), lng: +lng.toFixed(5),
      resource: inc.utility_type, type: 'emergency', status: 'current',
      start, end: new Date(NOW + TTL).toISOString(),
      reason: inc.manual_override_reason || 'Подтверждено через BARJOK',
      provider: PROVIDER[inc.confirmation_type] || 'БарЖок',
      citizen: true, streetWide: false,
    });
  }
  if (records.length) console.log(`  incidents (Supabase): ${records.length} активных`);
  if (restoredSet.size) console.log(`  incidents (Supabase): ${restoredSet.size} restored — подавляют другие источники`);
  // Видимый сигнал: подтверждено в админке, но на карту не попало (обычно — опечатка
  // в адресе или дом отсутствует в реестре OSM). Без этого владелец видит «подтвердил,
  // а на карте нет» и не может понять причину.
  if (dropped.length) {
    console.warn(`  ⚠️ incidents: НЕ ПОПАЛИ на карту (${dropped.length}):`);
    dropped.forEach((d) => console.warn(`      ${d}`));
  }
  return { records, restoredSet };
}

function isRestored(restoredSet, address, resource) {
  if (!restoredSet.size) return false;
  const key = addrKey(address);
  if (!key) return false;
  return restoredSet.has(`${key}|${resource}`);
}

module.exports = { fetch: fetchIncidents, isRestored };
