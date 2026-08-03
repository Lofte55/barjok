/* Бар Жоқ — карта отключений (house-centric) */
(function () {
const { RESOURCES, FALLBACK } = window.BARJOQ;

/* ---------- i18n ---------- */
const I18N = {
  ru: {
    title: (c) => `Отключения · ${c}`,
    subtitle: (n) => `Затронуто <span class="count">${n}</span> адресов`,
    search: 'Улица или адрес…',
    resources: 'Ресурс', type: 'Тип', time: 'Время',
    planned: 'Плановое', emergency: 'Аварийное', all: 'Все',
    past: 'Прошлые', current: 'Текущие', future: 'Будущие',
    streets: 'Улицы', addresses: 'Адреса', houses: 'адресов',
    none: 'Ничего не найдено',
    from: 'Отключено', to: 'Восстановят', reason: 'Причина', provider: 'Поставщик',
    district: 'Район', subscribe: 'Подписаться на этот адрес', subscribed: 'Вы подписаны',
    live: 'Идёт сейчас', soon: 'Запланировано', ended: 'Завершено',
    filtersBtn: 'Фильтры', allFilters: 'Все фильтры', offNow: 'Сейчас отключено', systems: 'систем',
    checkAddress: 'Проверить адрес', searching: 'Ищем адрес…', addrNotFound: 'Адрес не найден',
    allOk: 'Отключений нет', allOkSub: 'По этому адресу вода и свет в порядке', nearby: 'Рядом',
    whatsOff: 'Что отключено по адресу', until: 'до', na: 'нет отключений по фильтрам',
    source: 'Источник', demo: 'демо на открытых данных', adLabel: 'Реклама',
    adText: 'Место для рекламодателя', adCta: 'Разместить рекламу',
  },
  kk: {
    title: (c) => `Ажыратулар · ${c}`,
    subtitle: (n) => `<span class="count">${n}</span> мекенжай қамтылған`,
    search: 'Көше немесе мекенжай…',
    resources: 'Ресурс', type: 'Түрі', time: 'Уақыт',
    planned: 'Жоспарлы', emergency: 'Апаттық', all: 'Барлығы',
    past: 'Өткен', current: 'Ағымдағы', future: 'Болашақ',
    streets: 'Көшелер', addresses: 'Мекенжайлар', houses: 'мекенжай',
    none: 'Ештеңе табылмады',
    from: 'Ажыратылды', to: 'Қосылады', reason: 'Себебі', provider: 'Жеткізуші',
    district: 'Аудан', subscribe: 'Осы мекенжайға жазылу', subscribed: 'Жазылдыңыз',
    live: 'Қазір жүруде', soon: 'Жоспарланған', ended: 'Аяқталды',
    filtersBtn: 'Сүзгілер', allFilters: 'Барлық сүзгілер', offNow: 'Қазір ажыратылған', systems: 'жүйе',
    checkAddress: 'Мекенжайды тексеру', searching: 'Мекенжай ізделуде…', addrNotFound: 'Мекенжай табылмады',
    allOk: 'Ажырату жоқ', allOkSub: 'Бұл мекенжайда су мен жарық қалыпты', nearby: 'Жақын жерде',
    whatsOff: 'Мекенжай бойынша не ажыратылған', until: 'дейін', na: 'сүзгі бойынша жоқ',
    source: 'Дереккөз', demo: 'ашық деректердегі демо', adLabel: 'Жарнама',
    adText: 'Жарнама беруші үшін орын', adCta: 'Жарнама орналастыру',
  },
};
let LANG = localStorage.getItem('barjoq_lang') || 'ru';
const t = () => I18N[LANG];
function systemsWord(n) {
  if (LANG === 'kk') return 'жүйе';
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'система';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'системы';
  return 'систем';
}
const rName = (r) => RESOURCES[r][LANG] || RESOURCES[r].ru;

/* ---------- State ---------- */
const DATA = { city: 'Павлодар', center: [52.2871, 76.9674], houses: [], source: '' };
const state = {
  resources: new Set(Object.keys(RESOURCES)),
  type: 'all', time: 'current', query: '',
};
let STREETS = [];

/* ---------- Map ---------- */
const map = L.map('map', { zoomControl: true, attributionControl: true, preferCanvas: false }).setView(DATA.center, 12);

/* Подложка — ВЕКТОРНЫЕ тайлы OpenFreeMap (бесплатно, без ключа).
   Векторные тайлы несут name:ru / name:kk, поэтому подписи карты переключаются
   вместе с интерфейсом. Растровые тайлы так не умеют — подписи в них «вшиты»
   на местном языке (в Павлодаре казахский), поэтому от CARTO отказались. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const RASTER_FALLBACK = {
  url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
  attribution: '© OpenStreetMap, © CARTO', maxZoom: 19, subdomains: 'abcd',
};
let baseStyle = null, tileLayer = null;

// Подменяем text-field в слоях-подписях на нужный язык + добавляем номера домов.
function localizeStyle(style, lang) {
  const s = JSON.parse(JSON.stringify(style));
  const field = ['coalesce', ['get', 'name:' + lang], ['get', 'name_' + lang], ['get', 'name']];
  (s.layers || []).forEach((l) => {
    if (!l.layout || l.layout['text-field'] === undefined) return;
    // ⚠️ Меняем только подписи-НАЗВАНИЯ. Слои с иными подписями (номера домов,
    // высоты и т.п.) не трогаем, иначе их текст исчезнет.
    const cur = JSON.stringify(l.layout['text-field']);
    if (!/\bname\b/.test(cur)) return;
    l.layout['text-field'] = field;
  });

  // ⚠️ В стиле liberty НЕТ слоя номеров домов (в растровых тайлах CARTO они были).
  // Данные в тайлах есть — source-layer «housenumber». Добавляем слой сами.
  const hasHN = (s.layers || []).some((l) => (l['source-layer'] || '') === 'housenumber');
  if (!hasHN && s.sources && s.sources.openmaptiles) {
    s.layers.push({
      id: 'barjoq-housenumber',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'housenumber',
      minzoom: 16,
      layout: {
        'text-field': ['get', 'housenumber'],
        'text-font': ['Noto Sans Italic'],
        'text-size': 10,
        'text-padding': 2,
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#7b8794',
        'text-halo-color': 'rgba(255,255,255,.9)',
        'text-halo-width': 1.1,
      },
    });
  }
  return s;
}
async function setTiles(lang) {
  try {
    if (!baseStyle) baseStyle = await (await fetch(STYLE_URL)).json();
    const styled = localizeStyle(baseStyle, lang);
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.maplibreGL({ style: styled, attribution: '© OpenFreeMap © OpenMapTiles © OpenStreetMap' });
    tileLayer.addTo(map);
    // ⚠️ НЕ выставлять z-index контейнеру GL-слоя: он лежит в leaflet-tile-pane,
    // и любой явный z-index прячет подложку (карта становится белой).
    const c = tileLayer.getContainer && tileLayer.getContainer();
    if (c) c.classList.add('tiles');
    // ⚠️ Слой добавляется АСИНХРОННО (после загрузки стиля), уже после того как
    // load() отработал свои invalidateSize/fitBounds. Без явного ресайза GL-канвас
    // остаётся несинхронизированным и карта белая. Пинаем размер после монтирования.
    const sync = () => { map.invalidateSize(false); window.dispatchEvent(new Event('resize')); };
    requestAnimationFrame(() => requestAnimationFrame(sync));
    [80, 300, 800].forEach((ms) => setTimeout(sync, ms));
  } catch (e) {
    console.warn('Векторная подложка недоступна, откат на растровую:', e && e.message);
    if (tileLayer) map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(RASTER_FALLBACK.url, RASTER_FALLBACK).addTo(map);
  }
}
setTiles(LANG);
map.zoomControl.setPosition('bottomright');

/* Клик по любому месту карты → определяем дом и показываем карточку */
map.on('click', (e) => {
  if (e.originalEvent && e.originalEvent.target.closest && e.originalEvent.target.closest('.leaflet-marker-icon')) return;
  checkPoint(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6));
});
const markerLayer = L.layerGroup().addTo(map);

/* ---------- Load data ---------- */
async function load() {
  let d;
  try {
    const res = await fetch('data.json', { cache: 'no-store' });
    if (!res.ok) throw 0;
    d = await res.json();
    if (!d.houses || !d.houses.length) throw 0;
  } catch (e) { d = FALLBACK; }
  DATA.city = d.city; DATA.center = d.center; DATA.houses = d.houses; DATA.source = d.source;
  DATA.updated = d.updated;

  // индекс улиц (из адресов домов)
  const streetMap = new Map();
  DATA.houses.forEach((h) => {
    const s = streetName(h.address);
    if (!s) return;
    if (!streetMap.has(s)) streetMap.set(s, 0);
    streetMap.set(s, streetMap.get(s) + 1);
  });
  STREETS = [...streetMap.entries()].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);

  map.setView(DATA.center, 12);
  buildFilters(); applyLang();
  const pts = DATA.houses.filter(passHouse).map((h) => [h.lat, h.lng]);
  if (pts.length) {
    const b = L.latLngBounds(pts).pad(0.05);
    // ⚠️ fitBounds выполняем ТОЛЬКО пока пользователь не начал двигать карту,
    // иначе поздние таймеры «откатывают» вид назад во время панорамирования.
    let userMoved = false;
    const stop = () => { userMoved = true; };
    map.once('dragstart zoomstart', stop);
    const doFit = () => {
      if (userMoved) return;
      map.invalidateSize(false);
      map.fitBounds(b, { animate: false, maxZoom: 13 });
      window.dispatchEvent(new Event('resize')); // догрузка тайлов на первой отрисовке
    };
    doFit();
    requestAnimationFrame(doFit);
    [120, 400, 900].forEach((ms) => setTimeout(doFit, ms));
  } else { fixSize(); }
}

