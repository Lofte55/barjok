/*
 * Адаптер: ТОО «Павлодар-Водоканал» — отключения ХОЛОДНОГО водоснабжения.
 * Источник: https://pvk.pawlodarkz.kz/otklyuchenie (объявления) — свободный текст:
 *   дата, время «с 9:00 до 19:00», причина, адреса списком в <li>.
 * Плюс экстренные уведомления (аварии): /ekstrennyie-uvedomleniya.
 *
 * Возвращает «сырые» записи (resource='cold_water') — геокод улиц делает вызывающий код.
 */
const { geocode, geocodeGeometry } = require('../lib/geocode');
const buildings = require('../lib/buildings');

// нормализация номера дома для сопоставления с OSM-реестром: «58/1» «58 А» → «58/1» «58а»
function normHouse(h) { return String(h || '').toLowerCase().replace(/\s+/g, '').replace(/ё/g, 'е'); }

const BASE = 'https://pvk.pawlodarkz.kz';
const LIST = BASE + '/otklyuchenie';
const EMERG = BASE + '/ekstrennyie-uvedomleniya';
const SOURCE = 'ТОО «Павлодар-Водоканал» · отключения водоснабжения (pvk.pawlodarkz.kz)';
const UA = { 'User-Agent': 'Mozilla/5.0 (BarJoqParser/1.0)' };
// «сейчас»: в проде — реальное время; BARJOQ_NOW фиксирует его для локального теста.
const NOW = process.env.BARJOQ_NOW ? Date.parse(process.env.BARJOQ_NOW) : Date.now();
const KEEP_FROM = NOW - 3 * 86400000;   // объявления не старше 3 дней
const KEEP_TO = NOW + 14 * 86400000;    // и не дальше 2 недель вперёд
const MAX_PAGES = 10;

async function getText(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.text();
}

// ссылки-объявления с датой
function listLinks(html) {
  const out = [];
  const re = /otklyuchenie\/obyavlenie[^"'>]*?na-(\d{2})\.(\d{2})\.(\d{4})-god/gi;
  let m;
  const seen = new Set();
  while ((m = re.exec(html))) {
    const url = BASE + '/' + m[0];
    if (seen.has(url)) continue; seen.add(url);
    const date = { d: +m[1], mo: +m[2], y: +m[3] };
    const ts = Date.UTC(date.y, date.mo - 1, date.d, 12, 0);
    if (ts >= KEEP_FROM && ts <= KEEP_TO) out.push({ url, date });
  }
  return out;
}

// вырезаем блок <div class="news-detail"> … </div>
function detailBlock(html) {
  const i = html.indexOf('news-detail');
  if (i < 0) return html;
  const start = html.indexOf('>', i) + 1;
  // до закрытия секции — берём с запасом
  return html.slice(start, start + 8000);
}

function parseTime(text) {
  const m = text.match(/с\s*(\d{1,2}):(\d{2})\s*до\s*(\d{1,2}):(\d{2})/i);
  return m ? { h1: +m[1], m1: +m[2], h2: +m[3], m2: +m[4] } : { h1: 9, m1: 0, h2: 18, m2: 0 };
}
function iso(date, h, mi) { return new Date(Date.UTC(date.y, date.mo - 1, date.d, h, mi)).toISOString(); }

// улицы из <li> (или из абзацев). Возвращает [{name, house}]
const PFX = /(?:ул|улица|пр|проспект|пер|переулок|мкр|пл)\.?\s*/i;
function parseStreets(block) {
  const items = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(block))) items.push(m[1].replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim());
  // если <li> нет — ищем в тексте после «адресам:»
  if (!items.length) {
    const txt = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const after = txt.split(/адресам\s*:/i)[1] || '';
    after.split(/[;•]/).forEach((s) => { if (/(ул|пр|пер)\.?\s*[А-ЯЁ]/.test(s)) items.push(s.trim()); });
  }
  const streets = [];
  for (const it of items) {
    // улица = слова после префикса до первой цифры; дальше — СПИСОК номеров через запятую
    const sm = it.match(/(?:ул|улица|пр|проспект|пер|переулок|мкр|пл)\.?\s*([А-ЯЁ][А-Яа-яЁё.\- ]*?)\s*(\d.*)?$/i);
    if (!sm) continue;
    const name = sm[1].replace(/\s+/g, ' ').trim().replace(/[.,\-]+$/, '');
    if (name.length < 3) continue;
    // «58, 58/1, 58/2, 60» → ['58','58/1','58/2','60']; ЦТП/мусор отсекаем
    const houses = (sm[2] || '').split(/[,;]/)
      .map((s) => (s.trim().match(/^\d+\s*[а-я]?(?:\s*\/\s*\d+\s*[а-я]?)?/i) || [''])[0].replace(/\s+/g, ''))
      .filter(Boolean);
    streets.push({ name, houses });
  }
  return streets;
}

