/*
 * Адаптер: Павлодар — РЕАЛЬНЫЕ данные с pavlodarenergo.kz.
 *
 * Конвейер:
 *   1. Страница «Плановые отключения» → находим городской .docx (файл вида NN.NN.NN-NN.NN.NN.docx).
 *   2. Скачиваем .docx, читаем таблицу: Дата · № ТП(фидер) · Причина · Время · Потребители.
 *   3. Из ячейки «Потребители» вытаскиваем улицы, геокодируем через Nominatim (кэш).
 *   4. Отдаём записи: электроснабжение, плановые, с датой/временем/причиной/координатами.
 *
 * Источник публикует ЭЛЕКТРОСНАБЖЕНИЕ (плановые). ГВС/тепло/вода — отдельные источники,
 * подключаются позже. Если сеть/парсинг упали — фолбэк на демо-набор (pavlodar-curated).
 */
const { fetchDocxRows } = require('../lib/docx');
const { geocode, geocodeGeometry } = require('../lib/geocode');
const curated = require('./pavlodar-curated');
const pvkWater = require('./pvk-water');
const ptsHeat = require('./pts-heat');
const citizen = require('./citizen');
const manualReports = require('./manual-reports');
const pavonHeat = require('./pavon-heat');
const resolved = require('./resolved');
const incidents = require('./incidents');

const PAGE = 'https://pavlodarenergo.kz/ru/informacziya-o-planovyix-otklyucheniyax.html';
const HOST = 'https://pavlodarenergo.kz';
const SOURCE = 'АО «Павлодарэнерго» · плановые отключения электроэнергии (pavlodarenergo.kz, .docx)';
const CENTER = [52.2871, 76.9674];
// «сейчас»: в проде — реальное время; для воспроизводимого локального теста можно зафиксировать
// через переменную окружения BARJOQ_NOW (напр. BARJOQ_NOW=2026-08-03T12:00:00Z).
const NOW = process.env.BARJOQ_NOW ? Date.parse(process.env.BARJOQ_NOW) : Date.now();
const MAX_GEOCODE = 200;

const UA = { 'User-Agent': 'Mozilla/5.0 (BarJoqParser/1.0)' };

