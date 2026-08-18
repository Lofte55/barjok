/* Бар Жоқ — карта отключений (house-centric) */
(function () {
const { RESOURCES, FALLBACK } = window.BARJOQ;

/* Экранирование пользовательского текста (сообщения жителей, адреса) перед вставкой в innerHTML.
   Защита от XSS: даже одобренная модератором строка не должна исполнять HTML. */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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
    // ⚠️ Когда точного адреса НЕТ в данных, а рядом на улице есть отключения — писать
    // «по адресу» нельзя (это чужие дома). Формулируем честно.
    nearbyOnly: 'Рядом на этой улице', notListed: 'По этому адресу отключение не заявлено',
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
    nearbyOnly: 'Осы көшеде жақын жерде', notListed: 'Бұл мекенжай бойынша ажырату жарияланбаған',
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
  type: 'all', time: 'all', query: '',
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
  // ⚠️ Убираем коммерческий POI-шум (магазины, аптеки, кафе, банки, АЗС, бренды) —
  // на карте отключений он мешает. Оставляем школы/вузы/больницы/парки/транзит и т.п.
  // POI в liberty лежат в слоях poi_r1/r7/r20 (source-layer 'poi'), фильтруются по rank;
  // добавляем условие «class НЕ в чёрном списке коммерции».
  const HIDE_POI = [
    'shop', 'grocery', 'convenience', 'supermarket', 'department_store', 'marketplace',
    'clothing_store', 'shoes', 'jewelry', 'furniture', 'hardware', 'gift', 'toys', 'pet',
    'books', 'stationery', 'florist', 'mobile_phone', 'beauty', 'hairdresser', 'optician',
    'laundry', 'pharmacy', 'chemist', 'fast_food', 'restaurant', 'cafe', 'bar', 'beer',
    'pub', 'ice_cream', 'bakery', 'butcher', 'alcohol_shop', 'beverages', 'deli', 'bank',
    'car', 'fuel', 'lodging', 'veterinary', 'sports', 'photo', 'travel_agency',
  ];
  (s.layers || []).forEach((l) => {
    if ((l['source-layer'] || '') !== 'poi' || l.id === 'poi_transit') return;
    const keep = ['!', ['in', ['get', 'class'], ['literal', HIDE_POI]]];
    l.filter = l.filter ? ['all', l.filter, keep] : keep;
  });

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
  // Мобилка: если шторка раскрыта (half/expanded) — первый тап по карте её СВОРАЧИВАЕТ
  // в дефолт (нативный паттерн), карточку адреса при этом не открываем.
  if (window.matchMedia('(max-width: 900px)').matches && sheet && !sheet.classList.contains('collapsed')) {
    collapseSheet();
    return;
  }
  checkPoint(+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6));
});
const markerLayer = L.layerGroup().addTo(map);

/* ---------- Load data ---------- */
async function load() {
  let d;
  try {
    const res = await fetch('/map/data.json', { cache: 'no-store' });
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
    // Начальный вид фитим по ГОРОДУ, а не по всем точкам: адреса ЗПЭС/ВПЭС бывают
    // в сёлах за 20+ км — если включить их в bounds, карта открывается на весь регион.
    // Сёла остаются на карте (видно при отдалении), но стартовый вид держим на городе.
    const cityPts = pts.filter(([la, lo]) => Math.abs(la - DATA.center[0]) < 0.12 && Math.abs(lo - DATA.center[1]) < 0.18);
    const b = L.latLngBounds(cityPts.length ? cityPts : pts).pad(0.05);
    // ⚠️ fitBounds выполняем ТОЛЬКО пока пользователь не начал двигать карту,
    // иначе поздние таймеры «откатывают» вид назад во время панорамирования.
    let userMoved = false;
    const stop = () => { userMoved = true; };
    map.once('dragstart zoomstart', stop);
    const doFit = () => {
      if (userMoved) return;
      map.invalidateSize(false);
      map.fitBounds(b, { animate: false, maxZoom: 14 });
      // «чуть приблизить» стартовый вид (десктоп+мобилка): на шаг плотнее fit,
      // но не глубже 14 — центр города крупнее, дальние точки видны при отдалении.
      map.setZoom(Math.min(map.getZoom() + 1, 14));
      window.dispatchEvent(new Event('resize')); // догрузка тайлов на первой отрисовке
    };
    doFit();
    requestAnimationFrame(doFit);
    [120, 400, 900].forEach((ms) => setTimeout(doFit, ms));
  } else { fixSize(); }

  // Проброс адреса с лендинга: /map/?q=Лермонтова+44 → сразу ищем и показываем карточку.
  const q0 = new URLSearchParams(location.search).get('q');
  if (q0 && q0.trim()) {
    const v = q0.trim();
    setSearchValue(v);
    setTimeout(() => submitSearch(SEARCHES[0]), 300);
  }
}

