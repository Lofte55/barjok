/*
 * Адаптер: графики ПОДКЛЮЧЕНИЯ ГВС (Павлодар-онлайн, pavon.kz).
 *
 * Зачем: ПТС на своём сайте публикует общие формулировки («в границах улиц…»),
 * а точные АДРЕСНЫЕ СПИСКИ отдаёт через городской портал. Формат статей:
 *   «20 августа, после устранения повреждений …, горячую воду подключат по адресам:
 *     Айманова: 29, 30, 38 …  Астана: 6, 7, 7/1 …»
 *
 * ЛОГИКА (важно): список «подключат N-го числа» = у этих домов ГВС СЕЙЧАС НЕТ
 * и появится N-го. Поэтому эмитим отключение hot_water с end = дата подключения.
 * Это ТОЧНЫЕ дома (в отличие от эвристики «все многоэтажки» в pts-heat.js);
 * дубли по одному адресу схлопывает groupHouses в index.js.
 *
 * ⚠️ Источник — СМИ, а не сайт поставщика. Допустим, т.к. это дословная публикация
 * данных ПТС («сообщили в „Павлодарских тепловых сетях“»); provider помечаем честно.
 */
const buildings = require('../lib/buildings');

const BASE = 'https://pavon.kz';
const FEED = BASE + '/news';
const SOURCE = 'ТОО «Павлодарские тепловые сети» · графики подключения ГВС (публикация Павлодар-онлайн, pavon.kz)';
const UA = { 'User-Agent': 'Mozilla/5.0 (BarJoqParser/1.0)' };
const NOW = process.env.BARJOQ_NOW ? Date.parse(process.env.BARJOQ_NOW) : Date.now();
const KEEP_TO = NOW + 60 * 86400000;
// ⚠️ pavon.kz — общегородской новостной портал (не сайт ПТС), поток новостей высокий:
// статья про подключение ГВС от 12.08 (id 93356) за неполные 2 суток вытеснилась за
// пределы топ-12 более чем 15 несвязанными новостями → адаптер отдавал 0 записей,
// хотя актуальный график подключения существовал. Взято с запасом на ~неделю потока.
const MAX_ARTICLES = 60;
const MONTHS = ['январ', 'феврал', 'март', 'апрел', 'ма', 'июн', 'июл', 'август', 'сентябр', 'октябр', 'ноябр', 'декабр'];
const CENTER = [52.2871, 76.9674];

async function getText(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
// ⚠️ Инлайн-теги СКЛЕИВАЕМ (иначе «<b>Б</b>ухар» → «Б ухар» и улица не матчится),
// блочные заменяем пробелом.
function strip(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?(?:b|strong|i|em|span|u|a|font|sup|sub)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ').trim();
}
const monthIdx = (w) => MONTHS.findIndex((m) => w.toLowerCase().startsWith(m));
const normHouse = (h) => String(h || '').toLowerCase().replace(/\s+/g, '').replace(/ё/g, 'е');

/* Секции статьи: «<DD> <месяц>, <причина>, …подключат…: <адреса>» до следующей секции. */
function findSections(text, year) {
  // ⚠️ \w/\b в JS не работают с кириллицей — классы задаём явно ([а-яё]).
  const re = /(\d{1,2})\s+([А-Яа-я]+)\s*,?\s*([^:]{0,120}?)(?:подключа(?:ю)?т|будут\s+с\s+горячей\s+водой|подключен[оы])[^:]{0,60}:/gi;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const mo = monthIdx(m[2]);
    if (mo < 0) continue;
    out.push({ d: +m[1], mo, year, reason: (m[3] || '').replace(/[,\s]+$/, '').trim(), from: re.lastIndex });
  }
  // тело секции = от конца заголовка до начала следующей секции (или до «Напомним»)
  for (let i = 0; i < out.length; i++) {
    const endIdx = out[i + 1] ? out[i + 1].from : text.length;
    let body = text.slice(out[i].from, endIdx);
    const stop = body.search(/Напомним|Фото |Подписывайтесь|Поделиться/i);
    if (stop > 0) body = body.slice(0, stop);
    out[i].body = body;
  }
  return out;
}

/* «Айманова: 29, 30, 47/1  Астана: 6, 7» → [{street, houses:[…]}, …] */
function parseAddresses(body) {
  const out = [];
  // название улицы = слова с заглавной (допускаем «Ген.», «пл.», «Ак.») до двоеточия
  const re = /([А-ЯЁ][А-Яа-яЁё.\- ]{1,40}?)\s*:\s*([^А-ЯЁ]*)/g;
  let m;
  while ((m = re.exec(body))) {
    const street = m[1].replace(/\s+/g, ' ').trim();
    if (street.length < 3) continue;
    // номера: 29, 47/1, 49/А; скобки с подъездами «(1–14 п.)» отбрасываем
    const nums = (m[2] || '').replace(/\([^)]*\)/g, ' ')
      .split(/[,;]/)
      .map((s) => (s.trim().match(/^\d+\s*(?:\/\s*\d+)?\s*(?:\/\s*[A-Za-zА-Яа-я])?|^\d+\s*[а-я]\b/i) || [''])[0].replace(/\s+/g, ''))
      .filter(Boolean);
    if (nums.length) out.push({ street, houses: [...new Set(nums)] });
  }
  return out;
}

