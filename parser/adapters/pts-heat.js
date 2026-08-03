/*
 * Адаптер: ТОО «Павлодарские тепловые сети» — ГОРЯЧАЯ вода / отопление.
 * Источник: https://toopts.kz/ (новости). Часть объявлений содержит текстовые
 * списки улиц («в границах улиц: ул. Камзина; ул. Естая; …») и периоды
 * («с 03 по 06 августа») — их и парсим. У части объявлений адреса лежат в фото
 * (скриншоты WhatsApp) — такие пропускаем (нужен OCR).
 *
 * Возвращает «сырые» записи (resource='hot_water') — геокод улиц делает вызывающий код.
 */
const { geocode, geocodeGeometry } = require('../lib/geocode');

const HOME = 'https://toopts.kz/ru/';
const SOURCE = 'ТОО «Павлодарские тепловые сети» · отключения ГВС (toopts.kz)';
const UA = { 'User-Agent': 'Mozilla/5.0 (BarJoqParser/1.0)' };
const NOW = Date.UTC(2026, 7, 3, 12, 0);
const KEEP_TO = NOW + 21 * 86400000;
const MAX_ARTICLES = 12;
const MONTHS = ['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];

async function getText(url) { const r = await fetch(url, { headers: UA }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text(); }
function strip(html) { return html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim(); }
function monthIdx(w) { w = w.toLowerCase(); return MONTHS.findIndex((m) => w.startsWith(m)); }

// периоды «с DD по DD <месяц>» с позициями в тексте
function findPeriods(text, year) {
  const re = /с\s*(\d{1,2})\s*(?:по|до)\s*(\d{1,2})\s*([А-Яа-я]+)/gi;
  const out = []; let m;
  while ((m = re.exec(text))) {
    const mo = monthIdx(m[3]); if (mo < 0) continue;
    out.push({ d1: +m[1], d2: +m[2], mo, idx: m.index });
  }
  return out;
}
// улицы в сегменте текста. Формат источника: «* ул. Камзина; * ул. Естая; …»
function findStreets(seg) {
  const set = new Set(); let m;
  // имя = всё до ближайшего разделителя ; , * . конца строки
  const re = /(?:ул\.|улица|проспект|пр\.|пер\.)\s*([^;,*\n]+)/g;
  while ((m = re.exec(seg))) {
    let name = m[1].replace(/\s+/g, ' ').trim();
    name = name.replace(/\s*(будет|в границах|с уважением|запитанных|года)\b.*$/i, '');
    name = name.replace(/[.;,\s]+$/, '').trim();
    if (name.length >= 3 && name.length <= 40 && /^[А-ЯЁ]/.test(name) && !/границ|улиц|город|дом|этап/i.test(name)) set.add(name);
  }
  return [...set];
}

async function fetchPtsHeat() {
  const home = await getText(HOME);
  const links = [...new Set((home.match(/\/ru\/news\/[^"']+\//g) || []))].slice(0, MAX_ARTICLES);

  const parsed = [];       // { resource, type, d1,d2,mo, year, streets }
  const streetSet = new Set();
  for (const slug of links) {
    let html; try { html = await getText('https://toopts.kz' + slug); } catch (e) { continue; }
    const text = strip(html);
    const isHeat = /горяч|тепл/i.test(text);
    const isOutage = /(приостановлен|отключ|ограничен)/i.test(text) && !/без\s+отключения/i.test(text);
    if (!isHeat || !isOutage) continue;
    // год берём из даты публикации (DD.MM.YYYY), а НЕ из «сезону 2026–2027»
    const year = +((text.match(/\b\d{2}\.\d{2}\.(\d{4})\b/) || [])[1] || new Date(NOW).getUTCFullYear());
    const resource = /отоплени/i.test(text) && !/горяч/i.test(text) ? 'heating' : 'hot_water';
    // Аварией считаем только явные формулировки. Слова «снижение аварийности»,
    // «повышение надёжности» в описательной части — это НЕ авария.
    const type = /(авари[йн]\w*\s+(?:работ|отключ|ситуац)|порыв|устранени[ея]\s+(?:повреждени|дефект|утечк))/i.test(text)
      ? 'emergency' : 'planned';

    const periods = findPeriods(text, year);
    if (!periods.length) continue;
    // сегмент = текст от периода до следующего периода → улицы этого этапа
    for (let i = 0; i < periods.length; i++) {
      const seg = text.slice(periods[i].idx, periods[i + 1] ? periods[i + 1].idx : periods[i].idx + 1200);
      const streets = findStreets(seg);
      if (!streets.length) continue;
      parsed.push({ resource, type, ...periods[i], year, streets });
      streets.forEach((s) => streetSet.add(s));
    }
  }

  // геокод
  const coords = new Map(), geoms = new Map();
  for (const name of streetSet) {
    const g = await geocode(`улица ${name}`); if (g) coords.set(name, g);
    const gm = await geocodeGeometry(`улица ${name}`); if (gm) geoms.set(name, gm);
  }

  const records = []; let seq = 0;
  for (const p of parsed) {
    const start = new Date(Date.UTC(p.year, p.mo, p.d1, 0, 0)).toISOString();
    const end = new Date(Date.UTC(p.year, p.mo, p.d2, 23, 59)).toISOString();
    if (new Date(end).getTime() < NOW || new Date(start).getTime() > KEEP_TO) continue;
    const status = new Date(start).getTime() > NOW ? 'future' : 'current';
    for (const name of p.streets) {
      const g = coords.get(name); if (!g) continue;
      if (Math.abs(g.lat - 52.2871) > 0.22 || Math.abs(g.lng - 76.9674) > 0.35) continue;
      seq++;
      const jit = () => (((seq * 2654435761) % 1000) / 1000 - 0.5) * 0.0012;
      records.push({
        address: `улица ${name}`,
        district: g.area || 'Павлодар',
        lat: +(g.lat + jit()).toFixed(5), lng: +(g.lng + jit()).toFixed(5),
        resource: p.resource, type: p.type, status,
        start, end,
        reason: 'Гидравлические испытания / ремонт теплосети — приостановка ГВС',
        provider: 'ТОО «Павлодарские тепловые сети»',
        geom: geoms.get(name) || null,      // вся улица подсвечивается
        streetWide: true,
      });
    }
  }
  return { records, source: SOURCE };
}

module.exports = { fetch: fetchPtsHeat, SOURCE };