// Страница публикует НЕСКОЛЬКО электро-файлов:
//   • общий городской — имя-даты «03.08.26-07.08.26.docx» (улицы Павлодара);
//   • районные «planovye-otklyucheniya-zpes-…», «…-vpes-…» (ЗПЭС/ВПЭС — сети района/сёла).
// Берём ВСЕ три: городской парсится как есть, из районных попадут лишь адреса в черте
// Павлодара — сельские отсеет bounds-фильтр по координатам (см. ниже). Файлы
// «grafik-zapuska…gotovnosti…» — это графики запуска ТЕПЛА, не электро → исключаем.
async function findElectricDocx() {
  const res = await fetch(PAGE, { headers: UA });
  const html = await res.text();
  const links = [...new Set((html.match(/\/assets\/files\/[^"']+\.docx/gi) || []))];
  const electric = links.filter((u) => {
    const name = u.toLowerCase();
    if (/grafik|gotovnosti/.test(name)) return false;                       // графики запуска тепла — не сюда
    return /\/\d{2}\.\d{2}\.\d{2}-\d{2}\.\d{2}\.\d{2}[^/]*\.docx$/i.test(u)  // общий городской (даты в имени)
        || /otklyucheni/.test(name);                                        // районные ЗПЭС/ВПЭС
  });
  return electric.map((u) => HOST + u);
}

function parseDate(s) { const m = (s || '').match(/(\d{2})\.(\d{2})\.(\d{4})/); return m ? { y: +m[3], mo: +m[2], d: +m[1] } : null; }
function parseTime(s) {
  const m = (s || '').match(/(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/);
  return m ? { h1: +m[1], m1: +m[2], h2: +m[3], m2: +m[4] } : { h1: 9, m1: 0, h2: 17, m2: 0 };
}
function isoWall(d, h, mi) { return new Date(Date.UTC(d.y, d.mo - 1, d.d, h, mi)).toISOString(); }

// Извлечение улиц из текста «Потребители».
// Префикс требует точку/пробел (чтобы «улиц:» в «в квадрате улиц:» НЕ ловился),
// стоп-символы включают дефис (разделитель улиц в «квадрате»), но не точку (инициалы).
// Без \b: в JS \b не срабатывает перед кириллицей. Точку/пробел после префикса
// уже достаточно, чтобы «улиц:» и «Рули» не ловились.
const PFX = '(?:ул\\.|пер\\.|пр\\.|пл\\.|мкр\\.|б-р\\s|проспект\\s|улица\\s|переулок\\s)';
function cleanStreet(raw) {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/\s+(с|со)\s+\d+.*$/i, '');                 // «с 1 по 21», «со 2 по 8»
  s = s.replace(/\s*(СТО|Кафе|Магазин|Жилой|Частные|Водоснабжение|Сад|ПКСТ|Административ|Управление|филиал|здание|Национальн|Главпоч|Рули).*$/i, '');
  s = s.replace(/[,.]?\s*\d+[а-я]?\s*$/i, '');              // хвостовой номер дома
  s = s.replace(/[«».,;:\-]+$/, '').trim();
  return s;
}
function extractStreets(text) {
  const found = new Map(); // name → house|null
  const re = new RegExp(PFX + '\\s*([А-ЯЁ][^,;–—«»()\\n-]*)', 'gu');
  let m;
  while ((m = re.exec(text))) {
    const house = (m[1].match(/,\s*(\d+[а-я]?)/) || [])[1] || null;
    const name = cleanStreet(m[1]);
    if (name.length < 3 || /[:\d]/.test(name[0]) || /улиц/i.test(name)) continue;
    if (!found.has(name)) found.set(name, house);
  }
  return [...found.entries()].map(([name, house]) => ({ name, house }));
}

async function fetchPavlodar() {
  const urls = await findElectricDocx();
  if (!urls.length) throw new Error('электро .docx не найдены на странице');

  // строки данных: [дата, фидер, причина, время, потребители...] — из ВСЕХ файлов
  const outages = [];
  for (const url of urls) {
    console.log('  .docx:', url.split('/').pop());
    let rows;
    try { rows = await fetchDocxRows(url); }
    catch (e) { console.warn('    пропуск (не читается):', e.message); continue; }
    for (const cells of rows) {
      if (cells.length < 5 || !/^\d{2}\.\d{2}\.\d{4}/.test(cells[0])) continue;
      const date = parseDate(cells[0]); if (!date) continue;
      const feeder = cells[1], cause = cells[2], time = parseTime(cells[3]);
      const consumers = cells.slice(4).join(' ');
      outages.push({ date, feeder, cause, time, streets: extractStreets(consumers) });
    }
  }
  console.log(`  строк-отключений (все файлы): ${outages.length}`);

  // уникальные улицы → геокод (по частоте, с лимитом)
  const freq = new Map();
  outages.forEach((o) => o.streets.forEach((s) => freq.set(s.name, (freq.get(s.name) || 0) + 1)));
  const uniq = [...freq.keys()].sort((a, b) => freq.get(b) - freq.get(a)).slice(0, MAX_GEOCODE);
  console.log(`  геокодирую улиц: ${uniq.length} (Nominatim, кэш)…`);
  const coords = new Map(), geoms = new Map();
  let done = 0;
  for (const name of uniq) {
    const g = await geocode(`улица ${name}`);
    if (g) coords.set(name, g);
    const gm = await geocodeGeometry(`улица ${name}`);
    if (gm) geoms.set(name, gm);
    if (++done % 20 === 0) process.stdout.write(`   …${done}/${uniq.length}\n`);
  }
  console.log(`  геокодировано: ${coords.size}/${uniq.length}`);

  // записи
  const records = [];
  let seq = 0;
  for (const o of outages) {
    const start = isoWall(o.date, o.time.h1, o.time.m1);
    const end = isoWall(o.date, o.time.h2, o.time.m2);
    if (new Date(end).getTime() < NOW) continue;                 // прошлые пропускаем
    const status = new Date(start).getTime() > NOW ? 'future' : 'current';
    const reason = [o.cause, o.feeder].filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim();
    for (const s of o.streets) {
      const g = coords.get(s.name); if (!g) continue;
      // отбрасываем геокод-выбросы за пределами Павлодара (ошибочные совпадения Nominatim)
      if (Math.abs(g.lat - CENTER[0]) > 0.22 || Math.abs(g.lng - CENTER[1]) > 0.35) continue;
      seq++;
      const jit = () => (((seq * 2654435761) % 1000) / 1000 - 0.5) * 0.0009;
      records.push({
        address: s.house ? `улица ${s.name}, ${s.house}` : `улица ${s.name}`,
        district: g.area || 'Павлодар',
        lat: +(g.lat + jit()).toFixed(5), lng: +(g.lng + jit()).toFixed(5),
        resource: 'electricity', type: 'planned', status,
        start, end, reason, provider: 'АО «Павлодарэнерго»',
        geom: s.house ? null : (geoms.get(s.name) || null),
        streetWide: !s.house,
      });
    }
  }
  return { records, center: CENTER, source: SOURCE };
}

// Обёртка: агрегируем ВСЕ реальные источники Павлодара.
//   • электроснабжение — АО «Павлодарэнерго» (.docx)
//   • водоснабжение   — ТОО «Павлодар-Водоканал» (pvk.pawlodarkz.kz)
// Никакого демо-домешивания. Демо — только аварийный фолбэк, если оба источника упали.
async function fetchWithFallback() {
  const records = [];
  const parts = [];

  try {
    const e = await fetchPavlodar();
    if (e.records.length) { records.push(...e.records); parts.push('электроснабжение (Павлодарэнерго)'); }
  } catch (e) { console.warn('  электроснабжение недоступно:', e.message); }

  try {
    console.log('  Павлодар-Водоканал (вода)…');
    const w = await pvkWater.fetch();
    if (w.records.length) { records.push(...w.records); parts.push('водоснабжение (Павлодар-Водоканал)'); }
  } catch (e) { console.warn('  водоснабжение недоступно:', e.message); }

  try {
    console.log('  Павлодарские тепловые сети (ГВС)…');
    const h = await ptsHeat.fetch();
    if (h.records.length) { records.push(...h.records); parts.push('ГВС (Павлодарские тепловые сети)'); }
  } catch (e) { console.warn('  ГВС недоступно:', e.message); }

  // Точные графики ПОДКЛЮЧЕНИЯ ГВС (адресные списки ПТС через городской портал).
  // ⚠️ ТОЧНЕЕ эвристики «все многоэтажки» из pts-heat.js: там дом/дата известны наверняка.
  // Поэтому для совпавших адресов эвристические hot_water-записи УДАЛЯЕМ — иначе у дома
  // было бы два наряда ГВС с разными датами и карточка показала бы менее точную.
  try {
    console.log('  графики подключения ГВС (pavon.kz)…');
    const ph = await pavonHeat.fetch();
    if (ph.records.length) {
      const exact = new Set(ph.records.map((r) => r.address.trim().toLowerCase()));
      const before = records.length;
      for (let i = records.length - 1; i >= 0; i--) {
        const r = records[i];
        if (r.resource === 'hot_water' && exact.has(r.address.trim().toLowerCase())) records.splice(i, 1);
      }
      const removed = before - records.length;
      records.push(...ph.records);
      parts.push('графики подключения ГВС (адресные списки ПТС)');
      if (removed) console.log(`    точные адреса вытеснили ${removed} эвристических записей ГВС`);
    }
  } catch (e) { console.warn('  графики подключения ГВС недоступны:', e.message); }

  // Сообщения жителей (подтверждённые модератором в таблице) — ОТДЕЛЬНЫЙ слой.
  // Не влияет на фолбэк: даже если официальные источники пусты, демо не подменяем при наличии citizen.
  try {
    const cz = await citizen.fetch();
    if (cz.records.length) { records.push(...cz.records); parts.push('сообщения жителей'); }
  } catch (e) { console.warn('  сообщения жителей недоступны:', e.message); }

  // Временный слой РУЧНЫХ жалоб (пока не чинили автозапись в таблицу — см. manual-reports.js).
  try {
    const mr = await manualReports.fetch();
    if (mr.records.length) { records.push(...mr.records); parts.push('ручные жалобы'); }
  } catch (e) { console.warn('  ручные жалобы недоступны:', e.message); }

  // Incidents из админки/Decision Engine (Supabase) — ручные и community-подтверждённые
  // отключения, ОТДЕЛЬНЫЙ слой, как citizen.js.
  try {
    const inc = await incidents.fetch();
    if (inc.records.length) { records.push(...inc.records); parts.push('BARJOK incidents'); }
    var incidentsRestoredSet = inc.restoredSet; // eslint-disable-line no-var
  } catch (e) { console.warn('  incidents недоступны:', e.message); }

  // «Восстановлено» через таблицу — применяем В САМОМ КОНЦЕ, после ВСЕХ источников
  // (официальных и жителей), чтобы перекрывать вообще любую запись по адресу.
  //
  // ⚠️⚠️ ИСКЛЮЧЕНИЕ: записи, подтверждённые ВРУЧНУЮ в админке (manualLock), этот
  // механизм НЕ трогает. Причина: Google-таблица — старый и более слабый канал
  // (строка живёт там неограниченно, статус проставляется руками), и одна давняя
  // одобренная строка молча стирала бы свежее решение администратора — то есть
  // парсер отменял бы ручной ввод. Снять ручное отключение можно ТАМ ЖЕ, где его
  // поставили: кнопкой «Восстановлено» в админке (incidentsRestoredSet ниже).
  try {
    const resolvedSet = await resolved.fetchResolvedSet();
    if (resolvedSet.size) {
      const before = records.length;
      let kept = 0;
      for (let i = records.length - 1; i >= 0; i--) {
        if (!resolved.isResolved(resolvedSet, records[i].address, records[i].resource)) continue;
        if (records[i].manualLock) { kept++; continue; }
        records.splice(i, 1);
      }
      const removed = before - records.length;
      if (removed) console.log(`  восстановлено (убрано с карты): ${removed} записей`);
      if (kept) console.log(`  ручные подтверждения защищены от отмены таблицей: ${kept}`);
    }
  } catch (e) { console.warn('  не удалось применить восстановленные адреса:', e.message); }

  // То же самое, но источник restored-сигнала — incidents.status=RESTORED (Decision
  // Engine/админка), а не Sheet. Тоже в самом конце, тоже подавляет любой источник.
  if (incidentsRestoredSet && incidentsRestoredSet.size) {
    const before = records.length;
    for (let i = records.length - 1; i >= 0; i--) {
      if (incidents.isRestored(incidentsRestoredSet, records[i].address, records[i].resource)) records.splice(i, 1);
    }
    const removed = before - records.length;
    if (removed) console.log(`  restored (BARJOK incidents): убрано с карты ${removed} записей`);
  }

  if (records.length) {
    return { records, center: CENTER, source: 'Реальные источники Павлодара: ' + parts.join(' + ') };
  }
  console.warn('  все реальные источники недоступны → фолбэк на демо-набор');
  const c = await curated.fetchCurated();
  return { records: c.records, center: CENTER, source: curated.SOURCE_CURATED };
}

module.exports = { fetch: fetchWithFallback, fetchReal: fetchPavlodar, SOURCE };