// «проспект Димитрова, 19» → «проспект Димитрова»
function streetName(addr) { return (addr || '').replace(/,\s*[^,]*$/, '').trim(); }

/* ---------- Filtering ---------- */
function passOutage(o) {
  if (!state.resources.has(o.resource)) return false;
  if (state.type !== 'all' && o.type !== state.type) return false;
  if (state.time !== 'all' && o.status !== state.time) return false;
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
// Для КАРТОЧКИ: один ряд на ресурс. У дома бывает несколько нарядов одного ресурса
// (разные ТП/фидеры, разные даты) — на экране это читается как дубли и завышает «N систем».
// Оставляем самый релевантный: current важнее future, при равенстве — ближайший по концу.
function collapseByResource(outs) {
  const best = new Map();
  outs.forEach((o) => {
    const cur = best.get(o.resource);
    const better = !cur
      || (o.status === 'current' && cur.status !== 'current')
      || (o.status === cur.status && new Date(o.end) < new Date(cur.end));
    if (better) best.set(o.resource, o);
  });
  const order = { current: 0, future: 1, past: 2 };
  return [...best.values()].sort((a, b) => order[a.status] - order[b.status]);
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
  const q = state.query.trim();
  if (!q) return true;
  // ⚠️ Не просто includes: «Баян батыра 6» не входит подстрокой в «улица Баян батыра»
  // (нет номера у streetWide-узла + запятая в адресе). Матчим по улице.
  if (h.address.toLowerCase().includes(q.toLowerCase())) return true;
  return streetMatches(h.address, parseQuery(q).street);
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
  // Сообщение жителя (весь дом — только citizen-наряды) рисуем ОТДЕЛЬНЫМ стилем:
  // белый пин с пунктирной рамкой цвета ресурса + уголковая метка «житель».
  const citizen = outs.every((o) => o.citizen);
  const icon = RESOURCES[outs[0].resource].icon;
  const distinct = new Set(outs.map((o) => o.resource)).size;
  const badge = distinct > 1 ? `<span class="pin-badge">${distinct}</span>` : '';
  if (citizen) {
    return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      html: `<div class="pin pin-citizen" style="width:${size}px;height:${size}px;color:${color};border-color:${color};font-size:${size * 0.5}px;">${icon}${badge}<span class="pin-cz" aria-hidden="true"></span></div>` });
  }
  const ring = emerg ? 'box-shadow:0 0 0 4px rgba(217,67,58,.30),0 2px 8px rgba(0,0,0,.28);' : '';
  return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div class="pin" style="width:${size}px;height:${size}px;background:${color};font-size:${size * 0.5}px;${ring}">${icon}${badge}</div>` });
}
function clusterIcon(count, emerg) {
  const size = count > 80 ? 52 : count > 25 ? 44 : 36;
  const color = emerg ? '#c0392b' : '#1f6feb';
  return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div class="cluster" style="width:${size}px;height:${size}px;background:${color};font-size:${count>99?12:14}px">${count}</div>` });
}

