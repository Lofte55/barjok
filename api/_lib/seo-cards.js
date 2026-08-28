const { esc } = require('./seo-layout');
const { dk } = require('./i18n-kk');

const RES_LABEL = { cold_water: 'холодной воды', hot_water: 'горячей воды', water: 'воды (совсем)', electricity: 'света', heating: 'отопления', gas: 'газа' };
const RES_LABEL_NOM = { cold_water: 'Холодная вода', hot_water: 'Горячая вода', water: 'Нет воды (совсем)', electricity: 'Электричество', heating: 'Отопление', gas: 'Газ' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' });
}
// Компактный формат для плотных карточек "Текущие отключения" — "17.08, 08:32"
// вместо "17 августа в 08:32", чтобы карточка не растягивалась по высоте.
function fmtDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(', ', ', ');
}
const truncate = (s, max) => (s && s.length > max ? s.slice(0, max - 1).trim() + '…' : s);

/*
 * houses: массив домов из snapshot; filterFn(outage,house) => bool; limit — сколько
 * карточек рендерить в HTML (Core Web Vitals — не тянем тысячи карточек в SSR, §51).
 */
function outageCardsHtml(houses, filterFn, limit = 24) {
  const rows = [];
  for (const h of houses) {
    for (const o of h.outages || []) {
      if (o.status !== 'current') continue;
      if (!filterFn(o, h)) continue;
      rows.push({ h, o });
      if (rows.length >= limit) break;
    }
    if (rows.length >= limit) break;
  }
  if (!rows.length) return '';
  const RES_COLOR = { cold_water: 'var(--cold)', hot_water: 'var(--hot)', water: 'var(--water)', electricity: 'var(--elec)', heating: 'var(--hot)', gas: 'var(--ink-3)' };
  return '<div class="cards cards-compact">' + rows.map(({ h, o }) => {
    const color = RES_COLOR[o.resource] || 'var(--accent)';
    const reason = truncate(o.reason || (o.type === 'emergency' ? 'Аварийные работы' : 'Плановые работы'), 70);
    const source = o.citizen ? 'От жителей BARJOK' : truncate(o.provider || 'Официальный источник', 40);
    return `<article class="outage-card rv">
    <span class="res-pill" style="background:color-mix(in srgb, ${color} 14%, white);color:${color}"><span class="dot" style="background:${color}"></span><span${dk(RES_LABEL_NOM[o.resource])}>${esc(RES_LABEL_NOM[o.resource] || o.resource)}</span></span>
    <h3 style="margin:6px 0 8px">${esc(h.address)}</h3>
    <dl>
      <dt data-kk="Басталуы">Начало</dt><dd>${esc(fmtDateShort(o.start))}</dd>
      <dt data-kk="Дейін">До</dt><dd>${esc(fmtDateShort(o.end))}</dd>
      <dt data-kk="Себебі">Причина</dt><dd title="${esc(o.reason || '')}"${dk(reason)}>${esc(reason)}</dd>
      <dt data-kk="Дереккөз">Источник</dt><dd${dk(source)}>${esc(source)}</dd>
    </dl>
  </article>`;
  }).join('') + '</div>';
}

const RES_COLOR = { cold_water: 'var(--cold)', hot_water: 'var(--hot)', water: 'var(--water)', electricity: 'var(--elec)', heating: 'var(--hot)', gas: 'var(--ink-3)' };
const RES_TABS = [
  ['all', 'Все'], ['electricity', 'Электричество'], ['cold_water', 'Холодная вода'],
  ['hot_water', 'Горячая вода'], ['water', 'Нет воды'], ['heating', 'Отопление'], ['gas', 'Газ'],
];
const splitAddress = (address) => {
  const idx = address.lastIndexOf(',');
  return idx === -1 ? { street: address, house: '' } : { street: address.slice(0, idx).trim(), house: address.slice(idx + 1).trim() };
};

/*
 * Единый паттерн "Текущие"/"Предстоящие отключения": группировка по улице+ресурсу
 * (иначе один дом-ряд из 10 подъездов выглядит как повтор одной карточки), табы
 * фильтра по ресурсу, плитка "+N ещё" вместо тихого обрезания списка, клик по
 * улице ведёт на карту. statusValue: 'current' | 'future'.
 */
