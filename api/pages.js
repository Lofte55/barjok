/*
 * Все SEO SSR-страницы в одном serverless function (Vercel Hobby plan: лимит
 * 12 функций на деплой — держим их количество маленьким через query-роутинг,
 * тот же паттерн, что уже использует admin-ads-data/action).
 * ?page=home|maphub|city|service|sitemap, роутится из vercel.json rewrites.
 */
const { getCity, allCities, activeCities, SERVICES, getService } = require('./_lib/seo-cities');
const { getHomeSeo, getCitySeo, getServiceSeo, BRAND, ORIGIN } = require('./_lib/seo');
const { renderSeoPage, breadcrumbsJsonLd, organizationJsonLd, webPageJsonLd, esc } = require('./_lib/seo-layout');
const { computeSnapshot } = require('./_lib/city-stats');
const { outageCardsHtml, countMatching, statusBlockHtml, RES_LABEL_NOM } = require('./_lib/seo-cards');
const RES_COLOR = { cold_water: 'var(--cold)', hot_water: 'var(--hot)', electricity: 'var(--elec)', heating: 'var(--hot)', gas: 'var(--ink-3)' };
const RES_ICON = {
  cold_water: '<path d="M12 3c3.2 4.2 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 2.8-6.8 6-11z"/>',
  hot_water: '<path d="M12 22a5.5 5.5 0 0 0 5.5-5.5c0-3.4-5.5-8.5-5.5-8.5s-5.5 5.1-5.5 8.5A5.5 5.5 0 0 0 12 22z"/>',
  electricity: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
  heating: '<path d="M12 22a5.5 5.5 0 0 0 5.5-5.5c0-3.4-5.5-8.5-5.5-8.5s-5.5 5.1-5.5 8.5A5.5 5.5 0 0 0 12 22z"/>',
  gas: '<circle cx="12" cy="12" r="8"/>',
};
const { statRowHtml, minimalStatsHtml, mapPreviewHtml, stepsHtml, serviceTilesHtml, trustGridHtml, reportCtaHtml, faqAccordionHtml, ctaFinalHtml, sectionHeadHtml } = require('./_lib/seo-blocks');

const SERVICE_CARDS = [
  ['voda', 'Вода'], ['svet', 'Свет'], ['otoplenie', 'Отопление'],
  ['planovye-otklyucheniya', 'Плановые отключения'], ['avariynye-otklyucheniya', 'Аварийные отключения'], ['po-adresu', 'Проверить по адресу'],
];

const FAQ_SERVICE = {
  voda: [
    ['Почему сегодня нет воды в Павлодаре?', 'Причины разные: плановые работы (гидравлические испытания, ремонт сетей), аварии (порыв трубы) или технологический перерыв поставщика. Конкретная причина указана в карточке отключения по вашему адресу.'],
    ['Когда дадут воду?', 'Ожидаемое время восстановления указано в карточке отключения по конкретному адресу — BARJOK берёт его из официальных источников (Водоканал, ПТС) или подтверждает сообщениями жителей.'],
    ['Как проверить отключение воды по адресу?', 'Введите улицу и номер дома в поиске на этой странице или на карте — BARJOK покажет, есть ли отключение именно по вашему дому.'],
    ['Где посмотреть будущие отключения воды?', 'На карте BARJOK отображаются и текущие, и запланированные на будущее отключения — переключите фильтр "Время" на "Будущие".'],
  ],
  svet: [
    ['Почему нет света?', 'Плановое отключение (ремонт сетей Павлодарэнерго) или авария. Причина указана в карточке отключения по вашему адресу.'],
    ['Когда включат свет?', 'Ожидаемое время восстановления электроснабжения указано в карточке по конкретному адресу.'],
    ['Где посмотреть плановые отключения электричества?', 'На странице "Плановые отключения" или на карте с фильтром "Плановое".'],
    ['Как проверить свой адрес?', 'Введите улицу и номер дома в поиске — BARJOK покажет актуальный статус именно по вашему дому.'],
  ],
};