function renderMarkers() {
  markerLayer.clearLayers();
  const z = map.getZoom();
  // ⚠️ Отсекаем по вьюпорту: без этого на мобилке рисовались все 3000+ пинов сразу
  // (сильный лаг). Рендерим только то, что в кадре (+запас); при панораме
  // scheduleRender перерисует новый участок.
  const vb = map.getBounds().pad(0.3);
  const houses = visibleHouses().filter((h) => vb.contains([h.lat, h.lng]));
  const individual = z >= 15 || !!state.query.trim();

  // ⚠️ Линии улиц НЕ рисуем — только пиктограммы на домах (у каждого дома есть lat/lng).
  // Раньше для streetWide-домов рисовалась линия геометрии улицы — она путала карту
  // («где-то осталась линия»). Теперь везде точечные пины.

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
  if (window.matchMedia('(max-width: 900px)').matches) collapseSheet();
}
function houseCardHtml(h) {
  const outs = collapseByResource(cardOutages(h));
  const rows = outs.map((o) => {
    const R = RESOURCES[o.resource]; const rs = relStatus(o);
    return `<div class="hc-row">
      <span class="ic" style="background:${R.color};color:#fff">${R.icon}</span>
      <div class="hc-main">
        <div class="hc-r1"><b>${rName(o.resource)}</b>
          <span class="badge ${o.citizen ? 'citizen' : o.type}">${o.citizen ? 'Сообщение жителя' : (o.type === 'emergency' ? t().emergency : t().planned)}</span></div>
        <div class="hc-when"><span class="st ${rs.cls}"></span>${t().to} <b>${fmtDate(o.end)}</b></div>
        <div class="hc-period">${t().from}: ${fmtDate(o.start)}</div>
        ${o.reason ? `<div class="hc-reason">${esc(o.reason)}</div>` : ''}
      </div>
    </div>`;
  }).join('');
  return `<div class="house-card">
    <div class="hc-head">
      <div class="hc-addr">${esc(h.address)}</div>
      ${h.district ? `<div class="hc-district">${esc(h.district)}</div>` : ''}
    </div>
    <div class="hc-sum"><span class="hc-off">${t().whatsOff}: ${outs.length} ${systemsWord(outs.length)}</span></div>
    <div class="hc-list">${rows}</div>
    <button class="hc-report" type="button" data-report-addr="${encodeURIComponent(h.address)}">Сообщить о проблеме</button>
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
    return `<span class="rc" style="background:${R.color};color:#fff" title="${rName(o.resource)}">${R.icon}</span>`;
  }).join('');
  const soonest = outs.map((o) => o.end).filter(Boolean).sort()[0];
  const emerg = outs.some((o) => o.type === 'emergency');
  return `<div class="lcard" data-id="${h.id}">
    <div class="lc-top">
      <div class="lc-chips">${chips}${outs.length > 4 ? `<span class="rc more">+${outs.length - 4}</span>` : ''}</div>
      ${emerg ? `<span class="badge emergency">${t().emergency}</span>` : ''}
    </div>
    <div class="lc-addr">${esc(h.address)}</div>
    <div class="lc-meta">${h.district ? esc(h.district) + ' · ' : ''}${t().to} ${fmtDate(soonest)}</div>
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
/* Язык названия улицы: OSM/наши источники хранят одну и ту же улицу ДВУМЯ отдельными
   строками — «улица Естая» (RU) и «Естай көшесі» (KK) — как разные ключи в addresses.json
   и разные адреса домов. Раньше подсказки показывали ОБА варианта вперемешку одновременно —
   путало пользователя. Признак: суффикс-тип (көшесі/даңғылы/…) или казахские буквы. */
function streetLangOf(name) {
  if (/(көшесі|даңғылы|алаңы|тұйығы|шағын|ауданы)\b/i.test(name)) return 'kk';
  if (/[әіңғұүқөһ]/i.test(name)) return 'kk';
  return 'ru';
}
/* Фильтрует список под текущий LANG, но не даёт результату опустеть: если для этой
   улицы существует ТОЛЬКО другой языковой вариант (нет RU-названия и наоборот) —
   лучше показать что есть, чем скрыть адрес целиком. */
function preferLang(items, nameOf) {
  const matched = items.filter((x) => streetLangOf(nameOf(x)) === LANG);
  return matched.length ? matched : items;
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
  if (a === b) return true;
  // Подстрочный матч — только для достаточно длинных названий, иначе «б» (Проезд Б)
  // ложно совпадает с «баян батыра» и т.п.
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) return true;
  // сравнение по основе слова (без падежного окончания); короткие токены (<3) игнорируем,
  // чтобы одиночная буква улицы не матчила любое слово с этой буквы.
  const stem = (x) => x.replace(/(ой|ая|ые|ого|ому|ым|ых|а|о|у|ы|е|и|я)$/i, '');
  const aw = a.split(' ').map(stem).filter((w) => w.length >= 3);
  const bw = b.split(' ').map(stem).filter((w) => w.length >= 3);
  if (!aw.length || !bw.length) return false;
  return bw.every((w) => aw.some((x) => x.startsWith(w) || w.startsWith(x)));
}

/* Адресный справочник города (все дома, не только с отключениями).
   Грузится лениво при первом обращении к поиску — 1 МБ, ~250 КБ в gzip. */
