/*
 * Единый snapshot данных для SSR SEO-страниц (§5 SEO-ТЗ): все show-числа на
 * странице считаются ОДИН раз из ОДНОГО объекта — никаких независимых client-JS
 * подсчётов, которые могут разойтись между собой или с плейсхолдером "0".
 *
 * Тянем map/data.json через fetch (тот же файл, что рисует сама карта), а не
 * fs.readFileSync — Vercel Node functions трассируют зависимости статически
 * (@vercel/nft) и не гарантированно включают в бандл файлы, к которым
 * обращаются только через runtime fs-путь.
 */
const PROD_ORIGIN = 'https://barjok.kz';
const { fetchLiveIncidents } = require('./live-incidents');
const buildings = require('../../parser/lib/buildings');

let cache = null;
let cacheAt = 0;
const TTL_MS = 60000; // data.json обновляется раз в час — минутного кэша достаточно

/* «улица Лермонтова, 91» → «<normStreet-ключ>|91» — та же нормализация, что уже
   использует reестр домов (устойчива к RU/KZ вариантам написания). Тем же ключом
   дедупим адрес из data.json и адрес из живых incidents — иначе один и тот же
   дом, названный по-разному в двух источниках, задвоился бы в счётчике. */
function addrKey(raw) {
  const m = String(raw || '').match(/^(.*?),\s*([^,]+)$/);
  if (!m) return null;
  const streetKey = buildings.normStreet(m[1]);
  const house = m[2].trim().toLowerCase().replace(/\s+/g, '').replace(/ё/g, 'е');
  if (!streetKey || !house) return null;
  return `${streetKey}|${house}`;
}

