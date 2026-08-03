/*
 * Геокодер адресов через Nominatim (OpenStreetMap) с файловым кэшем и рейт-лимитом.
 * Кэш: parser/geocache.json — чтобы повторные запуски не били по API.
 * Nominatim: 1 запрос/сек, обязателен User-Agent. Возвращает {lat,lng,area} или null.
 */
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'geocache.json');
const UA = 'BarJoqParser/1.0 (utility-outage map; contact reklama@barjoq.kz)';
const MIN_INTERVAL = 1200; // мс между запросами

let cache = {};
try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (e) {}
function saveCache() { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 0)); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReq = 0;

// area = район/микрорайон из display_name (2-й компонент), например «Хром зауыты»
function pickArea(dn) {
  const parts = (dn || '').split(',').map((s) => s.trim());
  return parts[1] || '';
}

async function geocode(query, { city = 'Павлодар', country = 'Казахстан' } = {}) {
  const key = query.toLowerCase();
  if (key in cache) return cache[key];

  const wait = MIN_INTERVAL - (Date.now() - lastReq);
  if (wait > 0) await sleep(wait);
  lastReq = Date.now();

  const q = encodeURIComponent(`${query}, ${city}, ${country}`);
  // accept-language=ru — иначе Nominatim отдаёт местные названия районов
  // («Химқалашықтар» вместо «Химгородки») и они попадают в карточку дома.
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=0&accept-language=ru&q=${q}`;
  let result = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const arr = await res.json();
      if (arr[0]) {
        const lat = +parseFloat(arr[0].lat).toFixed(5);
        const lng = +parseFloat(arr[0].lon).toFixed(5);
        result = { lat, lng, area: pickArea(arr[0].display_name) };
      }
    }
  } catch (e) { /* сеть — вернём null, попробуем в след. раз */ }

  cache[key] = result;
  saveCache();
  return result;
}

/* Геометрия улицы (линия) — чтобы подсвечивать ВСЮ улицу, а не одну точку.
   Nominatim polygon_geojson=1 отдаёт LineString/MultiLineString для way улицы.
   Возвращает массив путей: [[[lat,lng],…], …] или null. */
async function geocodeGeometry(query, { city = 'Павлодар', country = 'Казахстан' } = {}) {
  const key = 'geom:' + query.toLowerCase();
  if (key in cache) return cache[key];

  const wait = MIN_INTERVAL - (Date.now() - lastReq);
  if (wait > 0) await sleep(wait);
  lastReq = Date.now();

  const q = encodeURIComponent(`${query}, ${city}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&polygon_geojson=1&q=${q}`;
  let paths = null;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (res.ok) {
      const arr = await res.json();
      const g = arr[0] && arr[0].geojson;
      if (g && g.type === 'LineString') paths = [g.coordinates.map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)])];
      else if (g && g.type === 'MultiLineString') paths = g.coordinates.map((line) => line.map(([x, y]) => [+y.toFixed(5), +x.toFixed(5)]));
      // ограничим объём: не больше 400 точек суммарно
      if (paths) {
        let total = paths.reduce((s, p) => s + p.length, 0);
        if (total > 400) {
          const step = Math.ceil(total / 400);
          paths = paths.map((p) => p.filter((_, i) => i % step === 0 || i === p.length - 1));
        }
      }
    }
  } catch (e) {}

  cache[key] = paths;
  saveCache();
  return paths;
}

module.exports = { geocode, geocodeGeometry, saveCache };
