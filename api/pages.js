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
const { outageCardsHtml, countMatching, statusBlockHtml } = require('./_lib/seo-cards');
const { statRowHtml, minimalStatsHtml, mapPreviewHtml, trustGridHtml, faqAccordionHtml, ctaFinalHtml, sectionHeadHtml } = require('./_lib/seo-blocks');

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
  const miniStats = snap.ok ? minimalStatsHtml([
    [snap.affectedAddresses.toLocaleString('ru-RU') + '+', 'адресов затронуто'],
    [snap.electricityAffected.toLocaleString('ru-RU'), 'домов без света'],
    [snap.hotWaterAffected.toLocaleString('ru-RU'), 'без горячей воды'],
  ]) : '';
  const bodyHtml = `
    <p style="color:var(--ink-2);font-size:15px;max-width:60ch;margin:0 auto;text-align:center">${esc(BRAND)} показывает отключения воды, света, горячей воды и отопления по адресам в городах Казахстана. Выберите город и проверьте свой дом.</p>
    ${miniStats}
    ${mapPreviewHtml({ href: '/map/pavlodar' })}
    <div class="sec"><div class="eyebrow">Города</div><h2>Где работает BARJOK</h2></div>
    ${cityCardsHtml}
    ${trustGridHtml()}
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

  const statusHtml = statusBlockHtml({
    locative: loc, activeOutages: snap.activeOutages || 0, affectedAddresses: snap.affectedAddresses || 0,
    electricityAffected: snap.electricityAffected || 0, hotWaterAffected: snap.hotWaterAffected || 0,
    coldWaterAffected: snap.coldWaterAffected || 0, generatedAt: snap.generatedAt, ok: snap.ok,
  });
  const serviceCardsHtml = `<div class="city-cards">${SERVICE_CARDS.map(([slug, label]) =>
    `<a class="city-card" href="/${citySlug}/${slug}/"><b>${esc(label)}</b></a>`).join('')}</div>`;
  const cardsHtml = snap.ok ? outageCardsHtml(snap.houses || [], () => true, 16) : '';

  let futureHtml = '';
  if (snap.ok) {
    const futureRows = [];
    for (const h of snap.houses || []) {
      for (const o of h.outages || []) {
        if (o.status !== 'future') continue;
        futureRows.push({ h, o });
        if (futureRows.length >= 10) break;
      }
      if (futureRows.length >= 10) break;
    }
    if (futureRows.length) {
      futureHtml = '<div class="section-title">Предстоящие отключения</div><div class="cards">' + futureRows.map(({ h, o }) =>
        `<article class="outage-card"><h3>${esc(h.address)}</h3><dl><dt>Начало</dt><dd>${esc(new Date(o.start).toLocaleString('ru-RU', { day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }))}</dd></dl></article>`
      ).join('') + '</div>';
    }
  }

  const otherCities = activeCities().filter((c) => c.slug !== citySlug);
  const otherCitiesHtml = otherCities.length
    ? '<div class="section-title">Другие города BARJOK</div><div class="related-links">' +
      otherCities.map((c) => `<a href="/${c.slug}/">Отключения в ${esc(c.names.ru.locative)}</a>`).join('') + '</div>'
    : '';

  const faq = [
    [`Как узнать об отключении воды по адресу в ${loc}?`, `Найдите свой адрес на карте или введите его в поиске выше — если по нему есть плановое или аварийное отключение, вы увидите дату и время начала и окончания работ.`],
    [`Откуда берутся данные об отключениях?`, `Официальные источники (Павлодарэнерго, Павлодар-Водоканал, Павлодарские тепловые сети) плюс подтверждённые сообщения жителей BARJOK.`],
  ];

  const searchBoxHtml = `<form class="search-box" action="/map/${citySlug}" method="get">
    <input type="text" name="address" placeholder="Улица и номер дома" aria-label="Адрес">
    <button type="submit">Проверить</button>
  </form>`;

  const miniStats = snap.ok ? minimalStatsHtml([
    [snap.affectedAddresses.toLocaleString('ru-RU') + '+', 'адресов затронуто'],
    [snap.electricityAffected.toLocaleString('ru-RU'), 'домов без света'],
    [snap.hotWaterAffected.toLocaleString('ru-RU'), 'без горячей воды'],
  ]) : '';
  const bodyHtml = `
    ${statusHtml}
    ${searchBoxHtml}
    ${miniStats}
    ${mapPreviewHtml({ href: `/map/${citySlug}` })}
    <div class="section-title">Услуги</div>
    ${serviceCardsHtml}
    ${cardsHtml ? '<div class="section-title">Текущие отключения</div>' + cardsHtml : ''}
    ${futureHtml}
    <div class="section-title">Карта</div>
    <p><a href="/map/${citySlug}">Открыть карту отключений ${esc(loc)} →</a></p>
    <div class="section-title">Источники данных</div>
    <p>Павлодарэнерго, Павлодар-Водоканал, Павлодарские тепловые сети — обновление каждые 3 часа. Часть отключений подтверждается сообщениями жителей BARJOK.</p>
    ${trustGridHtml()}
    ${faqAccordionHtml(faq)}
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

  const searchBoxHtml = `<form class="search-box" action="/map/${citySlug}" method="get">
    <input type="text" name="address" placeholder="Улица и номер дома" aria-label="Адрес">
    <button type="submit">Проверить</button>
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