// «проспект Димитрова, 19» → «проспект Димитрова»
function streetName(addr) { return (addr || '').replace(/,\s*[^,]*$/, '').trim(); }

/* ---------- Filtering ---------- */
function passOutage(o) {
  if (!state.resources.has(o.resource)) return false;
  if (state.type !== 'all' && o.type !== state.type) return false;
  if (o.status !== state.time) return false;
  return true;
}
function matchingOutages(h) { return h.outages.filter(passOutage); }
// Для карточки/поиска: показываем все НЕ прошлые отключения (текущие+будущие),
// независимо от переключателя времени, но с учётом фильтра ресурсов/типа.
function cardOutages(h) {
  let outs = h.outages.filter((o) => o.status !== 'past' && state.resources.has(o.resource) && (state.type === 'all' || o.type === state.type));
  if (!outs.length) outs = h.outages.filter((o) => o.status !== 'past');
  if (!outs.length) outs = h.outages;
  // дедуп: один и тот же наряд мог прийти из нескольких объявлений
  const seen = new Set();
  outs = outs.filter((o) => {
    const k = `${o.resource}|${o.type}|${o.start}|${o.end}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  return outs.sort((a, b) => (a.status === b.status ? 0 : a.status === 'current' ? -1 : 1));
}
// Если найденный дом не попадает под текущий фильтр времени — переключаем время,
// чтобы дом стал виден и на карте, и в списке.
function ensureVisible(h) {
  if (matchingOutages(h).length) return;
  const act = h.outages.filter((o) => o.status !== 'past').sort((a, b) => new Date(a.start) - new Date(b.start));
  if (act.length && act[0].status !== state.time) { state.time = act[0].status; buildFilters(); }
}
function passHouse(h) {
  if (!matchingOutages(h).length) return false;
  const q = state.query.trim().toLowerCase();
  if (q && !h.address.toLowerCase().includes(q)) return false;
  return true;
}
function visibleHouses() { return DATA.houses.filter(passHouse); }

/* ---------- Markers ---------- */
function houseColor(outs) {
  const emerg = outs.some((o) => o.type === 'emergency');
  // цвет по «первому» ресурсу, кольцо — если авария
  return { color: RESOURCES[outs[0].resource].color, emerg };
}
function pinIcon(outs, size = 30) {
  const { color, emerg } = houseColor(outs);
  const ring = emerg ? 'box-shadow:0 0 0 4px rgba(217,67,58,.30),0 2px 8px rgba(0,0,0,.28);' : '';
  const label = outs.length > 1 ? outs.length : RESOURCES[outs[0].resource].icon;
  return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div class="pin" style="width:${size}px;height:${size}px;background:${color};font-size:${outs.length>1?size*.45:size*.5}px;${ring}">${label}</div>` });
}
function clusterIcon(count, emerg) {
  const size = count > 80 ? 52 : count > 25 ? 44 : 36;
  const color = emerg ? '#c0392b' : '#1f6feb';
  return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div class="cluster" style="width:${size}px;height:${size}px;background:${color};font-size:${count>99?12:14}px">${count}</div>` });
}

function renderMarkers() {
  markerLayer.clearLayers();
  const houses = visibleHouses();
  const z = map.getZoom();
  const individual = z >= 15 || !!state.query.trim();

  // Фолбэк: если улицы нет в адресном реестре OSM, показываем линию улицы.
  // Обычно же «уличные» объявления уже развёрнуты парсером в конкретные дома.
  houses.forEach((h) => {
    if (!h.geom) return;
    const outs = matchingOutages(h); if (!outs.length) return;
    const color = RESOURCES[outs[0].resource].color;
    const emerg = outs.some((o) => o.type === 'emergency');
    h.geom.forEach((path) => {
      if (!path || path.length < 2) return;
      // «подложка» + основная линия — чтобы улица читалась на любом фоне
      markerLayer.addLayer(L.polyline(path, { color: '#fff', weight: 11, opacity: .55, interactive: false }));
      const line = L.polyline(path, {
        color, weight: 6, opacity: .95, lineCap: 'round', lineJoin: 'round',
        dashArray: emerg ? '10 7' : null, className: 'street-hl',
      });
      line.on('click', (e) => { L.DomEvent.stop(e); openHouseCard(h, e.latlng); });
      markerLayer.addLayer(line);
    });
  });

  if (individual) {
    houses.forEach((h) => addHouseMarker(h));
  } else {
    const cell = z >= 14 ? 0.004 : z >= 13 ? 0.008 : z >= 12 ? 0.016 : 0.03;
    const grid = new Map();
    houses.forEach((h) => {
      const key = `${Math.round(h.lat / cell)}_${Math.round(h.lng / cell)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(h);
    });
    grid.forEach((group) => {
      if (group.length === 1) return addHouseMarker(group[0]);
      const lat = group.reduce((s, h) => s + h.lat, 0) / group.length;
      const lng = group.reduce((s, h) => s + h.lng, 0) / group.length;
      const emerg = group.some((h) => matchingOutages(h).some((o) => o.type === 'emergency'));
      const m = L.marker([lat, lng], { icon: clusterIcon(group.length, emerg) });
      m.on('click', () => map.setView([lat, lng], Math.min(map.getZoom() + 2, 16)));
      markerLayer.addLayer(m);
    });
  }
}
function addHouseMarker(h) {
  const outs = matchingOutages(h);
  const m = L.marker([h.lat, h.lng], { icon: pinIcon(outs) });
  m.on('click', () => openHouseCard(h, [h.lat, h.lng]));
  markerLayer.addLayer(m);
}

