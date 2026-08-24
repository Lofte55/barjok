#!/usr/bin/env node
/*
 * Бар Жоқ — сборщик данных отключений (мульти-город).
 *
 *   node parser/index.js            → активный город (Павлодар)
 *   node parser/index.js pavlodar   → конкретный город по id
 *   node parser/index.js novosibirsk
 *
 * Пишет app/data.json (модель house-centric), который читает карта.
 * Добавить город = один объект в parser/cities.js с его адаптером.
 */

const fs = require('fs');
const path = require('path');
const { CITIES, getCity } = require('./cities');

/* Разворачивание «уличных» записей в конкретные дома.
   Источник пишет «отключение на Кутузова» → показываем ВСЕ дома по Кутузова
   (адресный реестр OSM), а не линию улицы. */
const buildings = require('./lib/buildings');
const MAX_HOUSES_PER_STREET = 300;

async function expandStreetRecords(records) {
  const out = [];
  let expanded = 0, kept = 0;
  for (const r of records) {
    if (!r.streetWide) { out.push(r); continue; }
    const streetName = (r.address || '').replace(/^(улица|ул\.?|проспект|пр\.?|переулок|пер\.?)\s*/i, '').trim();
    let houses = [];
    try { houses = await buildings.housesOnStreet(streetName, MAX_HOUSES_PER_STREET); } catch (e) {}
    if (!houses.length) { out.push(r); kept++; continue; }   // нет в реестре — оставляем как есть
    expanded++;
    for (const h of houses) {
      out.push({
        ...r,
        address: `${h.street}, ${h.house}`,
        lat: h.lat, lng: h.lng,
        geom: null,            // геометрия улицы больше не нужна — есть дома
        streetWide: false,
        onStreet: streetName,  // пометка: пришло из «уличного» объявления
      });
    }
  }
  if (expanded) console.log(`  улиц развёрнуто в дома: ${expanded}${kept ? ` (не найдено в реестре: ${kept})` : ''}`);
  return out;
}

function groupHouses(records) {
  const houses = new Map();
  let skipped = 0;
  for (const r of records) {
    if (!r.address || typeof r.lat !== 'number' || typeof r.lng !== 'number' || !r.resource) { skipped++; continue; }
    const key = r.address.trim().toLowerCase();
    if (!houses.has(key)) {
      houses.set(key, { id: 'h' + houses.size, address: r.address.trim(), district: r.district || '', lat: r.lat, lng: r.lng, outages: [] });
    }
    houses.get(key).outages.push({
      resource: r.resource, type: r.type || 'planned', status: r.status || 'current',
      start: r.start || null, end: r.end || null, reason: r.reason || '',
      ...(r.provider ? { provider: r.provider } : {}),
      ...(r.citizen ? { citizen: true } : {}),   // сообщение жителя — отдельный слой на карте
      // precision: 'exact'|'inferred'|'area'|'community' — точность геокодинга (какой дом).
      // sourceTrust: 'official'|'secondary_media'|'community' — кто автор данных.
      // Разные оси: pavon.kz даёт exact-адреса через secondary_media (не официальный
      // канал ПТС). НЕ спред ...r специально — новый adapter, забывший проставить эти
      // поля, явно даст undefined здесь, а не молча пролезет чем попало.
      ...(r.precision ? { precision: r.precision } : {}),
      ...(r.sourceTrust ? { sourceTrust: r.sourceTrust } : {}),
    });
    // геометрия улицы (для подсветки всей улицы, когда в источнике только название)
    if (r.geom && !houses.get(key).geom) houses.get(key).geom = r.geom;
    if (r.streetWide) houses.get(key).streetWide = true;
  }
  return { houses: [...houses.values()], skipped };
}

function median(nums) { const a = [...nums].sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; }

async function main() {
  const id = process.argv[2];
  const city = getCity(id);
  if (!city) { console.error(`Город "${id}" не найден. Доступно: ${CITIES.map((c) => c.id).join(', ')}`); process.exit(1); }
  if (!city.adapter) { console.error(`Для «${city.name}» адаптер ещё не подключён (source: ${city.source}).`); process.exit(1); }

  console.log(`Город: ${city.name} (${city.id})`);
  const { records, center, source } = await city.adapter();
  const effectiveSource = source || city.source;
  console.log(`Источник: ${effectiveSource} · записей: ${records.length}`);

  const expandedRecords = await expandStreetRecords(records);
  const { houses, skipped } = groupHouses(expandedRecords);
  const c = center || [median(houses.map((h) => h.lat)), median(houses.map((h) => h.lng))];

  const out = {
    city: city.name, cityId: city.id, source: effectiveSource, tzOffset: city.tzOffset || 0,
    updated: new Date().toISOString(), center: c,
    counts: { houses: houses.length, outages: houses.reduce((s, h) => s + h.outages.length, 0) },
    houses,
  };

  const dest = path.join(__dirname, '..', 'map', 'data.json');
  fs.writeFileSync(dest, JSON.stringify(out));

  // Адресный индекс для подсказок в поиске (улица → [[дом, lat, lng]]).
  // Грузится в браузере лениво, только при первом обращении к поиску.
  try {
    const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'buildings.json'), 'utf8'));
    const idx = {};
    for (const [street, house, lat, lng] of rows) {
      if (!idx[street]) idx[street] = [];
      idx[street].push([house, lat, lng]);
    }
    const addrDest = path.join(__dirname, '..', 'map', 'addresses.json');
    fs.writeFileSync(addrDest, JSON.stringify(idx));
    console.log(`Адресный индекс: ${Object.keys(idx).length} улиц / ${rows.length} адресов → map/addresses.json`);
  } catch (e) { console.warn('Адресный индекс не собран:', e.message); }
  console.log(`Готово: ${out.counts.houses} домов, ${out.counts.outages} отключений (пропущено ${skipped}).`);
  console.log(`Центр: ${c.map((n) => n.toFixed(4)).join(', ')} · файл: map/data.json (${(fs.statSync(dest).size / 1024).toFixed(0)} КБ)`);
}

main().catch((e) => { console.error('Ошибка сборки:', e.message); process.exit(1); });