// ⚠️ ГРАБЛИ (нашли 14.08.2026, НЕ повторять само собой разумеющееся «увеличить MAX_ARTICLES»):
// pavon.kz — общегородской портал, /news отдаёт лишь ~38 последних ссылок БЕЗ реальной
// пагинации (?page= игнорируется, отдаёт тот же список) и без рабочего /search (игнорирует
// query). Статья с адресным графиком подключения ГВС (актуальным на 3+ недели вперёд)
// вытесняется из этих 38 ссылок несвязанными новостями за ~2 суток — увеличение
// MAX_ARTICLES тут не помогает, т.к. упирается в потолок самой ленты. Тег /post/tags/жкх
// тоже не содержал эту статью (непоследовательная теговка на сайте). Единственный
// надёжный способ — ID у постов последовательные: если по ссылкам из ленты ничего
// не нашли, добираем прямым перебором ID вниз от последнего известного (ID_SCAN_WINDOW).
const ID_SCAN_WINDOW = 150; // ~3 недели при текущем темпе публикаций (~7-8 постов/сутки)

async function fetchPavonHeat() {
  let feed;
  try { feed = await getText(FEED); } catch (e) { console.warn('  pavon.kz недоступен:', e.message); return { records: [] }; }
  const feedLinks = [...new Set([...feed.matchAll(/\/post\/view\/(\d+)/g)].map((m) => m[0]))];
  const links = feedLinks.slice(0, MAX_ARTICLES);

  const parsed = [];
  const tried = new Set();
  async function scanArticle(slug) {
    if (tried.has(slug)) return; tried.add(slug);
    let text;
    try { text = strip(await getText(BASE + slug)); } catch (e) { return; }
    if (!/горяч[а-яё]*\s+вод|ГВС/i.test(text)) return;   // ⚠️ не \w — кириллица
    if (!/подключ/i.test(text)) return;
    const year = +((text.match(/\b(\d{4})\s*,?\s*(?:Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье)/i) || [])[1]
      || (text.match(/\b20(\d{2})\b/) ? text.match(/\b(20\d{2})\b/)[1] : new Date(NOW).getUTCFullYear()));
    for (const sec of findSections(text, year)) {
      const addrs = parseAddresses(sec.body || '');
      if (addrs.length) parsed.push({ ...sec, addrs });
    }
  }
  for (const slug of links) await scanArticle(slug);

  // Резервный проход: ничего по ленте не нашли — перебираем ID напрямую вниз от топа.
  if (!parsed.length && feedLinks.length) {
    const topId = Math.max(...feedLinks.map((s) => +s.match(/\d+/)[0]));
    console.log(`  pavon.kz: по ленте ничего не нашли, добираю перебором ID ${topId}…${topId - ID_SCAN_WINDOW}`);
    for (let id = topId; id >= topId - ID_SCAN_WINDOW; id--) await scanArticle(`/post/view/${id}`);
  }
  if (!parsed.length) return { records: [] };
  return finishPavonHeat(parsed);
}

async function finishPavonHeat(parsed) {
  // реестр домов улицы → точные координаты
  const regCache = new Map();
  async function registry(name) {
    if (regCache.has(name)) return regCache.get(name);
    let list = [];
    try { list = await buildings.housesOnStreet(name, 800); } catch (e) {}
    const byNum = new Map(list.map((h) => [normHouse(h.house), h]));
    regCache.set(name, { byNum, list });
    return regCache.get(name);
  }

  const records = [];
  const seen = new Set();
  for (const sec of parsed) {
    // «подключат N-го» → до этой даты ГВС нет
    const end = Date.UTC(sec.year, sec.mo, sec.d, 23, 59);
    if (end < NOW || end > KEEP_TO) continue;
    // причина: «после устранения повреждений …» — хвост «, горячую воду» отсекаем
    const why = (sec.reason || '').replace(/[,\s]*горяч[а-яё]*.*$/i, '').replace(/[,\s]+$/, '').trim();
    const reason = `Нет горячей воды — подключение ${sec.d} ${MONTHS[sec.mo]}а${why ? ' · ' + why : ''}`
      .replace(/\s+/g, ' ').slice(0, 200);
    for (const a of sec.addrs) {
      const reg = await registry(a.street);
      if (!reg.list.length) continue;              // улицы нет в OSM-реестре — пропускаем
      for (const hn of a.houses) {
        const hit = reg.byNum.get(normHouse(hn));
        if (!hit) continue;                        // дома нет в реестре — не выдумываем координаты
        if (Math.abs(hit.lat - CENTER[0]) > 0.22 || Math.abs(hit.lng - CENTER[1]) > 0.35) continue;
        const address = `${hit.street}, ${hit.house}`;
        const key = `${address}|${end}`;
        if (seen.has(key)) continue; seen.add(key);
        records.push({
          address, district: 'Павлодар', lat: hit.lat, lng: hit.lng,
          resource: 'hot_water', type: 'planned', status: 'current',
          start: new Date(NOW).toISOString(), end: new Date(end).toISOString(),
          reason, provider: 'ТОО «Павлодарские тепловые сети»',
          geom: null, streetWide: false,
        });
      }
    }
  }
  if (records.length) console.log(`  графики подключения ГВС (pavon.kz): ${records.length} домов`);
  return { records, source: SOURCE };
}

module.exports = { fetch: fetchPavonHeat, SOURCE };
