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

  const { houses, skipped } = groupHouses(records);
  const c = center || [median(houses.map((h) => h.lat)), median(houses.map((h) => h.lng))];

  const out = {
    city: city.name, cityId: city.id, source: effectiveSource, tzOffset: city.tzOffset || 0,
    updated: new Date().toISOString(), center: c,
    counts: { houses: houses.length, outages: houses.reduce((s, h) => s + h.outages.length, 0) },
    houses,
  };

  const dest = path.join(__dirname, '..', 'map', 'data.json');
  fs.writeFileSync(dest, JSON.stringify(out));
  console.log(`Готово: ${out.counts.houses} домов, ${out.counts.outages} отключений (пропущено ${skipped}).`);
  console.log(`Центр: ${c.map((n) => n.toFixed(4)).join(', ')} · файл: map/data.json (${(fs.statSync(dest).size / 1024).toFixed(0)} КБ)`);
}

main().catch((e) => { console.error('Ошибка сборки:', e.message); process.exit(1); });
