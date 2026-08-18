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

function addrKey(address) {
  const m = String(address || '').match(/^(.*?),\s*([^,]+)$/);
  if (!m) return null;
  const streetKey = buildings.normStreet(m[1]);
  const house = m[2].trim().toLowerCase().replace(/\s+/g, '').replace(/ё/g, 'е');
  if (!streetKey || !house) return null;
  return `${streetKey}|${house}`;
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
  const NOW = process.env.BARJOQ_NOW ? Date.parse(process.env.BARJOQ_NOW) : Date.now();

  for (const inc of latestByKey.values()) {
    if (inc.status === 'RESTORED') {
      const key = addrKey(inc.address);
      if (key) restoredSet.add(`${key}|${inc.utility_type}`);
      continue;
    }
    if (inc.status !== 'ACTIVE') continue;

    let lat, lng;
    const g = await geocode(inc.address);
    if (!g) continue;
    lat = g.lat; lng = g.lng;
    if (Math.abs(lat - CENTER[0]) > 0.22 || Math.abs(lng - CENTER[1]) > 0.35) continue;

    const start = inc.confirmed_at || inc.created_at || new Date(NOW).toISOString();
    records.push({
      address: inc.address, district: 'БарЖок',
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
  return { records, restoredSet };
}

function isRestored(restoredSet, address, resource) {
  if (!restoredSet.size) return false;
  const key = addrKey(address);
  if (!key) return false;
  return restoredSet.has(`${key}|${resource}`);
}

module.exports = { fetch: fetchIncidents, isRestored };
