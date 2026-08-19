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
const { outageCardsHtml, groupedOutagesHtml, countMatching, statusBlockHtml, RES_LABEL_NOM } = require('./_lib/seo-cards');
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
  // "Затронуто N адресов" — та же методика, что на самой карте (union текущих
  // и будущих отключений, а не только активных прямо сейчас — см. city-stats.js).
  return minimalStatsHtml([
    [snap.totalAffectedAddresses, 'адресов затронуто', '+'],
    [snap.electricityAffected, 'электричество', '', 'var(--elec)'],
    [snap.hotWaterAffected, 'горячая вода', '', 'var(--hot)'],
    [snap.coldWaterAffected, 'холодная вода', '', 'var(--cold)'],
    [snap.heatingAffected, 'отопление', '', 'var(--hot)'],
  ], { allZero: !snap.activeOutages });
}

const FAQ_HOME = [
  ['Как узнать об отключении по адресу?', 'Введите улицу и номер дома на карте или на странице города — если по вашему адресу есть отключение, вы увидите дату, время и причину.'],
  ['Когда отключат свет?', 'Плановые отключения электричества видны заранее на карте с фильтром «Плановое» — BARJOK получает график от Павлодарэнерго.'],
  ['А отопление и горячая вода?', 'На странице города и на карте показаны все виды отключений: холодная/горячая вода, свет, отопление — по каждому дому отдельно.'],
  ['Откуда данные?', 'Официальные источники (энергосбыт, водоканал, тепловые сети) плюс подтверждённые сообщения жителей BARJOK.'],
  ['Какие ещё города?', 'Сейчас полноценно работает Павлодар. Другие города Казахстана подключаются поэтапно — они уже видны в списке со статусом «Скоро».'],
];

async function renderHome(req, res) {
  const seo = getHomeSeo();
  const cities = allCities();
  const snap = await computeSnapshot();
  // Горизонтальная прокручиваемая лента, а не растущая сетка — при добавлении
  // новых городов блок не раздувается по высоте, просто становится длиннее лента.
  const cityCardsHtml = `<div class="city-cards city-cards-scroll">${cities.map((c) => {
    const active = c.status === 'active';
    const nom = c.names.ru.nominative;
    return active
      ? `<a class="city-card" href="/${c.slug}/"><b>${esc(nom)}</b><span class="city-card-sub">Отключения воды и света</span></a>`
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
    ${stepsHtml({})}
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
  const cityCardsHtml = `<div class="city-cards city-cards-scroll">${cities.map((c) => {
    const active = c.status === 'active';
    const nom = c.names.ru.nominative;
    return active
      ? `<a class="city-card" href="/map/${c.slug}"><b>${esc(nom)}</b><span class="city-card-sub">Карта отключений</span></a>`
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

  const cardsHtml = snap.ok ? groupedOutagesHtml(snap.houses || [], 'current', citySlug, {
    eyebrow: 'Прямо сейчас', title: 'Текущие отключения',
    intro: 'Активные отключения — сгруппированы по улице. Нажмите на улицу, чтобы открыть её на карте.',
    idPrefix: 'current',
  }) : '';
  const futureHtml = snap.ok ? groupedOutagesHtml(snap.houses || [], 'future', citySlug, {
    eyebrow: 'Заранее', title: 'Предстоящие отключения',
    intro: 'Плановые работы, известные заранее — сгруппированы по улице. Нажмите на улицу, чтобы открыть её на карте.',
    idPrefix: 'future',
  }) : '';

  const otherCities = activeCities().filter((c) => c.slug !== citySlug);
  const otherCitiesHtml = otherCities.length
    ? '<div class="sec rv"><div class="eyebrow">Ещё</div><h2>Другие города BARJOK</h2></div><div class="related-links">' +
      otherCities.map((c) => `<a href="/${c.slug}/">Отключения в ${esc(c.names.ru.locative)}</a>`).join('') + '</div>'
    : '';

  const faq = [
    [`Как узнать об отключении по адресу?`, `Найдите свой адрес на карте или введите его в поиске выше — если по нему есть плановое или аварийное отключение, вы увидите дату и время начала и окончания работ.`],
    [`А отопление и горячая вода?`, `На этой странице и на карте показаны все виды отключений: холодная и горячая вода, свет, отопление — по каждому дому отдельно, с датой и причиной.`],
    [`Откуда данные?`, `Официальные источники (Павлодарэнерго, Павлодар-Водоканал, Павлодарские тепловые сети) плюс подтверждённые сообщения жителей BARJOK.`],
    [`Не вижу своё отключение — что делать?`, `Иногда авария случается раньше, чем поставщик её опубликует. Нажмите «Сообщить о проблеме» ниже — после проверки отключение появится на карте.`],
    [`Какие ещё города?`, `Сейчас полноценно работает Павлодар. Другие города Казахстана подключаются поэтапно — они уже видны в списке со статусом «Скоро».`],
  ];

  const updatedAt = snap.generatedAt ? new Date(snap.generatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const leadText = `Вода, свет, отопление — весь статус по вашему дому в ${esc(loc)} за секунды. Введи свой, чтобы узнать подробности.`;

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
    ${cardsHtml}
    ${futureHtml}
    ${stepsHtml({ addressSample: sampleAddress })}
    ${trustGridHtml()}
    ${reportCtaHtml({ href: `/map/${citySlug}?report=1` })}
    ${faqAccordionHtml(faq, 'faq', { contactHref: `/map/${citySlug}?report=1` })}
    ${otherCitiesHtml}
    ${ctaFinalHtml({ title: `Проверьте свой адрес в ${esc(loc)}`, href: `/map/${citySlug}` })}
  `;

  const html = renderSeoPage({
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
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
    ${cardsHtml ? '<div class="sec rv"><div class="eyebrow">Прямо сейчас</div><h2>Текущие отключения — ' + esc(service.label) + '</h2></div>' + cardsHtml : ''}
    <div class="sec rv"><div class="eyebrow">Карта</div><h2>Карта отключений</h2></div>
    <p><a href="/map/${citySlug}">Открыть карту отключений ${esc(loc)} →</a></p>
    ${stepsHtml({})}
    ${trustGridHtml()}
    ${faqAccordionHtml(FAQ_SERVICE[serviceSlug] || FAQ_HOME)}
    <div class="sec rv"><div class="eyebrow">Ещё</div><h2>Связанные страницы</h2></div>
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
