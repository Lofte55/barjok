#!/usr/bin/env node
/*
 * ОДНОРАЗОВЫЙ (офлайн) билдер членства домов в микрорайонах ПТС.
 *
 * Зачем: микрорайон (напр. «Химгородки») ПТС называет как единицу, но уличная разметка
 * его закрыть не может — улицы Химгородков разбросаны и коллизируют по normStreet
 * (Луговая тянется на 9.6 км, Катаева/Павлова центрами в 4–5 км от ядра). Единственная
 * точная гранулярность — ДОМ: Nominatim reverse стабильно отдаёт OSM-suburb для каждого дома.
 *
 * Что делает: для каждого микрорайона из CONFIG берёт дома OSM-реестра в радиусе вокруг
 * центра, reverse-геокодит их (кэш geocache.json), оставляет дома с нужным OSM-suburb и
 * пишет parser/microdistricts.json = { "<id>": [[street,house,lat,lng], …] }.
 * Файл КОММИТИТСЯ в git → парсер и CI читают готовое, reverse в рантайме не делают.
 *
 * Запуск: node parser/build-microdistricts.js   (можно повторять — кэш reverse переиспользуется)
 *
 * ⚠️ OSM-suburb ≠ ПТС-микрорайон 1:1 (проверено): часть улиц, которые ПТС относит к
 * Химгородкам (Павлова, Сураганова, Катаева), OSM метит иначе. Поэтому это МЕМБЕРШИП ДОМОВ
 * ПО OSM — он даёт плотное жильё ядра микрорайона; курируемые улицы ПТС в pts-heat.js
 * добавляются СВЕРХУ (union) и закрывают то, что OSM относит в соседние suburb'ы.
 */
const fs = require('fs');
const path = require('path');

const BUILDINGS = path.join(__dirname, 'buildings.json');
const CACHE = path.join(__dirname, 'geocache.json');
const OUT = path.join(__dirname, 'microdistricts.json');
const UA = 'BarJoqParser/1.0 (utility-outage map; contact reklama@barjoq.kz)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Микрорайоны: id · OSM-suburb (как отдаёт Nominatim reverse) · центр ядра · радиус (км).
// Расширять по мере надобности. id должен совпадать с id в MICRODISTRICTS (pts-heat.js).
const CONFIG = [
  { id: 'himgorod', suburb: 'Химгородки', center: [52.30072, 76.92184], radiusKm: 1.3 },
];

let cache = {}; try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
const saveCache = () => fs.writeFileSync(CACHE, JSON.stringify(cache, null, 0));
const km = (dlat, dlng) => Math.sqrt((dlat * 111) ** 2 + (dlng * 68) ** 2);
// Индустриальные «улицы» (промзоны) — жителей нет, ГВС размечать не нужно.
const INDUSTRIAL = /промзон|промышленн|промбаза|склад/i;
let lastReq = 0;

async function reverseSuburb(lat, lng) {
  const key = `rev:${lat},${lng}`;
  if (key in cache) return cache[key];
  const wait = 1200 - (Date.now() - lastReq); if (wait > 0) await sleep(wait); lastReq = Date.now();
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=ru&zoom=16&addressdetails=1`;
  let s = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) { const a = (await res.json()).address || {}; s = a.suburb || a.neighbourhood || a.quarter || a.city_district || null; }
  } catch (e) { /* сеть — вернём null, попробуем в след. раз */ }
  cache[key] = s; saveCache();
  return s;
}

async function main() {
  const rows = JSON.parse(fs.readFileSync(BUILDINGS, 'utf8'));
  const out = {};
  for (const md of CONFIG) {
    const [clat, clng] = md.center;
    const cand = rows.filter((r) => km(r[2] - clat, r[3] - clng) < md.radiusKm);
    console.log(`\n${md.id} (${md.suburb}): кандидатов в радиусе ${md.radiusKm}км = ${cand.length}`);
    const members = [];
    let done = 0;
    for (const [street, house, lat, lng] of cand) {
      if (INDUSTRIAL.test(street)) continue;   // промзоны — не жильё, пропускаем
      const s = await reverseSuburb(lat, lng);
      if (s === md.suburb) members.push([street, house, lat, lng]);
      if (++done % 50 === 0) process.stdout.write(`  …${done}/${cand.length}\r`);
    }
    // дедуп по адресу
    const seen = new Set();
    out[md.id] = members.filter(([st, h]) => { const k = (st + '|' + h).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
    const streets = [...new Set(out[md.id].map((m) => m[0]))];
    console.log(`  членов ${md.suburb}: ${out[md.id].length} домов на ${streets.length} улицах`);
    console.log('  улицы:', streets.join(' · '));
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`\nГотово → ${path.relative(process.cwd(), OUT)}`);
}
main().catch((e) => { console.error('Ошибка:', e.message); process.exit(1); });