// lang — ТОЛЬКО префикс для href на /map/... (сам текст карточек по-прежнему
// data-kk + bakeKk() на /kz/-страницах, эту функцию для перевода не трогаем).
function groupedOutagesHtml(houses, statusValue, citySlug, { eyebrow, title, intro, idPrefix = 'g', lang } = {}) {
  const mapP = lang === 'kk' ? '/kz' : '';
  const groups = new Map();
  for (const h of houses || []) {
    for (const o of h.outages || []) {
      if (o.status !== statusValue) continue;
      const { street, house } = splitAddress(h.address);
      const key = street + '|' + o.resource;
      if (!groups.has(key)) groups.set(key, { street, resource: o.resource, houses: [], minStart: o.start });
      const g = groups.get(key);
      if (house) g.houses.push(house);
      if (new Date(o.start) < new Date(g.minStart)) g.minStart = o.start;
    }
  }
  if (!groups.size) return '';

  // Топ-N НА КАЖДЫЙ ресурс, а не топ-N по всем сразу — иначе табы "Вода"/"Отопление"
  // остаются пустыми, если электричество просто численно больше в базе.
  const byResource = new Map();
  for (const g of groups.values()) {
    const list = byResource.get(g.resource) || [];
    list.push(g);
    byResource.set(g.resource, list);
  }
  let groupList = [];
  for (const list of byResource.values()) {
    list.sort((a, b) => b.houses.length - a.houses.length);
    groupList = groupList.concat(list.slice(0, 6));
  }
  groupList.sort((a, b) => b.houses.length - a.houses.length);
  if (!groupList.length) return '';

  const presentResources = new Set(groupList.map((g) => g.resource));
  const tabsToShow = RES_TABS.filter(([key]) => key === 'all' || presentResources.has(key));
  const tabsHtml = tabsToShow.length > 2 ? `<div class="res-tabs rv" role="tablist">
    ${tabsToShow.map(([key, label], i) => `<button class="res-tab${i === 0 ? ' on' : ''}" data-filter="${key}" type="button"${dk(label)}>${esc(label)}</button>`).join('')}
  </div>` : '';

  // В общем виде ("Все") — не больше 12 плиток: 11 реальных улиц + плитка
  // "+N ещё" на карту без фильтра по адресу. В конкретном ресурсе (таб)
  // ограничение снимается — там и так не больше 6 (top-N-на-ресурс выше).
  // Десктоп показывает до 11 карточек + плитку "+N ещё" (grid, несколько колонок).
  // Мобильный — только до 6, потом своя плитка "+N ещё" (одна колонка, иначе
  // список из 11+ полноразмерных карточек требует слишком много скролла).
  // Обе плитки рендерятся в SSR (SEO/crawlability), видимость переключается CSS
  // по брейкпоинту 760px — см. .mobile-hide/.outage-more-mobile в seo-layout.js.
  const MAX_VISIBLE = 11;
  const MAX_VISIBLE_MOBILE = 6;
  const overflowCount = Math.max(0, groupList.length - MAX_VISIBLE);
  const overflowCountMobile = Math.max(0, groupList.length - MAX_VISIBLE_MOBILE);
  const dateLabel = statusValue === 'current' ? 'с' : 'с';
  // KZ: после числительного существительное НЕ принимает множественное число
  // («тағы 5 көше», не «көшелер») — поэтому здесь, в отличие от русского, форма одна.
  // Тот же принцип, что у «${houseCount} мекенжай» ниже. Не «чинить» тернарником.
  const moreLabelKk = (n) => `тағы ${n} көше ажыратуымен`;
  const mobileMoreTile = overflowCountMobile > 0 ? `<a class="outage-card outage-more outage-more-mobile rv" data-res="__more__" href="${mapP}/map/${citySlug}">
    <span class="outage-more-n">+${overflowCountMobile}</span>
    <span class="outage-more-label" data-kk="${esc(moreLabelKk(overflowCountMobile))}">ещё ${overflowCountMobile === 1 ? 'улица' : 'улиц'} с отключениями</span>
    <span class="outage-more-cta"><span data-kk="Картадан барлығын көру">Смотреть всё на карте</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
  </a>` : '';
  const cardsHtml = groupList.map((g, idx) => {
    const color = RES_COLOR[g.resource] || 'var(--accent)';
    const houseCount = g.houses.length || 1;
    const preview = g.houses.slice(0, 6).join(', ');
    const more = houseCount > 6 ? ` <span class="more-chip">+${houseCount - 6}</span>` : '';
    const mapHref = `${mapP}/map/${citySlug}?q=${encodeURIComponent(g.street)}`;
    const extraAttrs = idx >= MAX_VISIBLE ? ' hidden data-extra="1"' : '';
    const mobileHideClass = idx >= MAX_VISIBLE_MOBILE && idx < MAX_VISIBLE ? ' mobile-hide' : '';
    const card = `<a class="outage-card street-card rv${mobileHideClass}" data-res="${esc(g.resource)}"${extraAttrs} href="${mapHref}">
      <span class="res-pill" style="background:color-mix(in srgb, ${color} 14%, white);color:${color}"><span class="dot" style="background:${color}"></span><span${dk(RES_LABEL_NOM[g.resource])}>${esc(RES_LABEL_NOM[g.resource] || 'Ресурс')}</span></span>
      <h3 style="margin:8px 0 2px">${esc(g.street)}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg></h3>
      <span style="font-size:12.5px;color:var(--ink-3);font-weight:600" data-kk="${esc(houseCount + ' мекенжай')}">${houseCount} ${houseCount === 1 ? 'адрес' : 'адресов'}</span>
      <div style="font-size:13px;color:var(--ink-2);line-height:1.5;margin-top:8px"><span data-kk="Үйлер:">Дома:</span> ${esc(preview)}${more}</div>
      <dl style="margin-top:8px"><dt data-kk="Басталуы">Начало</dt><dd>${dateLabel} ${esc(fmtDate(g.minStart))}</dd></dl>
    </a>`;
    // Мобильная плитка "+N ещё" встаёт сразу за 6-й карточкой — на мобильном
    // это последнее видимое, на десктопе она display:none и не мешает grid'у.
    return idx === MAX_VISIBLE_MOBILE - 1 ? card + mobileMoreTile : card;
  }).join('');
  const moreTile = overflowCount > 0 ? `<a class="outage-card outage-more rv" data-res="__more__" href="${mapP}/map/${citySlug}">
    <span class="outage-more-n">+${overflowCount}</span>
    <span class="outage-more-label" data-kk="${esc(moreLabelKk(overflowCount))}">ещё ${overflowCount === 1 ? 'улица' : 'улиц'} с отключениями</span>
    <span class="outage-more-cta"><span data-kk="Картадан барлығын көру">Смотреть всё на карте</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span>
  </a>` : '';

  return `<div class="sec rv"><div class="eyebrow"${dk(eyebrow)}>${esc(eyebrow)}</div><h2${dk(title)}>${esc(title)}</h2>${intro ? `<p class="intro"${dk(intro)}>${esc(intro)}</p>` : ''}</div>${tabsHtml}<div class="cards tab-all" id="${esc(idPrefix)}Cards">${cardsHtml}${moreTile}</div>`;
}

