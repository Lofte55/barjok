/*
 * Одноразовый билдер: превращает список жалоб (полученных в Telegram, пока не работала
 * запись в таблицу) в parser/manual-reports.json. Для каждой жалобы:
 *  1) ищет точный дом в OSM-реестре;
 *  2) если нет — берёт ближайший по номеру дом на той же улице (проекция очень близко);
 *  3) если и такого нет — геокодит полный адрес через Nominatim, иначе центр улицы+джиттер;
 *  4) добавляет СОСЕДНИЕ дома на той же улице (номер ±3) — пользователь подтвердил,
 *     что при подъездных отключениях соседние дома того же дома/квартала тоже без ГВС.
 * Результат — статические записи с status подразумевается 'approved' (модерация уже
 * состоялась: владелец сервиса вручную подтвердил каждую жалобу перед этим прогоном).
 */
const fs = require('fs');
const path = require('path');
const buildings = require('./lib/buildings');
const { geocode } = require('./lib/geocode');

const OUT = path.join(__dirname, 'manual-reports.json');
const CENTER = [52.2871, 76.9674];

const REPORTS = [
  { street: 'Кутузова', house: '204', resource: 'hot_water', note: 'Нет горячей воды' },
  { street: 'Днепропетровская', house: '84', resource: 'hot_water', note: 'Нет горячей воды' },
  { street: 'Естая', house: '142', resource: 'hot_water', note: 'Нет горячей воды' },
  { street: 'Ломова', house: '181/5', resource: 'hot_water', note: 'Нет горячей воды' },
  { street: 'Максима Горького', house: '102/3', resource: 'hot_water', note: 'Нет горячей воды' },
  { street: 'Всеволода Иванова', house: '81', resource: 'hot_water', note: 'Нет горячей воды' },
  { street: 'Академика Сатпаева', house: '247', resource: 'hot_water', note: 'Нет горячей воды. Заявлено: отсутствует уже около двух недель' },
  { street: 'Нурсултана Назарбаева', house: '3/2', resource: 'hot_water', note: 'Нет горячей воды. Заявлено: отключили 03.08.2026' },
  { street: 'Нуржанова', house: '4/1', resource: 'cold_water', note: 'Нет холодной воды. Заявлено: отсутствует около недели' },
  { street: 'Торайгырова', house: '42', resource: 'hot_water', note: 'Нет горячей воды. Заявлено: дома нет в списках на подключение' },
  { street: 'Нурсултана Назарбаева', house: '50', resource: 'hot_water', note: 'Нет горячей воды' },
];

const houseNum = (h) => parseInt(String(h).match(/\d+/)?.[0] || 'NaN', 10);
function inBounds(lat, lng) { return Math.abs(lat - CENTER[0]) <= 0.22 && Math.abs(lng - CENTER[1]) <= 0.35; }

async function locate(street, house) {
  const list = await buildings.housesOnStreet(street, 800);
  // ⚠️ Адрес записи должен ТОЧНО совпадать по формату с тем, что использует официальный
  // источник для этого же дома (иначе groupHouses в index.js создаёт ДВА разных «дома»
  // на одном месте — было: «улица Академика Сатпаева, 247» (электро, официально) и
  // «Академика Сатпаева, 247» (ГВС, ручная жалоба) — два пина вместо одного). Берём
  // каноническое имя улицы ИЗ OSM-РЕЕСТРА (h.street), а не как написано в жалобе.
  const exact = list.find((h) => h.house.toLowerCase() === house.toLowerCase());
  if (exact) return { lat: exact.lat, lng: exact.lng, via: 'exact', list, streetName: exact.street };
  const n = houseNum(house);
  if (!Number.isNaN(n) && list.length) {
    const near = list
      .map((h) => ({ h, d: Math.abs(houseNum(h.house) - n) }))
      .filter((x) => !Number.isNaN(x.d))
      .sort((a, b) => a.d - b.d)[0];
    if (near && near.d <= 15) return { lat: near.h.lat, lng: near.h.lng, via: 'nearest(' + near.h.house + ')', list, streetName: near.h.street };
  }
  const g = await geocode(`${street}, ${house}`);
  if (g) return { lat: g.lat, lng: g.lng, via: 'geocode', list, streetName: `улица ${street}` };
  const gs = await geocode(`улица ${street}`);
  if (gs) return { lat: gs.lat, lng: gs.lng, via: 'street-center', list, streetName: `улица ${street}` };
  return null;
}

(async () => {
  const now = new Date().toISOString();
  const out = [];
  for (const r of REPORTS) {
    const loc = await locate(r.street, r.house);
    if (!loc || !inBounds(loc.lat, loc.lng)) { console.log('ПРОПУСК (не геокодировано):', r.street, r.house); continue; }
    out.push({ street: loc.streetName || r.street, house: r.house, lat: +loc.lat.toFixed(5), lng: +loc.lng.toFixed(5),
      resource: r.resource, reason: r.note, ts: now });
    console.log('  ', loc.streetName || r.street, r.house, '→', loc.via, `(${loc.lat},${loc.lng})`);

    // соседние дома на той же улице (±3 по номеру) — тоже отмечаем
    const n = houseNum(r.house);
    if (!Number.isNaN(n) && loc.list) {
      const neighbours = loc.list.filter((h) => {
        const hn = houseNum(h.house);
        return !Number.isNaN(hn) && hn !== n && Math.abs(hn - n) <= 3;
      });
      neighbours.forEach((h) => {
        out.push({ street: h.street, house: h.house, lat: h.lat, lng: h.lng,   // h.street = каноническое имя из OSM
          resource: r.resource, reason: r.note + ' (рядом с заявленным домом)', ts: now });
      });
      if (neighbours.length) console.log('     + соседних домов:', neighbours.map((h) => h.house).join(', '));
    }
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 0));
  console.log(`\nИтого записей: ${out.length} → ${OUT}`);
})();