async function fetchPvkWater() {
  const listHtml = await getText(LIST);
  let links = listLinks(listHtml);
  // экстренные уведомления (аварии) — тем же форматом
  try { links = links.concat(listLinks(await getText(EMERG)).map((l) => ({ ...l, emerg: true }))); } catch (e) {}
  links = links.slice(0, MAX_PAGES);

  const records = [];
  const streetSet = new Set();
  const parsed = [];
  for (const link of links) {
    let html;
    try { html = await getText(link.url); } catch (e) { continue; }
    const block = detailBlock(html);
    const text = block.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const time = parseTime(text);
    const emerg = link.emerg || /авари|порыв|устранени|повреждени/i.test(text);
    const streets = parseStreets(block);
    if (!streets.length) continue;
    // причина — короткая
    const causeM = text.match(/(планируются[^.]*\.|замен[^.]*\.|ремонт[^.]*\.|устранени[^.]*\.)/i);
    const reason = (causeM ? causeM[1] : 'Работы на сети водоснабжения').replace(/\s+/g, ' ').trim().slice(0, 200);
    parsed.push({ date: link.date, time, emerg, streets, reason });
    streets.forEach((s) => streetSet.add(s.name));
  }

  // геокод уникальных улиц
  const coords = new Map(), geoms = new Map();
  for (const name of streetSet) {
    const g = await geocode(`улица ${name}`); if (g) coords.set(name, g);
    const gm = await geocodeGeometry(`улица ${name}`); if (gm) geoms.set(name, gm);
  }

  // реестр домов по улицам — для ТОЧНЫХ координат каждого перечисленного номера
  const regCache = new Map();
  async function registry(name) {
    if (regCache.has(name)) return regCache.get(name);
    let list = [];
    try { list = await buildings.housesOnStreet(name, 800); } catch (e) {}
    const byNum = new Map(list.map((h) => [normHouse(h.house), h]));
    regCache.set(name, byNum); return byNum;
  }
  const inBounds = (lat, lng) => Math.abs(lat - 52.2871) <= 0.22 && Math.abs(lng - 76.9674) <= 0.35;

  let seq = 0;
  for (const p of parsed) {
    const start = iso(p.date, p.time.h1, p.time.m1);
    const end = iso(p.date, p.time.h2, p.time.m2);
    if (new Date(end).getTime() < NOW) continue;
    const status = new Date(start).getTime() > NOW ? 'future' : 'current';
    for (const s of p.streets) {
      const g = coords.get(s.name);
      const base = {
        district: (g && g.area) || 'Павлодар',
        resource: 'cold_water', type: p.emerg ? 'emergency' : 'planned', status,
        start, end, reason: p.reason, provider: 'ТОО «Павлодар-Водоканал»',
      };
      if (!s.houses.length) {
        // номеров нет — размечаем улицу целиком (index.js развернёт в дома реестра)
        if (!g || !inBounds(g.lat, g.lng)) continue;
        records.push({ ...base, address: `улица ${s.name}`, lat: g.lat, lng: g.lng,
          geom: geoms.get(s.name) || null, streetWide: true });
        continue;
      }
      const reg = await registry(s.name);       // точные координаты домов улицы
      for (const hn of s.houses) {
        const hit = reg.get(normHouse(hn));
        let lat, lng;
        if (hit) { lat = hit.lat; lng = hit.lng; }
        else {
          // Дома нет в OSM-реестре улицы (Overpass) — ПЕРЕД тем как ставить точку
          // «наугад» у центра улицы, пробуем геокодировать именно этот адрес
          // напрямую через Nominatim (другой источник данных, иногда знает дом,
          // которого нет в реестре зданий). Раньше сразу шли в jitter-фолбэк —
          // получались маркеры в центре перекрёстка вместо реального дома (баг,
          // найден на примере «Сатпаева, 156», 2026-08-18).
          const gh = await geocode(`${s.name}, ${hn}`);
          if (gh && inBounds(gh.lat, gh.lng)) { lat = gh.lat; lng = gh.lng; }
          else if (g) { seq++; const j = (((seq * 2654435761) % 1000) / 1000 - 0.5) * 0.0008; lat = +(g.lat + j).toFixed(5); lng = +(g.lng + j).toFixed(5); }
          else continue;                          // ни в реестре, ни в геокоде — пропуск
        }
        if (!inBounds(lat, lng)) continue;
        records.push({ ...base, address: `улица ${s.name}, ${hn}`, lat, lng, geom: null, streetWide: false });
      }
    }
  }
  return { records, source: SOURCE };
}

module.exports = { fetch: fetchPvkWater, SOURCE };