/* ---------- Date formatting (wall-clock, UTC getters) ---------- */
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const days = LANG === 'kk' ? ['жс','дс','сс','ср','бс','жм','сб'] : ['вс','пн','вт','ср','чт','пт','сб'];
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)} ${days[d.getUTCDay()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
function relStatus(o) {
  if (o.status === 'current') return { cls: 'live', txt: t().live };
  if (o.status === 'future') return { cls: 'soon', txt: t().soon };
  return { cls: 'ended', txt: t().ended };
}

/* ---------- House card (маленькая карточка дома) ---------- */
function openHouseCard(h, latlng) {
  const html = houseCardHtml(h);
  const popup = L.popup({ maxWidth: 320, minWidth: 288, className: 'house-popup', autoPanPadding: [24, 90] })
    .setLatLng(latlng).setContent(html).openOn(map);
  wireCard(popup, h);
  if (window.matchMedia('(max-width: 780px)').matches) collapseSheet();
}
function houseCardHtml(h) {
  const outs = cardOutages(h);
  const rows = outs.map((o) => {
    const R = RESOURCES[o.resource]; const rs = relStatus(o);
    return `<div class="hc-row">
      <span class="ic" style="background:${R.color}22;color:${R.color}">${R.icon}</span>
      <div class="hc-main">
        <div class="hc-r1"><b>${rName(o.resource)}</b>
          <span class="badge ${o.type}">${o.type === 'emergency' ? t().emergency : t().planned}</span></div>
        <div class="hc-when"><span class="st ${rs.cls}"></span>${t().to} <b>${fmtDate(o.end)}</b></div>
        <div class="hc-period">${t().from}: ${fmtDate(o.start)}</div>
        ${o.reason ? `<div class="hc-reason">${o.reason}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div class="house-card">
    <div class="hc-head">
      <div class="hc-addr">${h.address}</div>
      ${h.district ? `<div class="hc-district">${h.district}</div>` : ''}
    </div>
    <div class="hc-sum"><span class="hc-off">${t().whatsOff}: ${outs.length} ${systemsWord(outs.length)}</span></div>
    <div class="hc-list">${rows}</div>
  </div>`;
  // Кнопка «Подписаться» временно скрыта — подписки будут позже.
}
function wireCard(popup, h) { /* подписка отключена */ }

/* ---------- List ---------- */
function renderList() {
  let houses = visibleHouses();
  houses.sort((a, b) => {
    const ea = matchingOutages(a).some((o) => o.type === 'emergency');
    const eb = matchingOutages(b).some((o) => o.type === 'emergency');
    return ea === eb ? 0 : ea ? -1 : 1;
  });
  const shown = houses.slice(0, 300); // производительность списка
  const html = shown.map(listCardHtml).join('');
  document.querySelectorAll('.list').forEach((el) => {
    el.innerHTML = houses.length ? html : `<div class="none">${t().none}</div>`;
    el.querySelectorAll('.lcard').forEach((c) => {
      c.onclick = () => { const h = DATA.houses.find((x) => x.id === c.dataset.id); if (h) { map.setView([h.lat, h.lng], 16); openHouseCard(h, [h.lat, h.lng]); } };
    });
  });
  document.querySelectorAll('[data-subtitle]').forEach((el) => el.innerHTML = t().subtitle(houses.length));
  document.querySelectorAll('[data-count]').forEach((el) => el.textContent = houses.length);
}
function listCardHtml(h) {
  const outs = matchingOutages(h);
  const chips = outs.slice(0, 4).map((o) => {
    const R = RESOURCES[o.resource];
    return `<span class="rc" style="background:${R.color}1e;color:${R.color}" title="${rName(o.resource)}">${R.icon}</span>`;
  }).join('');
  const soonest = outs.map((o) => o.end).filter(Boolean).sort()[0];
  const emerg = outs.some((o) => o.type === 'emergency');
  return `<div class="lcard" data-id="${h.id}">
    <div class="lc-top">
      <div class="lc-chips">${chips}${outs.length > 4 ? `<span class="rc more">+${outs.length - 4}</span>` : ''}</div>
      ${emerg ? `<span class="badge emergency">${t().emergency}</span>` : ''}
    </div>
    <div class="lc-addr">${h.address}</div>
    <div class="lc-meta">${h.district ? h.district + ' · ' : ''}${t().to} ${fmtDate(soonest)}</div>
  </div>`;
}

/* ---------- Search suggest (основной + мини, общая логика) ---------- */
const SEARCHES = [
  { input: document.getElementById('search'), box: document.getElementById('suggest'), clear: document.getElementById('clearSearch') },
  { input: document.getElementById('searchMini'), box: document.getElementById('suggestMini'), clear: document.getElementById('clearSearchMini') },
].filter((s) => s.input);

function setSearchValue(v) { SEARCHES.forEach((s) => { s.input.value = v; if (s.clear) s.clear.classList.toggle('show', !!v); }); }
function closeSuggests() { SEARCHES.forEach((s) => s.box && s.box.classList.remove('show')); }

/* Разбор запроса «Лермонтова 44» → { street: 'лермонтова', house: '44' } */
function parseQuery(raw) {
  let s = (raw || '').trim().toLowerCase();
  s = s.replace(/^(ул|улица|пр|проспект|пер|переулок|мкр|пл)\.?\s+/i, '');
  const m = s.match(/^(.*?)[\s,]+(\d+[а-я]?(?:\/\d+)?)\s*$/i);
  return m ? { street: m[1].trim(), house: m[2] } : { street: s, house: null };
}
/* Нормализация названия улицы для сравнения: «улица Ак.Сатпаева» → «ак сатпаева» */
function normStreet(s) {
  return (s || '').toLowerCase()
    .replace(/^(улица|ул\.?|проспект|пр\.?|переулок|пер\.?|мкр\.?|площадь|пл\.?)\s*/i, '')
    .replace(/[.,]/g, ' ').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}
/* Совпадение улицы: подстрока в любую сторону (Лермонтова ↔ Лермонтов) */
function streetMatches(candidate, query) {
  const a = normStreet(candidate), b = normStreet(query);
  if (!b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  // сравнение по основе слова (без падежного окончания)
  const stem = (x) => x.replace(/(ой|ая|ые|ого|ому|ым|ых|а|о|у|ы|е|и|я)$/i, '');
  const aw = a.split(' ').map(stem), bw = b.split(' ').map(stem);
  return bw.every((w) => w.length > 2 && aw.some((x) => x.startsWith(w) || w.startsWith(x)));
}

/* Адресный справочник города (все дома, не только с отключениями).
   Грузится лениво при первом обращении к поиску — 1 МБ, ~250 КБ в gzip. */
let ADDR = null, addrLoading = null;
function loadAddresses() {
  if (ADDR) return Promise.resolve(ADDR);
  if (!addrLoading) {
    addrLoading = fetch('addresses.json').then((r) => r.ok ? r.json() : {})
      .then((j) => { ADDR = j; return j; }).catch(() => (ADDR = {}));
  }
  return addrLoading;
}
/* Подсказки из справочника: «Павлова 38» → улица Павлова, 38 / 38/1 / 38а */
function addressSuggestions(pq, limit = 8) {
  if (!ADDR) return [];
  const out = [];
  for (const street of Object.keys(ADDR)) {
    if (!streetMatches(street, pq.street)) continue;
    const houses = ADDR[street];
    if (pq.house) {
      // точное совпадение вперёд, затем «начинается с» (38 → 38/1, 38а)
      const exact = houses.filter((h) => String(h[0]).toLowerCase() === pq.house.toLowerCase());
      const partial = houses.filter((h) => {
        const s = String(h[0]).toLowerCase();
        return s !== pq.house.toLowerCase() && s.startsWith(pq.house.toLowerCase());
      });
      [...exact, ...partial].slice(0, limit).forEach(([house, lat, lng]) =>
        out.push({ street, house, lat, lng }));
    } else {
      houses.slice(0, 6).forEach(([house, lat, lng]) => out.push({ street, house, lat, lng }));
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

function buildSuggest(qraw, box) {
  const q = qraw.trim().toLowerCase();
  if (!q) { box.classList.remove('show'); return; }
  const pq = parseQuery(qraw);
  // Поиск по улице/адресу с учётом падежей и номера дома, независимо от фильтров.
  const streetHits = STREETS.filter((s) => streetMatches(s.name, pq.street)).slice(0, 5);
  const houseHits = DATA.houses.filter((h) =>
    h.address.toLowerCase().includes(q) ||
    (streetMatches(h.address, pq.street) && (!pq.house || h.address.includes(pq.house)))
  ).slice(0, 7);
  // Подсказки из общегородского справочника (дома без отключений тоже нужны)
  const known = new Set(houseHits.map((h) => h.address.toLowerCase()));
  const addrHits = addressSuggestions(pq).filter((a) =>
    !known.has(`${a.street}, ${a.house}`.toLowerCase())).slice(0, 6);

  let html = '';
  if (streetHits.length) {
    html += `<div class="sg-head">${t().streets}</div>` + streetHits.map((s) =>
      `<div class="sg" data-kind="street" data-name="${encodeURIComponent(s.name)}">
        <span class="dot" style="background:#1f6feb"></span><span class="tt">${s.name}</span>
        <span class="tag">${s.n} ${t().houses}</span></div>`).join('');
  }
  if (houseHits.length) {
    html += `<div class="sg-head">${t().addresses}</div>` + houseHits.map((h) => {
      const o = cardOutages(h)[0] || h.outages[0];
      return `<div class="sg" data-kind="house" data-id="${h.id}">
        <span class="dot" style="background:${o ? RESOURCES[o.resource].color : '#8a94a3'}"></span>
        <span class="tt">${h.address}</span></div>`;
    }).join('');
  }
  // Адреса города без отключений — показываем как обычные подсказки.
  // Клик → карточка «Отключений нет» (это и есть ответ сервиса).
  if (addrHits.length) {
    html += `<div class="sg-head">${t().addresses}</div>` + addrHits.map((a) => {
      // ⚠️ Не подписывать «отключений нет» вслепую — сначала реально проверяем адрес.
      const near = outagesNear(a.lat, a.lng, `${a.street}, ${a.house}`);
      const outs = [];
      const seen = new Set();
      near.forEach((h) => cardOutages(h).forEach((o) => {
        const k = `${o.resource}|${o.type}|${o.start}|${o.end}`;
        if (!seen.has(k)) { seen.add(k); outs.push(o); }
      }));
      const dot = outs.length ? RESOURCES[outs[0].resource].color : '#cfd6e0';
      const tag = outs.length
        ? `<span class="tag warn">${outs.length} ${systemsWord(outs.length)}</span>`
        : `<span class="tag ok">${t().allOk}</span>`;
      return `<div class="sg" data-kind="addr" data-street="${encodeURIComponent(a.street)}"
            data-house="${encodeURIComponent(a.house)}" data-lat="${a.lat}" data-lng="${a.lng}">
        <span class="dot" style="background:${dot}"></span>
        <span class="tt">${a.street}, ${a.house}</span>${tag}</div>`;
    }).join('');
  }
  // Ничего не нашли в данных об отключениях → предлагаем проверить адрес на карте
  // (геокодирование). Это и есть ответ пользователю: «по этому адресу отключений нет».
  if (!html && qraw.trim().length >= 3) {
    html = `<div class="sg" data-kind="geo" data-q="${encodeURIComponent(qraw.trim())}">
      <span class="dot" style="background:#1f9d55"></span>
      <span class="tt">${t().checkAddress}: <b>${qraw.trim()}</b></span></div>`;
  }
  if (!html) html = `<div class="empty">${t().none}</div>`;
  box.innerHTML = html; box.classList.add('show');
  box.querySelectorAll('.sg').forEach((el) => {
    el.onclick = () => {
      if (el.dataset.kind === 'geo') {
        checkAddress(decodeURIComponent(el.dataset.q));
        closeSuggests();
        if (window.matchMedia('(max-width: 780px)').matches) collapseSheet();
        return;
      }
      if (el.dataset.kind === 'addr') {   // адрес из городского справочника
        const street = decodeURIComponent(el.dataset.street);
        const house = decodeURIComponent(el.dataset.house);
        const lat = +el.dataset.lat, lng = +el.dataset.lng;
        setSearchValue(`${street}, ${house}`);
        state.query = ''; applyFilters();
        map.setView([lat, lng], 17);
        setTimeout(() => openAddressCard({ address: `${street}, ${house}`, district: '', lat, lng },
          outagesNear(lat, lng, `${street}, ${house}`)), 240);
        closeSuggests();
        if (window.matchMedia('(max-width: 780px)').matches) collapseSheet();
        return;
      }
      if (el.dataset.kind === 'street') {
        const name = decodeURIComponent(el.dataset.name);
        const onStreet = DATA.houses.filter((h) => streetName(h.address) === name);
        if (onStreet.length && !onStreet.some((h) => matchingOutages(h).length)) ensureVisible(onStreet[0]);
        setSearchValue(name); state.query = name; applyFilters();
        const pts = onStreet.filter((h) => matchingOutages(h).length).map((h) => [h.lat, h.lng]);
        if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 16 });
      } else {
        const h = DATA.houses.find((x) => x.id === el.dataset.id);
        ensureVisible(h);
        state.query = ''; setSearchValue(h.address); applyFilters();
        map.setView([h.lat, h.lng], 16);
        setTimeout(() => openHouseCard(h, [h.lat, h.lng]), 250);
      }
      closeSuggests();
      if (window.matchMedia('(max-width: 780px)').matches) collapseSheet();
    };
  });
}

/* ---------- Проверка произвольного адреса (геокодинг) ----------
   Отвечает на главный вопрос сервиса даже когда отключений нет:
   «по вашему адресу отключений нет». Работает и для клика по любому дому. */
const geoCache = new Map();
async function geocodeAddress(q) {
  const key = q.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=${LANG}`
    + `&q=${encodeURIComponent(q + ', ' + DATA.city + ', Казахстан')}`;
  let r = null;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': LANG } });
    if (res.ok) { const a = await res.json(); if (a[0]) r = { lat: +a[0].lat, lng: +a[0].lon, name: a[0].display_name }; }
  } catch (e) {}
  geoCache.set(key, r); return r;
}
async function reverseGeocode(lat, lng) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&accept-language=${LANG}&lat=${lat}&lon=${lng}`;
  try {
    const res = await fetch(url, { headers: { 'Accept-Language': LANG } });
    if (!res.ok) return null;
    const a = await res.json(); const ad = a.address || {};
    const street = ad.road || ad.pedestrian || ad.residential || '';
    const house = ad.house_number || '';
    const district = ad.suburb || ad.city_district || ad.neighbourhood || '';
    if (!street) return null;
    return { address: house ? `${street}, ${house}` : street, district };
  } catch (e) { return null; }
}
// Ближайшие известные отключения к точке (в пределах ~250 м)
function outagesNear(lat, lng, address) {
  const near = [];
  DATA.houses.forEach((h) => {
    const sameStreet = address && streetMatches(h.address, streetName(address));
    const d = Math.hypot((h.lat - lat) * 111, (h.lng - lng) * 68); // км
    if (d < 0.25 || sameStreet) near.push({ h, d });
  });
  return near.sort((a, b) => a.d - b.d).slice(0, 3).map((x) => x.h);
}
async function checkAddress(q) {
  showToast(t().searching);
  const g = await geocodeAddress(q);
  hideToast();
  if (!g) { showToast(t().addrNotFound, 2500); return; }
  map.setView([g.lat, g.lng], 16);
  const near = outagesNear(g.lat, g.lng, q);
  setTimeout(() => openAddressCard({ address: q, district: '', lat: g.lat, lng: g.lng }, near), 260);
}
// Клик по любому месту карты → определяем дом и показываем карточку
async function checkPoint(lat, lng) {
  showToast(t().searching);
  const info = await reverseGeocode(lat, lng);
  hideToast();
  if (!info) { showToast(t().addrNotFound, 2200); return; }
  const near = outagesNear(lat, lng, info.address);
  openAddressCard({ address: info.address, district: info.district, lat, lng }, near);
}
/* Карточка произвольного адреса: либо найденные отключения, либо «отключений нет» */
function openAddressCard(pt, nearHouses) {
  // ⚠️ Соседние дома часто несут ОДНО И ТО ЖЕ отключение (одна улица — один наряд).
  // Без дедупликации карточка показывала «6 систем» из трёх копий одной записи.
  const outs = [];
  const seen = new Set();
  nearHouses.forEach((h) => cardOutages(h).forEach((o) => {
    const key = `${o.resource}|${o.type}|${o.start}|${o.end}`;
    if (seen.has(key)) return;
    seen.add(key);
    outs.push({ o, h });
  }));
  let inner;
  if (outs.length) {
    inner = outs.map(({ o, h }) => {
      const R = RESOURCES[o.resource]; const rs = relStatus(o);
      return `<div class="hc-row">
        <span class="ic" style="background:${R.color}22;color:${R.color}">${R.icon}</span>
        <div class="hc-main">
          <div class="hc-r1"><b>${rName(o.resource)}</b>
            <span class="badge ${o.type}">${o.type === 'emergency' ? t().emergency : t().planned}</span></div>
          <div class="hc-when"><span class="st ${rs.cls}"></span>${t().to} <b>${fmtDate(o.end)}</b></div>
          <div class="hc-period">${t().from}: ${fmtDate(o.start)}</div>
          ${h.address !== pt.address ? `<div class="hc-period">${t().nearby}: ${h.address}</div>` : ''}
          ${o.reason ? `<div class="hc-reason">${o.reason}</div>` : ''}
        </div></div>`;
    }).join('');
  } else {
    inner = `<div class="hc-ok">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg>
      <div><b>${t().allOk}</b><span>${t().allOkSub}</span></div></div>`;
  }
  const html = `<div class="house-card">
    <div class="hc-head">
      <div class="hc-addr">${pt.address}</div>
      ${pt.district ? `<div class="hc-district">${pt.district}</div>` : ''}
    </div>
    ${outs.length ? `<div class="hc-sum"><span class="hc-off">${t().whatsOff}: ${outs.length} ${systemsWord(outs.length)}</span></div>` : ''}
    <div class="hc-list">${inner}</div>
  </div>`;
  L.popup({ maxWidth: 330, minWidth: 290, className: 'house-popup', autoPanPadding: [24, 90] })
    .setLatLng([pt.lat, pt.lng]).setContent(html).openOn(map);
  if (window.matchMedia('(max-width: 780px)').matches) collapseSheet();
}
/* Мини-тост */
let toastEl = null, toastTimer = null;
function showToast(msg, ms) {
  if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast'; document.body.appendChild(toastEl); }
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(hideToast, ms);
}
function hideToast() { if (toastEl) toastEl.classList.remove('show'); }

function submitSearch(box) {
  const q = SEARCHES[0].input.value.trim() || (SEARCHES[1] && SEARCHES[1].input.value.trim()) || '';
  if (!q) return;
  const pq = parseQuery(q);
  const match = DATA.houses.filter((h) =>
    h.address.toLowerCase().includes(q.toLowerCase()) || streetMatches(h.address, pq.street));
  closeSuggests();
  if (!match.length) { checkAddress(q); return; }   // нет в данных → проверяем адрес геокодером
  if (!match.some((h) => matchingOutages(h).length)) ensureVisible(match[0]);
  state.query = q; applyFilters();
  const pts = match.filter((h) => matchingOutages(h).length).map((h) => [h.lat, h.lng]);
  if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.3), { maxZoom: 16 });
}

SEARCHES.forEach(({ input, box, clear }) => {
  // справочник адресов подгружаем при первом касании поиска, затем обновляем подсказки
  const ensureAddr = () => loadAddresses().then(() => { if (input.value.trim()) buildSuggest(input.value, box); });
  input.addEventListener('input', (e) => { setSearchValue(e.target.value); buildSuggest(e.target.value, box); ensureAddr(); });
  input.addEventListener('focus', () => { ensureAddr(); buildSuggest(input.value, box); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitSearch(box); });
  if (clear) clear.onclick = () => { setSearchValue(''); state.query = ''; closeSuggests(); applyFilters(); if (DATA.center) map.setView(DATA.center, 12); };
});
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) closeSuggests(); });

/* ---------- Filters (пиктограммы ресурсов) ---------- */
function buildFilters() {
  document.querySelectorAll('[data-resource-chips]').forEach((h) => {
    h.innerHTML = Object.entries(RESOURCES).map(([k, v]) => {
      const on = state.resources.has(k);
      return `<div class="rchip ${on ? 'on' : 'off'}" data-res="${k}" title="${v[LANG] || v.ru}" style="${on ? `background:${v.color}` : ''}">
        <span class="ic" style="${on ? '' : `color:${v.color}`}">${v.icon}</span>${v[LANG] || v.ru}</div>`;
    }).join('');
    h.querySelectorAll('.rchip').forEach((c) => c.onclick = () => {
      const k = c.dataset.res;
      if (state.resources.has(k)) state.resources.delete(k); else state.resources.add(k);
      if (!state.resources.size) state.resources.add(k);
      buildFilters(); applyFilters();
    });
  });
  document.querySelectorAll('[data-type-seg] button').forEach((b) => { b.classList.toggle('on', b.dataset.type === state.type); b.onclick = () => { state.type = b.dataset.type; buildFilters(); applyFilters(); }; });
  document.querySelectorAll('[data-time-seg] button').forEach((b) => { b.classList.toggle('on', b.dataset.time === state.time); b.onclick = () => { state.time = b.dataset.time; buildFilters(); applyFilters(); }; });
}

// Раскрытие «Все фильтры» (тип/время) — по умолчанию свёрнуто, чтобы дать место списку.
document.querySelectorAll('[data-filters-toggle]').forEach((btn) => {
  btn.onclick = () => btn.closest('.filterbar').classList.toggle('open');
});
// Поповер с источником данных
const infoBtn = document.getElementById('infoBtn');
const sourcePop = document.getElementById('sourcePop');
if (infoBtn && sourcePop) {
  infoBtn.onclick = (e) => { e.stopPropagation(); sourcePop.classList.toggle('open'); infoBtn.classList.toggle('on'); };
  document.addEventListener('click', (e) => { if (!e.target.closest('.head')) { sourcePop.classList.remove('open'); infoBtn.classList.remove('on'); } });
}

/* ---------- Apply / lang ---------- */
function applyFilters() { renderMarkers(); renderList(); }
/* ⚠️ 2800+ домов: перерисовка на каждый moveend делает панорамирование рваным.
   Перерисовываем с задержкой и только когда вид реально изменился (зум или
   заметный сдвиг центра). Во время перетаскивания не трогаем слой вообще. */
let lastView = null, renderTimer = null;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    const z = map.getZoom(), c = map.getCenter();
    if (lastView && lastView.z === z) {
      const moved = Math.abs(lastView.lat - c.lat) + Math.abs(lastView.lng - c.lng);
      if (moved < 0.004) return;            // мелкий сдвиг — маркеры уже покрывают экран
    }
    lastView = { z, lat: c.lat, lng: c.lng };
    renderMarkers();
  }, 160);
}
map.on('zoomend moveend', scheduleRender);

function applyLang() {
  document.querySelectorAll('[data-lang-btn]').forEach((b) => b.classList.toggle('on', b.dataset.langBtn === LANG));
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t()[el.dataset.t]; });
  document.querySelectorAll('[data-title]').forEach((el) => el.textContent = t().title(DATA.city));
  SEARCHES.forEach((s) => s.input.placeholder = t().search);
  document.querySelectorAll('.seg [data-type]').forEach((b) => b.textContent = t()[b.dataset.type]);
  document.querySelectorAll('.seg [data-time]').forEach((b) => b.textContent = t()[b.dataset.time]);
  document.querySelectorAll('[data-filters-btn]').forEach((b) => b.lastChild.textContent = ' ' + t().filtersBtn);
  document.querySelectorAll('.ft-label').forEach((el) => el.textContent = t().allFilters);
  document.querySelectorAll('[data-source]').forEach((el) => el.textContent = `${t().source}: ${DATA.source}`);
  document.querySelectorAll('[data-ad-label]').forEach((el) => el.textContent = t().adLabel);
  document.querySelectorAll('[data-ad-text]').forEach((el) => el.textContent = t().adText);
  document.querySelectorAll('[data-ad-cta]').forEach((el) => el.textContent = t().adCta);
  buildFilters(); applyFilters();
}
document.querySelectorAll('[data-lang-btn]').forEach((b) => b.onclick = () => {
  LANG = b.dataset.langBtn; localStorage.setItem('barjoq_lang', LANG);
  geoCache.clear();          // подписи геокодера тоже зависят от языка
  setTiles(LANG);            // подложка (при наличии TILE_KEY переключит язык подписей)
  applyLang();
});

/* ---------- Mobile sheet ---------- */
const sheet = document.getElementById('sheet');
const fab = document.getElementById('fab');
/* Три состояния шторки: свёрнута (по умолчанию — акцент на карте) / половина / развёрнута */
function expandSheet() { sheet.classList.add('expanded'); sheet.classList.remove('collapsed', 'half'); }
function halfSheet() { sheet.classList.add('half'); sheet.classList.remove('expanded', 'collapsed'); }
function collapseSheet() { sheet.classList.add('collapsed'); sheet.classList.remove('expanded', 'half'); }
function fullCollapse() { collapseSheet(); }
if (sheet) {
  const grip = sheet.querySelector('.grip');
  let startY = 0, startH = 0, dragging = false;
  const down = (y) => { dragging = true; startY = y; startH = sheet.getBoundingClientRect().height; sheet.style.transition = 'none'; };
  const move = (y) => { if (!dragging) return; let h = startH + (startY - y); h = Math.max(innerHeight * 0.11, Math.min(innerHeight * 0.88, h)); sheet.style.height = h + 'px'; };
  const up = () => { if (!dragging) return; dragging = false; sheet.style.transition = ''; const r = sheet.getBoundingClientRect().height / innerHeight; sheet.style.height = ''; if (r > 0.62) expandSheet(); else if (r < 0.22) collapseSheet(); else halfSheet(); };
  grip.addEventListener('touchstart', (e) => down(e.touches[0].clientY), { passive: true });
  grip.addEventListener('touchmove', (e) => move(e.touches[0].clientY), { passive: true });
  grip.addEventListener('touchend', up);
  grip.addEventListener('mousedown', (e) => down(e.clientY));
  addEventListener('mousemove', (e) => move(e.clientY));
  addEventListener('mouseup', up);
  // тап по «ручке»: свёрнута → половина → развёрнута → свёрнута
  grip.addEventListener('click', () => {
    if (sheet.classList.contains('expanded')) collapseSheet();
    else if (sheet.classList.contains('half')) expandSheet();
    else halfSheet();
  });
  const fb = sheet.querySelector('[data-filters-btn]');
  if (fb) fb.onclick = () => { sheet.classList.toggle('filters-open'); halfSheet(); };
  // старт: свёрнута, карта на первом плане
  collapseSheet();
}
if (fab) fab.onclick = () => map.setView(DATA.center, 12);

/* ---------- Size fix ---------- */
const mapEl = document.getElementById('map');
function fixSize() { map.invalidateSize(false); }
if ('ResizeObserver' in window) new ResizeObserver(fixSize).observe(mapEl);
addEventListener('load', fixSize); addEventListener('resize', fixSize);

/* ---------- Go ---------- */
load();
})();