async function computeSnapshot() {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;

  let houses = null;
  try {
    const r = await fetch(`${PROD_ORIGIN}/map/data.json`, { headers: { 'User-Agent': 'BarjokSSR/1.0' } });
    if (r.ok) { const d = await r.json(); houses = d.houses || []; }
  } catch (e) { houses = null; }

  if (!houses) {
    // backend/файл недоступен — честно возвращаем "нет данных", а не fake 0 (§5, §11)
    cache = { ok: false, generatedAt: new Date().toISOString() };
    cacheAt = now;
    return cache;
  }

  /*
   * ⚠️⚠️ Живой слой incidents из Supabase — ТА ЖЕ причина, что и в map/app.js:
   * applyLiveLayer(). Подтверждённое в админке видно на карте СРАЗУ (карта тянет
   * /api/pages?page=live при каждой загрузке), а в map/data.json попадает только
   * с ближайшим часовым прогоном парсера. Без этого блока лендинг мог правдиво
   * писать "0 без горячей воды", пока карта секундой позже показывала бы 16+ —
   * найдено на живом кейсе (16 hot_water + 2 cold_water подтверждений в админке,
   * ни одного в data.json). fetchLiveIncidents() — ОБЩАЯ функция с renderLive
   * (api/pages.js) специально, чтобы у карты и лендинга не было шанса разойтись
   * по разным копиям одной и той же выборки.
   *
   * ⚠️ ДЕДУП ПРИБЛИЖЁННЫЙ: считаем через addrKey() (street+house), а не через
   * house.id — incidents не привязаны к конкретному объекту data.json. Для
   * АГРЕГАТНЫХ цифр на лендинге (сколько адресов затронуто) точность до
   * пикселя не нужна — карта показывает КОНКРЕТНЫЙ дом (там своя, более строгая
   * логика сопоставления, sameAddress()); здесь достаточно не задвоить и не
   * потерять адрес при разумном совпадении названия улицы.
   */
  let live = { active: [], restored: [] };
  try { live = await fetchLiveIncidents(); } catch (e) { /* лендинг не должен падать из-за БД */ }

  const dataKeys = new Set();       // ключи, УЖЕ существующие в data.json (для восстановления)
  houses.forEach((h) => (h.outages || []).forEach((o) => {
    if (o.status === 'past') return;
    const k = addrKey(h.address);
    if (k) dataKeys.add(`${k}|${o.resource}`);
  }));

  const restoredKeys = new Set(
    live.restored.map((r) => { const k = addrKey(r.address); return k ? `${k}|${r.utility_type}` : null; }).filter(Boolean),
  );
  // Живые ACTIVE-адреса, которых ЕЩЁ НЕТ в data.json под тем же ключом — те, что
  // уже есть, посчитаны union'ом ниже и добавлять их снова значило бы задвоить.
  const liveOnly = [];
  const seenLive = new Set();
  for (const inc of live.active) {
    const k = addrKey(inc.address);
    if (!k) continue;
    const full = `${k}|${inc.utility_type}`;
    if (restoredKeys.has(full)) continue;      // восстановлено — не считаем отключённым
    if (dataKeys.has(full)) continue;          // уже учтено через houses ниже
    if (seenLive.has(full)) continue;          // дубль внутри самого live-слоя
    seenLive.add(full);
    liveOnly.push({ key: k, resource: inc.utility_type });
  }

  // ⚠️ restoredKeys гасит и houses-записи, не только live.active — если админ
  // только что нажал «Восстановлено», а следующий прогон парсера ещё не забрал
  // это в data.json, старый 'current'/'future' наряд из data.json ДОЛЖЕН
  // перестать считаться — ровно как applyLiveLayer() убирает его с карты.
  const isLiveRestored = (address, resource) => {
    const k = addrKey(address);
    return !!k && restoredKeys.has(`${k}|${resource}`);
  };

  const current = [];
  houses.forEach((h) => (h.outages || []).forEach((o) => {
    if (o.status === 'current' && !isLiveRestored(h.address, o.resource)) current.push(o);
  }));
  // Live-инциденты — это подтверждение «прямо сейчас сломано», всегда трактуем
  // как current (Supabase не различает current/future для ручных подтверждений).
  const liveCurrentCount = liveOnly.length;

  const byResource = (res) => {
    const fromHouses = new Set(
      houses.filter((h) => (h.outages || []).some((o) => o.resource === res && o.status === 'current' && !isLiveRestored(h.address, res)))
        .map((h) => addrKey(h.address) || h.id),
    );
    liveOnly.filter((l) => l.resource === res).forEach((l) => fromHouses.add(l.key));
    return fromHouses.size;
  };
  const plannedCount = current.filter((o) => o.type === 'planned').length;
  const emergencyCount = current.filter((o) => o.type === 'emergency').length;
  const affectedAddresses = new Set(
    houses.filter((h) => (h.outages || []).some((o) => o.status === 'current' && !isLiveRestored(h.address, o.resource)))
      .map((h) => addrKey(h.address) || h.id),
  );
  liveOnly.forEach((l) => affectedAddresses.add(l.key));

  // "Предстоящие" — известные заранее плановые работы (status:future). Когда активных
  // отключений 0 (частая ситуация), это единственная реальная цифра, которая сейчас
  // происходит — без неё блок цифр выглядит пустым/"неживым".
  const future = [];
  houses.forEach((h) => (h.outages || []).forEach((o) => {
    if (o.status === 'future' && !isLiveRestored(h.address, o.resource)) future.push(o);
  }));
  const futureAffectedAddresses = new Set(
    houses.filter((h) => (h.outages || []).some((o) => o.status === 'future' && !isLiveRestored(h.address, o.resource)))
      .map((h) => addrKey(h.address) || h.id),
  ).size;

  // ГЛАВНАЯ цифра "Затронуто N адресов" — та же методика, что и на самой карте
  // (map/app.js renderList: houses.length при дефолтном фильтре "все ресурсы,
  // любой статус кроме past") — union текущих И будущих, а не только активных.
  // Раньше эта цифра считалась только по активным (affectedAddresses) — при 0
  // активных отключений (обычная ситуация) блок показывал "0" вместо реальных
  // тысяч адресов с уже известными плановыми работами, как на карте.
  // + живой слой incidents (см. большой комментарий выше про liveOnly).
  const totalAffectedSet = new Set(
    houses.filter((h) => (h.outages || []).some((o) => o.status !== 'past' && !isLiveRestored(h.address, o.resource)))
      .map((h) => addrKey(h.address) || h.id),
  );
  liveOnly.forEach((l) => totalAffectedSet.add(l.key));
  const totalAffectedAddresses = totalAffectedSet.size;

  // ⚠️ 'water' (см. map/data.js) — Водоканал перекрывает ОБЩИЙ ввод воды в дом,
  // это не «только холодная»: без холодной нечего греть, значит горячей тоже нет.
  // Поэтому счётчик "без горячей/холодной воды" учитывает и адреса с water —
  // иначе после ввода отдельного ресурса water эти цифры стали бы ЗАНИЖЕННЫМИ
  // (раньше те же записи шли как cold_water и уже считались, регресс молчаливый).
  const byResourceAny = (res, alsoMatch) => {
    const matches = (r) => r === res || (alsoMatch && alsoMatch.includes(r));
    const set = new Set(
      houses.filter((h) => (h.outages || []).some((o) => matches(o.resource) && o.status !== 'past' && !isLiveRestored(h.address, o.resource)))
        .map((h) => addrKey(h.address) || h.id),
    );
    liveOnly.filter((l) => matches(l.resource)).forEach((l) => set.add(l.key));
    return set.size;
  };

  cache = {
    ok: true,
    generatedAt: new Date().toISOString(),
    activeOutages: current.length + liveCurrentCount,
    affectedAddresses: affectedAddresses.size,
    totalAffectedAddresses,
    coldWaterAffected: byResourceAny('cold_water', ['water']),
    hotWaterAffected: byResourceAny('hot_water', ['water']),
    noWaterAffected: byResourceAny('water'),
    electricityAffected: byResourceAny('electricity'),
    heatingAffected: byResourceAny('heating'),
    gasAffected: byResourceAny('gas'),
    plannedCount,
    emergencyCount,
    futureCount: future.length,
    futureAffectedAddresses,
    houses, // сырые дома — постранично используется для карточек отключений
  };
  cacheAt = now;
  return cache;
}

module.exports = { computeSnapshot };
