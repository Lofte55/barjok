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

let cache = null;
let cacheAt = 0;
const TTL_MS = 60000; // data.json обновляется раз в час — минутного кэша достаточно

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

  const current = [];
  houses.forEach((h) => (h.outages || []).forEach((o) => {
    if (o.status === 'current') current.push(o);
  }));

  const byResource = (res) => new Set(
    houses.filter((h) => (h.outages || []).some((o) => o.resource === res && o.status === 'current')).map((h) => h.id)
  ).size;
  const plannedCount = current.filter((o) => o.type === 'planned').length;
  const emergencyCount = current.filter((o) => o.type === 'emergency').length;
  const affectedAddresses = new Set(
    houses.filter((h) => (h.outages || []).some((o) => o.status === 'current')).map((h) => h.id)
  ).size;

  // "Предстоящие" — известные заранее плановые работы (status:future). Когда активных
  // отключений 0 (частая ситуация), это единственная реальная цифра, которая сейчас
  // происходит — без неё блок цифр выглядит пустым/"неживым".
  const future = [];
  houses.forEach((h) => (h.outages || []).forEach((o) => { if (o.status === 'future') future.push(o); }));
  const futureAffectedAddresses = new Set(
    houses.filter((h) => (h.outages || []).some((o) => o.status === 'future')).map((h) => h.id)
  ).size;

  // ГЛАВНАЯ цифра "Затронуто N адресов" — та же методика, что и на самой карте
  // (map/app.js renderList: houses.length при дефолтном фильтре "все ресурсы,
  // любой статус кроме past") — union текущих И будущих, а не только активных.
  // Раньше эта цифра считалась только по активным (affectedAddresses) — при 0
  // активных отключений (обычная ситуация) блок показывал "0" вместо реальных
  // тысяч адресов с уже известными плановыми работами, как на карте.
  const totalAffectedAddresses = new Set(
    houses.filter((h) => (h.outages || []).some((o) => o.status !== 'past')).map((h) => h.id)
  ).size;
  const byResourceAny = (res) => new Set(
    houses.filter((h) => (h.outages || []).some((o) => o.resource === res && o.status !== 'past')).map((h) => h.id)
  ).size;

  cache = {
    ok: true,
    generatedAt: new Date().toISOString(),
    activeOutages: current.length,
    affectedAddresses,
    totalAffectedAddresses,
    coldWaterAffected: byResourceAny('cold_water'),
    hotWaterAffected: byResourceAny('hot_water'),
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