let ADDR = null, addrLoading = null;
function loadAddresses() {
  if (ADDR) return Promise.resolve(ADDR);
  if (!addrLoading) {
    addrLoading = fetch('/map/addresses.json').then((r) => r.ok ? r.json() : {})
      .then((j) => { ADDR = j; return j; }).catch(() => (ADDR = {}));
  }
  return addrLoading;
}
/* Подсказки из справочника: «Павлова 38» → улица Павлова, 38 / 38/1 / 38а.
   ⚠️ Собираем кандидатов БЕЗ раннего обрыва по limit — та же улица хранится в реестре
   ДВУМЯ ключами (RU «улица Естая» и KK «Естай көшесі»), нужно набрать оба варианта
   ПЕРЕД тем как отфильтровать по текущему языку (preferLang), иначе ранний break мог
   бы отсечь нужный язык раньше, чем список до него дойдёт. */
function addressSuggestions(pq, limit = 8) {
  if (!ADDR) return [];
  const out = [];
  const CEILING = limit * 6;   // с запасом на оба языковых варианта
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
    if (out.length >= CEILING) break;
  }
  return preferLang(out, (a) => a.street).slice(0, limit);
}

function buildSuggest(qraw, box) {
  const q = qraw.trim().toLowerCase();
  if (!q) { box.classList.remove('show'); return; }
  const pq = parseQuery(qraw);
  // Автопереключение: дом ещё не указан → предлагаем УЛИЦЫ; как только введён номер
  // дома → предлагаем КОНКРЕТНЫЕ АДРЕСА (единым списком, без деления на подгруппы).
  const streetHits = pq.house ? [] : preferLang(STREETS.filter((s) => streetMatches(s.name, pq.street)), (s) => s.name).slice(0, 8);

  let html = '';
  if (streetHits.length) {
    html += `<div class="sg-head">${t().streets}</div>` + streetHits.map((s) =>
      `<div class="sg" data-kind="street" data-name="${encodeURIComponent(s.name)}">
        <span class="dot" style="background:#1f6feb"></span><span class="tt">${s.name}</span>
        <span class="tag">${s.n} ${t().houses}</span></div>`).join('');
  }

  if (pq.house) {
    // Дома с известными отключениями (DATA.houses) + остальные дома улицы из общего
    // справочника — ОДИН объединённый список, без текстовых пометок «N систем»/«ок»:
    // статус читается по цвету точки, как и у остальных элементов поиска.
    const houseHits = preferLang(DATA.houses.filter((h) =>
      h.address.toLowerCase().includes(q) ||
      (streetMatches(h.address, pq.street) && h.address.includes(pq.house))
    ), (h) => h.address).slice(0, 8);
    const known = new Set(houseHits.map((h) => h.address.toLowerCase()));
    const addrHits = addressSuggestions(pq, 10).filter((a) =>
      !known.has(`${a.street}, ${a.house}`.toLowerCase()));

    const rows = [];
    houseHits.forEach((h) => {
      const o = cardOutages(h)[0] || h.outages[0];
      rows.push({ kind: 'house', id: h.id, label: h.address, dot: o ? RESOURCES[o.resource].color : '#8a94a3' });
    });
    addrHits.forEach((a) => {
      // ⚠️ Не подписывать «отключений нет» вслепую — сначала реально проверяем адрес.
      const near = outagesNear(a.lat, a.lng, `${a.street}, ${a.house}`);
      const hasOut = near.some((h) => cardOutages(h).length);
      rows.push({ kind: 'addr', street: a.street, house: a.house, lat: a.lat, lng: a.lng,
        label: `${a.street}, ${a.house}`, dot: hasOut ? '#e8663d' : '#cfd6e0' });
    });

    if (rows.length) {
      html += `<div class="sg-head">${t().addresses}</div>` + rows.slice(0, 10).map((r) => {
        const attrs = r.kind === 'house'
          ? `data-kind="house" data-id="${r.id}"`
          : `data-kind="addr" data-street="${encodeURIComponent(r.street)}" data-house="${encodeURIComponent(r.house)}" data-lat="${r.lat}" data-lng="${r.lng}"`;
        return `<div class="sg" ${attrs}><span class="dot" style="background:${r.dot}"></span><span class="tt">${r.label}</span></div>`;
      }).join('');
    }
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
        if (window.matchMedia('(max-width: 900px)').matches) collapseSheet();
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
        if (window.matchMedia('(max-width: 900px)').matches) collapseSheet();
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
      if (window.matchMedia('(max-width: 900px)').matches) collapseSheet();
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
/* Номер дома из адреса: «улица Айманова, 47/1» → «47/1» */
function houseNumOf(addr) {
  const m = String(addr || '').match(/,\s*([^,]+)$/);
  return m ? m[1].trim().toLowerCase().replace(/\s+/g, '').replace(/ё/g, 'е') : '';
}
/* Один и тот же дом? Улица сравнивается с учётом RU/KZ-вариантов, номер — точно.
   Нужно, чтобы не выдавать наряд СОСЕДА за отключение «по вашему адресу». */
function sameAddress(a, b) {
  const na = houseNumOf(a), nb = houseNumOf(b);
  if (!na || !nb || na !== nb) return false;
  return streetMatches(a, streetName(b));
}

function outagesNear(lat, lng, address) {
  // ⚠️ Показываем ТОЛЬКО то, что реально касается адреса: точное совпадение адреса
  // или отключение на ТОЙ ЖЕ улице в разумном радиусе. Раньше был ещё чисто
  // дистанционный захват (d < 120 м) без учёта улицы — из-за него для «Лермонтова, 44»
  // показывалось электричество с «Астана, 55» (соседняя улица, другой дом). Убрали:
  // электричество/наряд с чужой улицы к дому не относится и в карточку не попадает.
  const near = [];
  DATA.houses.forEach((h) => {
    const d = Math.hypot((h.lat - lat) * 111, (h.lng - lng) * 68); // км
    const exact = address && h.address.toLowerCase() === String(address).toLowerCase();
    const sameStreet = address && streetMatches(h.address, streetName(address));
    if (exact || (sameStreet && d < 0.35)) near.push({ h, d, exact });
  });
  // точное совпадение адреса всегда первым
  near.sort((a, b) => (a.exact === b.exact ? a.d - b.d : a.exact ? -1 : 1));
  return near.slice(0, 3).map((x) => x.h);
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
  // один ряд на ресурс (несколько нарядов одного ресурса на соседних домах = не дубли на экране)
  const byRes = new Map();
  nearHouses.forEach((h) => cardOutages(h).forEach((o) => {
    const cur = byRes.get(o.resource);
    const better = !cur
      || (o.status === 'current' && cur.o.status !== 'current')
      || (o.status === cur.o.status && new Date(o.end) < new Date(cur.o.end));
    if (better) byRes.set(o.resource, { o, h });
  }));
  const statusOrder = { current: 0, future: 1, past: 2 };
  const outs = [...byRes.values()].sort((a, b) => statusOrder[a.o.status] - statusOrder[b.o.status]);
  // Есть ли отключение именно ПО ЭТОМУ адресу (а не у соседей на той же улице)?
  // От этого зависит формулировка: «что отключено по адресу» vs «рядом на этой улице».
  const hasExact = outs.some(({ h }) => sameAddress(h.address, pt.address));
  let inner;
  if (outs.length) {
    inner = outs.map(({ o, h }) => {
      const R = RESOURCES[o.resource]; const rs = relStatus(o);
      return `<div class="hc-row">
        <span class="ic" style="background:${R.color};color:#fff">${R.icon}</span>
        <div class="hc-main">
          <div class="hc-r1"><b>${rName(o.resource)}</b>
            <span class="badge ${o.citizen ? 'citizen' : o.type}">${o.citizen ? 'Сообщение жителя' : (o.type === 'emergency' ? t().emergency : t().planned)}</span></div>
          <div class="hc-when"><span class="st ${rs.cls}"></span>${t().to} <b>${fmtDate(o.end)}</b></div>
          <div class="hc-period">${t().from}: ${fmtDate(o.start)}</div>
          ${!sameAddress(h.address, pt.address) ? `<div class="hc-period">${t().nearby}: ${esc(h.address)}</div>` : ''}
          ${o.reason ? `<div class="hc-reason">${esc(o.reason)}</div>` : ''}
        </div></div>`;
    }).join('');
  } else {
    inner = `<div class="hc-ok">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg>
      <div><b>${t().allOk}</b><span>${t().allOkSub}</span></div></div>`;
  }
  const html = `<div class="house-card">
    <div class="hc-head">
      <div class="hc-addr">${esc(pt.address)}</div>
      ${pt.district ? `<div class="hc-district">${esc(pt.district)}</div>` : ''}
    </div>
    ${outs.length ? `<div class="hc-sum">${hasExact
      ? `<span class="hc-off">${t().whatsOff}: ${outs.length} ${systemsWord(outs.length)}</span>`
      : `<span class="hc-off nearby">${t().nearbyOnly}: ${outs.length} ${systemsWord(outs.length)}</span>
         <span class="hc-note">${t().notListed}</span>`}</div>` : ''}
    <div class="hc-list">${inner}</div>
    <button class="hc-report" type="button" data-report-addr="${encodeURIComponent(pt.address)}">Сообщить о проблеме</button>
  </div>`;
  L.popup({ maxWidth: 330, minWidth: 290, className: 'house-popup', autoPanPadding: [24, 90] })
    .setLatLng([pt.lat, pt.lng]).setContent(html).openOn(map);
  if (window.matchMedia('(max-width: 900px)').matches) collapseSheet();
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
  closeSuggests();

  // ⚠️ Если введён НОМЕР ДОМА — Enter должен открыть КАРТОЧКУ ЭТОГО ДОМА, а не «подсветить улицу».
  // Раньше номер игнорировался (матч только по улице), и пользователь видел всю улицу —
  // воспринималось как «поиск не находит дом».
  if (pq.house) {
    const exactHouse = DATA.houses.find((h) => sameAddress(h.address, `${pq.street}, ${pq.house}`));
    if (exactHouse) {                                   // дом есть в данных об отключениях
      setSearchValue(exactHouse.address);
      state.query = ''; applyFilters();
      ensureVisible(exactHouse);
      map.setView([exactHouse.lat, exactHouse.lng], 17);
      setTimeout(() => openHouseCard(exactHouse, [exactHouse.lat, exactHouse.lng]), 240);
      return;
    }
    const a = addressSuggestions(pq, 1)[0];             // дом есть в общегородском справочнике
    if (a) {
      const address = `${a.street}, ${a.house}`;
      setSearchValue(address);
      state.query = ''; applyFilters();
      map.setView([a.lat, a.lng], 17);
      setTimeout(() => openAddressCard({ address, district: '', lat: a.lat, lng: a.lng },
        outagesNear(a.lat, a.lng, address)), 240);
      return;
    }
  }

  const match = DATA.houses.filter((h) =>
    h.address.toLowerCase().includes(q.toLowerCase()) || streetMatches(h.address, pq.street));
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
  document.documentElement.lang = LANG;   // KK → Inter, RU → Manrope (шрифт переключается в CSS по <html lang>)
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

/* ---------- Выбор города ----------
   Пока один город (Павлодар). URL /map/ и /map/pavlodar ведут на одну карту.
   Когда появятся другие города, /map/<city> будет грузить данные конкретного города. */
const mapCity = document.getElementById('mapCity');
const mapCityBtn = document.getElementById('mapCityBtn');
if (mapCityBtn) {
  mapCityBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    mapCity.dataset.open = mapCity.dataset.open === '1' ? '0' : '1';
  });
  document.addEventListener('click', () => { mapCity.dataset.open = '0'; });
}

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
  const shead = sheet.querySelector('.shead');
  const handles = [grip, shead];
  const vh = () => innerHeight;
  // снап-высоты (px): свёрнута / половина / развёрнута — совпадают с CSS
  const snaps = () => [vh() * 0.13, vh() * 0.46, vh() * 0.88];
  const MIN = () => vh() * 0.11, MAX = () => vh() * 0.9;

  let startY = 0, startH = 0, dragging = false, moved = 0, lastY = 0, lastT = 0, vel = 0;

  const applyState = (cls) => { sheet.classList.remove('collapsed', 'half', 'expanded'); sheet.classList.add(cls); };
  const cycle = () => {
    if (sheet.classList.contains('collapsed')) applyState('half');
    else if (sheet.classList.contains('half')) applyState('expanded');
    else applyState('collapsed');
  };

  const down = (y) => {
    dragging = true; moved = 0; startY = y; lastY = y; lastT = Date.now(); vel = 0;
    startH = sheet.getBoundingClientRect().height;
    sheet.classList.add('dragging');
  };
  const move = (y) => {
    if (!dragging) return;
    const dy = startY - y;                       // вверх → выше
    moved = Math.max(moved, Math.abs(dy));
    let h = startH + dy;
    // «резинка» за пределами — сопротивление 0.4
    if (h > MAX()) h = MAX() + (h - MAX()) * 0.4;
    else if (h < MIN()) h = MIN() - (MIN() - h) * 0.4;
    sheet.style.height = h + 'px';
    const now = Date.now();
    vel = (lastY - y) / Math.max(1, now - lastT); // px/мс, >0 = раскрываем
    lastY = y; lastT = now;
  };
  const up = () => {
    if (!dragging) return;
    dragging = false; sheet.classList.remove('dragging');
    const h = sheet.getBoundingClientRect().height;
    sheet.style.height = '';                      // снап делает CSS-класс
    if (moved < 6) { cycle(); return; }           // это тап, а не перетаскивание
    const [c, hf, f] = snaps();
    let state;
    if (vel > 0.5) state = h > (c + hf) / 2 ? 'expanded' : 'half';        // флик вверх
    else if (vel < -0.5) state = h < (hf + f) / 2 ? 'collapsed' : 'half'; // флик вниз
    else {                                        // медленно — ближайшая точка
      const d = [[Math.abs(h - c), 'collapsed'], [Math.abs(h - hf), 'half'], [Math.abs(h - f), 'expanded']];
      d.sort((a, b) => a[0] - b[0]); state = d[0][1];
    }
    applyState(state);
  };

  handles.forEach((el) => {
    el.addEventListener('touchstart', (e) => {
      if (e.target.closest('[data-filters-btn]')) return; // кнопка «Фильтры» — не драг
      down(e.touches[0].clientY);
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      e.preventDefault();                          // гасим прокрутку страницы/карты под шторкой
      move(e.touches[0].clientY);
    }, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    el.addEventListener('mousedown', (e) => { if (e.target.closest('[data-filters-btn]')) return; down(e.clientY); });
  });
  addEventListener('mousemove', (e) => move(e.clientY));
  addEventListener('mouseup', up);

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

/* ---------- Report modal (жалоба/предложение → /api/report → Telegram) ---------- */
(function reportModule() {
  const modal = document.getElementById('reportModal');
  if (!modal) return;
  const openBtn = document.getElementById('reportBtn');
  const kindSeg = modal.querySelector('[data-rm-kind]');
  const catWrap = modal.querySelector('[data-rm-catwrap]');
  const catSel = document.getElementById('rmCategory');
  const stateWrap = modal.querySelector('[data-rm-statewrap]');
  const stateSeg = modal.querySelector('[data-rm-state]');
  const addrInput = document.getElementById('rmAddress');
  const addrReq = modal.querySelector('[data-rm-req]');
  const addrHint = modal.querySelector('[data-rm-addrhint]');
  const suggestBox = document.getElementById('rmSuggest');
  const msgEl = document.getElementById('rmMessage');
  const hp = document.getElementById('rmHp');
  const errBox = document.getElementById('rmErr');
  const submit = document.getElementById('rmSubmit');
  let kind = 'complaint';
  let reportState = 'outage';

  function setKind(k) {
    kind = k;
    kindSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.kind === k));
    catWrap.style.display = k === 'complaint' ? '' : 'none';
    stateWrap.style.display = k === 'complaint' ? '' : 'none';
    addrReq.style.display = k === 'complaint' ? '' : 'none';   // адрес обязателен только для жалобы
    addrHint.textContent = k === 'complaint' ? 'Начните вводить — подскажем улицу и дом' : 'Адрес по желанию';
  }
  function setState(s) {
    reportState = s;
    stateSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.state === s));
  }
  stateSeg.querySelectorAll('button').forEach((b) => (b.onclick = () => setState(b.dataset.state)));
  function showErr(m) { errBox.textContent = m; errBox.classList.add('show'); }
  function open(prefill) {
    errBox.textContent = ''; errBox.classList.remove('show');
    submit.disabled = false; submit.textContent = 'Отправить';
    setKind('complaint'); setState('outage');
    catSel.value = ''; msgEl.value = ''; hp.value = '';
    addrInput.value = prefill || '';
    suggestBox.classList.remove('show');
    modal.classList.add('show'); modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    if (!prefill) setTimeout(() => addrInput.focus(), 60);
  }
  function close() {
    modal.classList.remove('show'); modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = ''; suggestBox.classList.remove('show');
  }

  if (openBtn) openBtn.onclick = () => open('');
  // из карточек дома/адреса — с автоподстановкой адреса (делегирование: попапы пересоздаются)
  document.addEventListener('click', (e) => {
    const rb = e.target.closest('.hc-report');
    if (rb) { e.preventDefault(); open(decodeURIComponent(rb.dataset.reportAddr || '')); }
  });
  kindSeg.querySelectorAll('button').forEach((b) => (b.onclick = () => setKind(b.dataset.kind)));
  modal.querySelectorAll('[data-rm-close]').forEach((el) => (el.onclick = close));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('show')) close(); });

  // ---- подсказки адреса: переиспуем реестр адресов и матчинг улиц из поиска карты ----
  let sugT = null;
  function renderRmSuggest(q) {
    loadAddresses().then(() => {
      const pq = parseQuery(q);
      const addrHits = addressSuggestions(pq, 7);
      const streetHits = STREETS.filter((s) => streetMatches(s.name, pq.street)).slice(0, 5);
      const items = [];
      addrHits.forEach((a) => items.push({ label: `${a.street}, ${a.house}`, val: `${a.street}, ${a.house}` }));
      streetHits.forEach((s) => { if (!items.some((i) => i.val === s.name)) items.push({ label: s.name, val: s.name }); });
      if (!items.length) { suggestBox.classList.remove('show'); return; }
      suggestBox.innerHTML = items.slice(0, 7).map((i) =>
        `<div class="rm-sg" data-val="${encodeURIComponent(i.val)}"><span class="d"></span>${i.label}</div>`).join('');
      suggestBox.classList.add('show');
      suggestBox.querySelectorAll('.rm-sg').forEach((el) => (el.onclick = () => {
        addrInput.value = decodeURIComponent(el.dataset.val); suggestBox.classList.remove('show');
      }));
    });
  }
  addrInput.addEventListener('input', () => {
    clearTimeout(sugT); const q = addrInput.value.trim();
    if (q.length < 2) { suggestBox.classList.remove('show'); return; }
    sugT = setTimeout(() => renderRmSuggest(q), 120);
  });
  addrInput.addEventListener('focus', () => { if (addrInput.value.trim().length >= 2) renderRmSuggest(addrInput.value.trim()); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.rm-addr')) suggestBox.classList.remove('show'); });

  submit.onclick = async () => {
    errBox.classList.remove('show');
    const category = catSel.value, address = addrInput.value.trim(), message = msgEl.value.trim();
    if (kind === 'complaint' && !category) return showErr('Выберите, что случилось');
    if (kind === 'complaint' && !address) return showErr('Укажите адрес');
    if (kind === 'suggestion' && !message) return showErr('Напишите сообщение');
    submit.disabled = true; submit.textContent = 'Отправляем…';
    try {
      const r = await fetch('/api/report/', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind, category, address, message, state: reportState, website: hp.value }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) { close(); showToast('Спасибо! Сообщение отправлено.', 3500); }
      else if (j.error === 'not_configured') showErr('Отправка ещё не настроена — сообщите администратору.');
      else showErr('Не удалось отправить. Попробуйте ещё раз.');
    } catch (e) { showErr('Нет связи. Проверьте интернет и повторите.'); }
    finally { submit.disabled = false; submit.textContent = 'Отправить'; }
  };

  // Открытие модалки по ссылке с лендинга: /map/?report=1
  try {
    if (new URLSearchParams(location.search).get('report') === '1') {
      setTimeout(() => open(''), 400);
      history.replaceState(null, '', location.pathname);   // чистим параметр из URL
    }
  } catch (e) {}
})();

/* ---------- Инфо-плашка (честный контекст) ---------- */
(function mapNotice() {
  const n = document.getElementById('mapNotice');
  const txt = document.getElementById('mapNoticeText');
  if (!n || !txt || !txt.textContent.trim()) return;   // пустой текст — плашки нет
  const KEY = 'barjoq_notice_v1';                       // бампнуть при НОВОМ тексте — покажется снова
  try { if (localStorage.getItem(KEY) === 'off') return; } catch (e) {}
  n.hidden = false;
  const x = document.getElementById('mnClose');
  if (x) x.onclick = () => { n.hidden = true; try { localStorage.setItem(KEY, 'off'); } catch (e) {} };
})();

/* ---------- Go ---------- */
load();
})();