/* Цифры под hero должны честно отражать то, что парсер видит ПРЯМО СЕЙЧАС.
   Активных отключений часто 0 (это нормально и хорошо) — в этом случае
   первой цифрой показываем не голый ноль, а реальное число адресов с уже
   известными плановыми работами (snap.futureAffectedAddresses), иначе
   блок выглядит "не подключённым", хотя данные живые. */
function buildMiniStats(snap) {
  const hasActive = !!snap.affectedAddresses;
  const primary = hasActive ? snap.affectedAddresses : (snap.futureAffectedAddresses || 0);
  const primaryLabel = hasActive ? 'адресов затронуто сейчас' : 'адресов ждут плановых работ';
  return minimalStatsHtml([
    [primary, primaryLabel, primary ? '+' : ''],
    [snap.electricityAffected, 'без света сейчас', '', 'var(--elec)'],
    [snap.hotWaterAffected, 'без горячей воды сейчас', '', 'var(--hot)'],
    [snap.coldWaterAffected, 'без холодной воды сейчас', '', 'var(--cold)'],
  ], { allZero: !snap.activeOutages });
}

const FAQ_HOME = [
  ['Как узнать об отключении воды по адресу в Павлодаре?', 'Введите улицу и номер дома на карте или на странице города — если по вашему адресу есть отключение, вы увидите дату, время и причину.'],
  ['Когда отключат свет в моём доме в Павлодаре?', 'Плановые отключения электричества видны заранее на карте с фильтром «Плановое» — BARJOK получает график от Павлодарэнерго.'],
  ['А как узнать про отключение отопления и горячей воды?', 'На странице города и на карте показаны все виды отключений: холодная/горячая вода, свет, отопление — по каждому дому отдельно.'],
  ['Откуда берутся данные об отключениях?', 'Официальные источники (энергосбыт, водоканал, тепловые сети) плюс подтверждённые сообщения жителей BARJOK.'],
  ['В каких городах работает BARJOK?', 'Сейчас полноценно работает Павлодар. Другие города Казахстана подключаются поэтапно — они уже видны в списке со статусом «Скоро».'],
];