function countMatching(houses, filterFn) {
  let n = 0;
  for (const h of houses) for (const o of h.outages || []) { if (o.status === 'current' && filterFn(o, h)) n++; }
  return n;
}

/* Динамический SEO-блок состояния (§11). */
function statusBlockHtml({ locative, activeOutages, affectedAddresses, electricityAffected, hotWaterAffected, coldWaterAffected, generatedAt, ok }) {
  const updated = generatedAt ? new Date(generatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  if (!ok) {
    return `<div class="updated">Последнее успешное обновление — уточняется.</div>
      <div class="status-block">Получаем новые данные от источника. Попробуйте обновить страницу через минуту.</div>`;
  }
  if (!activeOutages) {
    return `<div class="updated">Обновлено сегодня в ${esc(updated)}.</div>
      <div class="status-block">По данным BARJOK, активных отключений воды и света в ${esc(locative)} сейчас не найдено.<br>
      Проверьте свой адрес — по вашему дому также могут быть запланированы будущие работы.</div>`;
  }
  return `<div class="updated">Обновлено сегодня в ${esc(updated)}.</div>
    <div class="status-block">
      Сейчас в ${esc(locative)} найдено <b>${activeOutages}</b> активных отключений.<br>
      Они затрагивают <b>${affectedAddresses.toLocaleString('ru-RU')}</b> адресов.<br><br>
      Без электричества — <b>${electricityAffected}</b> адресов.<br>
      Без горячей воды — <b>${hotWaterAffected}</b> адресов.<br>
      Без холодной воды — <b>${coldWaterAffected}</b> адресов.
    </div>`;
}

module.exports = { outageCardsHtml, groupedOutagesHtml, countMatching, statusBlockHtml, fmtDate, RES_LABEL, RES_LABEL_NOM, RES_COLOR };