async function renderHome(req, res) {
  const seo = getHomeSeo();
  const cities = allCities();
  const snap = await computeSnapshot();
  const cityCardsHtml = `<div class="city-cards">${cities.map((c) => {
    const active = c.status === 'active';
    const nom = c.names.ru.nominative;
    return active
      ? `<a class="city-card" href="/${c.slug}/"><b>Отключения воды и света в ${esc(nom)}</b></a>`
      : `<div class="city-card disabled"><b>${esc(nom)}</b><span class="soon">Скоро</span></div>`;
  }).join('')}</div>`;
  const websiteJsonLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: `${ORIGIN}/` };
  const miniStats = snap.ok ? buildMiniStats(snap) : '';
  const bodyHtml = `
    <p class="lead rv" style="text-align:center">${esc(BRAND)} показывает отключения воды, света, горячей воды и отопления по адресам в городах Казахстана. Выберите город и проверьте свой дом.</p>
    ${miniStats}
    ${mapPreviewHtml({ href: '/map/pavlodar' })}
    <div class="sec rv"><div class="eyebrow">Города</div><h2>Где работает BARJOK</h2></div>
    ${cityCardsHtml}
    ${trustGridHtml()}
    ${reportCtaHtml({ href: '/map/pavlodar?report=1' })}
    ${faqAccordionHtml(FAQ_HOME)}
    ${ctaFinalHtml({ title: 'Проверьте свой адрес прямо сейчас', href: '/map/pavlodar' })}
  `;
  const html = renderSeoPage({
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
    heroSlogan: 'Живая карта отключений — без звонков в диспетчерскую и поиска в чатах ЖК.',
    pillAnnText: 'Данные обновляются каждые несколько часов',
    bodyHtml, jsonLd: [organizationJsonLd(), websiteJsonLd],
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.status(200).send(html);
}

async function renderMapHub(req, res) {
  const cities = allCities();
  const cityCardsHtml = `<div class="city-cards">${cities.map((c) => {
    const active = c.status === 'active';
    const nom = c.names.ru.nominative;
    return active
      ? `<a class="city-card" href="/map/${c.slug}"><b>Карта отключений — ${esc(nom)}</b></a>`
      : `<div class="city-card disabled"><b>${esc(nom)}</b><span class="soon">Скоро</span></div>`;
  }).join('')}</div>`;
  const bodyHtml = `<p style="color:var(--ink-2)">Выберите город, чтобы открыть карту отключений воды, света и отопления.</p>${cityCardsHtml}`;
  const html = renderSeoPage({
    title: `Карта отключений — выберите город | ${BRAND}`,
    description: `Карта отключений воды, света и отопления по городам Казахстана. Выберите город: Павлодар и другие.`,
    canonical: `${ORIGIN}/map/`, h1: 'Карта отключений', bodyHtml, jsonLd: [organizationJsonLd()],
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(html);
}

async function renderCity(req, res) {
  const citySlug = String((req.query || {}).city || '');
  const city = getCity(citySlug);
  if (!city || city.status !== 'active') return res.status(404).send('Not found');

  const seo = getCitySeo(citySlug);
  const snap = await computeSnapshot();
  const loc = city.names.ru.locative;
  const nom = city.names.ru.nominative;

  const serviceCardsHtml = serviceTilesHtml(citySlug, SERVICE_CARDS);
  const cardsHtml = snap.ok ? outageCardsHtml(snap.houses || [], () => true, 16) : '';

  const splitAddress = (address) => {
    const idx = address.lastIndexOf(',');
    return idx === -1 ? { street: address, house: '' } : { street: address.slice(0, idx).trim(), house: address.slice(idx + 1).trim() };
  };

  const RES_TABS = [
    ['all', 'Все'], ['electricity', 'Электричество'], ['cold_water', 'Холодная вода'],
    ['hot_water', 'Горячая вода'], ['heating', 'Отопление'],
  ];

  let futureHtml = '';
  if (snap.ok) {
    // Группируем по улице+ресурсу — иначе один и тот же дом-ряд (10 карточек
    // "Ермакова, 1/1", "1/2"…) выглядит как повтор одной и той же карточки.
    const groups = new Map();
    for (const h of snap.houses || []) {
      for (const o of h.outages || []) {
        if (o.status !== 'future') continue;
        const { street, house } = splitAddress(h.address);
        const key = street + '|' + o.resource;
        if (!groups.has(key)) groups.set(key, { street, resource: o.resource, houses: [], minStart: o.start });
        const g = groups.get(key);
        if (house) g.houses.push(house);
        if (new Date(o.start) < new Date(g.minStart)) g.minStart = o.start;
      }
    }
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

    const presentResources = new Set(groupList.map((g) => g.resource));
    const tabsToShow = RES_TABS.filter(([key]) => key === 'all' || presentResources.has(key));

    if (groupList.length) {
      const tabsHtml = tabsToShow.length > 2 ? `<div class="res-tabs rv" role="tablist">
        ${tabsToShow.map(([key, label], i) => `<button class="res-tab${i === 0 ? ' on' : ''}" data-filter="${key}" type="button">${esc(label)}</button>`).join('')}
      </div>` : '';
      const cardsHtml2 = groupList.map((g) => {
        const color = RES_COLOR[g.resource] || 'var(--accent)';
        const houseCount = g.houses.length || 1;
        const preview = g.houses.slice(0, 6).join(', ');
        const more = houseCount > 6 ? ` <span class="more-chip">+${houseCount - 6}</span>` : '';
        const mapHref = `/map/${citySlug}?q=${encodeURIComponent(g.street)}`;
        return `<article class="outage-card rv" data-res="${esc(g.resource)}">
          <span class="res-pill" style="background:color-mix(in srgb, ${color} 14%, white);color:${color}"><span class="dot" style="background:${color}"></span>${esc(RES_LABEL_NOM[g.resource] || 'Ресурс')}</span>
          <h3 style="margin:8px 0 2px"><a href="${mapHref}" class="street-link">${esc(g.street)}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M7 7h10v10"/></svg></a></h3>
          <span style="font-size:12.5px;color:var(--ink-3);font-weight:600">${houseCount} ${houseCount === 1 ? 'адрес' : 'адресов'}</span>
          <div style="font-size:13px;color:var(--ink-2);line-height:1.5;margin-top:8px">Дома: ${esc(preview)}${more}</div>
          <dl style="margin-top:8px"><dt>Начало</dt><dd>с ${esc(new Date(g.minStart).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }))}</dd></dl>
        </article>`;
      }).join('');
      futureHtml = `<div class="sec rv"><div class="eyebrow">Заранее</div><h2>Предстоящие отключения</h2><p class="intro">Плановые работы, известные заранее — сгруппированы по улице. Нажмите на улицу, чтобы открыть её на карте.</p></div>${tabsHtml}<div class="cards" id="futureCards">${cardsHtml2}</div>`;
    }
  }

  const otherCities = activeCities().filter((c) => c.slug !== citySlug);
  const otherCitiesHtml = otherCities.length
    ? '<div class="section-title">Другие города BARJOK</div><div class="related-links">' +
      otherCities.map((c) => `<a href="/${c.slug}/">Отключения в ${esc(c.names.ru.locative)}</a>`).join('') + '</div>'
    : '';

  const faq = [
    [`Как узнать об отключении воды по адресу в ${loc}?`, `Найдите свой адрес на карте или введите его в поиске выше — если по нему есть плановое или аварийное отключение, вы увидите дату и время начала и окончания работ.`],
    [`А как узнать про отопление и горячую воду?`, `На этой странице и на карте показаны все виды отключений: холодная и горячая вода, свет, отопление — по каждому дому отдельно, с датой и причиной.`],
    [`Откуда берутся данные об отключениях?`, `Официальные источники (Павлодарэнерго, Павлодар-Водоканал, Павлодарские тепловые сети) плюс подтверждённые сообщения жителей BARJOK.`],
    [`Почему по адресу ничего не показывает, хотя света нет?`, `Иногда авария случается раньше, чем поставщик её опубликует. Нажмите «Сообщить о проблеме» ниже — после проверки отключение появится на карте.`],
    [`В каких городах ещё работает BARJOK?`, `Сейчас полноценно работает Павлодар. Другие города Казахстана подключаются поэтапно — они уже видны в списке со статусом «Скоро».`],
  ];

  const updatedAt = snap.generatedAt ? new Date(snap.generatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const leadText = !snap.ok
    ? 'Получаем свежие данные — обновите страницу через минуту.'
    : (snap.activeOutages
        ? `Сейчас в ${esc(loc)} <b>${snap.activeOutages}</b> активных отключений — они затрагивают <b>${(snap.affectedAddresses || 0).toLocaleString('ru-RU')}</b> адресов. Введи свой, чтобы узнать подробности.`
        : `Активных отключений воды и света в ${esc(loc)} сейчас не найдено. Введи адрес — проверим, нет ли отключения именно по нему.`);

  const searchBoxHtml = `<p class="lead rv">${leadText}</p>
  <div class="cap-wrap rv" style="margin:26px auto 0">
    <form class="capture" action="/map/${citySlug}" method="get" onsubmit="var v=this.querySelector('input').value.trim();if(v){location.href='/map/${citySlug}?q='+encodeURIComponent(v);return false;}">
      <label class="field">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/></svg>
        <input id="capInput" type="text" name="address" placeholder="Улица и номер дома — напр. Естая 38" aria-label="Адрес" autocomplete="off" autocorrect="off" spellcheck="false" data-map-href="/map/${citySlug}">
      </label>
      <button class="btn primary" type="submit">Проверить</button>
    </form>
    <div class="lsug" id="lsug" role="listbox"></div>
  </div>
  ${updatedAt ? `<p class="cap-note rv">Обновлено сегодня в ${esc(updatedAt)}</p>` : ''}`;

  const miniStats = snap.ok ? buildMiniStats(snap) : '';
  const sampleAddress = (snap.ok && snap.houses && snap.houses[0] && snap.houses[0].address) || 'Естая, 38';
  const bodyHtml = `
    <div style="text-align:center;padding-top:6px">
      ${searchBoxHtml}
    </div>
    ${miniStats}
    ${mapPreviewHtml({ href: `/map/${citySlug}` })}
    <div class="sec rv"><div class="eyebrow">Услуги</div><h2>Что можно проверить в ${esc(loc)}</h2></div>
    ${serviceCardsHtml}
    ${cardsHtml ? '<div class="section-title">Текущие отключения</div>' + cardsHtml : ''}
    ${futureHtml}
    ${stepsHtml({ addressSample: sampleAddress })}
    <div class="section-title">Источники данных</div>
    <p>Павлодарэнерго, Павлодар-Водоканал, Павлодарские тепловые сети — обновление каждые 3 часа. Часть отключений подтверждается сообщениями жителей BARJOK.</p>
    ${trustGridHtml()}
    ${reportCtaHtml({ href: `/map/${citySlug}?report=1` })}
    ${faqAccordionHtml(faq, 'faq', { contactHref: `/map/${citySlug}?report=1` })}
    ${otherCitiesHtml}
    ${ctaFinalHtml({ title: `Проверьте свой адрес в ${esc(loc)}`, href: `/map/${citySlug}` })}
  `;

  const html = renderSeoPage({
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
    heroSlogan: `Вода, свет, отопление — весь статус по вашему дому в ${esc(loc)} за секунды.`,
    pillAnnText: 'Обновляется каждые несколько часов',
    currentCitySlug: citySlug,
    breadcrumbs: [{ name: BRAND, url: `${ORIGIN}/` }, { name: nom }],
    bodyHtml,
    jsonLd: [
      organizationJsonLd(),
      webPageJsonLd({ url: seo.canonical, title: seo.title, description: seo.description }),
      breadcrumbsJsonLd([{ name: BRAND, url: `${ORIGIN}/` }, { name: nom, url: seo.canonical }]),
    ],
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
  res.status(200).send(html);
}

async function renderService(req, res) {
  const citySlug = String((req.query || {}).city || '');
  const serviceSlug = String((req.query || {}).service || '');
  const city = getCity(citySlug);
  const service = getService(serviceSlug);
  if (!city || !service || city.status !== 'active') return res.status(404).send('Not found');

  const seo = getServiceSeo(citySlug, serviceSlug);
  const snap = await computeSnapshot();
  const loc = city.names.ru.locative;
  const nom = city.names.ru.nominative;

  let filterFn;
  if (service.resource) filterFn = (o) => o.resource === service.resource;
  else if (service.typeFilter) filterFn = (o) => o.type === service.typeFilter;
  else if (service.waterGroup) filterFn = (o) => o.resource === 'cold_water' || o.resource === 'hot_water';
  else filterFn = () => true;

  const houses = snap.houses || [];
  const matchedCount = snap.ok ? countMatching(houses, filterFn) : 0;
  const cardsHtml = snap.ok && !service.addressSearch ? outageCardsHtml(houses, filterFn) : '';

  const statusHtml = statusBlockHtml({
    locative: loc, activeOutages: matchedCount, affectedAddresses: matchedCount,
    electricityAffected: snap.electricityAffected || 0, hotWaterAffected: snap.hotWaterAffected || 0,
    coldWaterAffected: snap.coldWaterAffected || 0, generatedAt: snap.generatedAt, ok: snap.ok,
  });

  const relatedLinks = [
    ['Все отключения ' + nom, `/${citySlug}/`], ['Отключение света', `/${citySlug}/svet/`],
    ['Горячая вода', `/${citySlug}/goryachaya-voda/`], ['Плановые отключения', `/${citySlug}/planovye-otklyucheniya/`],
    ['Карта ' + nom, `/map/${citySlug}`],
  ].filter(([, url]) => !url.endsWith(`/${serviceSlug}/`));

  const searchBoxHtml = `<form class="capture search-box rv" action="/map/${citySlug}" method="get" style="max-width:560px;margin:22px 0">
    <label class="field">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/></svg>
      <input type="text" name="address" placeholder="Улица и номер дома" aria-label="Адрес" autocomplete="off">
    </label>
    <button class="btn primary" type="submit">Проверить</button>
  </form>`;

  const bodyHtml = `
    ${statusHtml}
    ${searchBoxHtml}
    ${cardsHtml ? '<div class="section-title">Текущие отключения ' + esc(service.label) + '</div>' + cardsHtml : ''}
    <div class="section-title">Карта отключений</div>
    <p><a href="/map/${citySlug}">Открыть карту отключений ${esc(loc)} →</a></p>
    ${trustGridHtml()}
    ${faqAccordionHtml(FAQ_SERVICE[serviceSlug] || FAQ_HOME)}
    <div class="section-title">Связанные страницы</div>
    <div class="related-links">${relatedLinks.map(([name, url]) => `<a href="${url}">${esc(name)}</a>`).join('')}</div>
    ${ctaFinalHtml({ title: `Проверьте «${esc(service.label)}» по своему адресу`, href: `/map/${citySlug}` })}
  `;

  const html = renderSeoPage({
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
    heroSlogan: `${esc(service.label)} в ${esc(loc)} — статус по вашему дому.`,
    currentCitySlug: citySlug,
    breadcrumbs: [{ name: BRAND, url: `${ORIGIN}/` }, { name: nom, url: `${ORIGIN}/${citySlug}/` }, { name: service.label }],
    bodyHtml,
    jsonLd: [
      organizationJsonLd(),
      webPageJsonLd({ url: seo.canonical, title: seo.title, description: seo.description }),
      breadcrumbsJsonLd([{ name: BRAND, url: `${ORIGIN}/` }, { name: nom, url: `${ORIGIN}/${citySlug}/` }, { name: service.label, url: seo.canonical }]),
    ],
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=600');
  res.status(200).send(html);
}

async function renderSitemap(req, res) {
  const snap = await computeSnapshot();
  const now = snap.generatedAt || new Date().toISOString();
  const urls = [
    { loc: `${ORIGIN}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${ORIGIN}/map/`, changefreq: 'daily', priority: '0.5' },
  ];
  for (const city of activeCities()) {
    urls.push({ loc: `${ORIGIN}/${city.slug}/`, changefreq: 'hourly', priority: '0.9' });
    urls.push({ loc: `${ORIGIN}/map/${city.slug}`, changefreq: 'hourly', priority: '0.9' });
    for (const service of SERVICES) urls.push({ loc: `${ORIGIN}/${city.slug}/${service.slug}/`, changefreq: 'hourly', priority: '0.8' });
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(xml);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const page = String((req.query || {}).page || '');
  try {
    if (page === 'home') return await renderHome(req, res);
    if (page === 'maphub') return await renderMapHub(req, res);
    if (page === 'city') return await renderCity(req, res);
    if (page === 'service') return await renderService(req, res);
    if (page === 'sitemap') return await renderSitemap(req, res);
    return res.status(404).send('Not found');
  } catch (e) {
    console.error('pages.js failed:', e.message);
    res.status(500).send('Internal error');
  }
};
