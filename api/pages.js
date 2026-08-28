/*
 * Все SEO SSR-страницы в одном serverless function (Vercel Hobby plan: лимит
 * 12 функций на деплой — держим их количество маленьким через query-роутинг,
 * тот же паттерн, что уже использует admin-ads-data/action).
 * ?page=home|maphub|city|service|sitemap, роутится из vercel.json rewrites.
 */
const { getCity, allCities, activeCities, SERVICES, getService } = require('./_lib/seo-cities');
const { getHomeSeo, getCitySeo, getServiceSeo, getAboutSeo, BRAND, ORIGIN } = require('./_lib/seo');
const { renderSeoPage, breadcrumbsJsonLd, organizationJsonLd, webPageJsonLd, esc } = require('./_lib/seo-layout');
const { computeSnapshot } = require('./_lib/city-stats');
const { groupedOutagesHtml, countMatching } = require('./_lib/seo-cards');
const { statRowHtml, minimalStatsHtml, mapPreviewHtml, stepsHtml, serviceTilesHtml, trustGridHtml, reportCtaHtml, faqAccordionHtml, ctaFinalHtml, sectionHeadHtml, timelineHtml } = require('./_lib/seo-blocks');
const { dk } = require('./_lib/i18n-kk');
const { bakeKk } = require('./_lib/bake-kk');
const { renderPartnersBody } = require('./_lib/partners-page');

// lang из req.query — 'kk' только по точному совпадению, любое другое
// значение (или отсутствие) — русская страница как раньше.
const langOf = (req) => (String((req.query || {}).lang || '') === 'kk' ? 'kk' : 'ru');

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
  const lang = langOf(req);
  const p = lang === 'kk' ? '/kz' : '';
  const seo = getHomeSeo(lang);
  const cities = allCities();
  const snap = await computeSnapshot();
  // Горизонтальная прокручиваемая лента, а не растущая сетка — при добавлении
  // новых городов блок не раздувается по высоте, просто становится длиннее лента.
  const cityCardsHtml = `<div class="city-cards city-cards-scroll">${cities.map((c) => {
    const active = c.status === 'active';
    const nom = c.names.ru.nominative;
    const kkNom = c.names.kk && c.names.kk.nominative;
    return active
      ? `<a class="city-card" href="${p}/${c.slug}/"><b${kkNom ? ` data-kk="${esc(kkNom)}"` : ''}>${esc(nom)}</b><span class="city-card-sub" data-kk="Су және жарық ажыратулары">Отключения воды и света</span></a>`
      : `<div class="city-card disabled"><b${kkNom ? ` data-kk="${esc(kkNom)}"` : ''}>${esc(nom)}</b><span class="soon" data-kk="Жақында">Скоро</span></div>`;
  }).join('')}</div>`;
  const websiteJsonLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: `${ORIGIN}/` };
  const miniStats = snap.ok ? buildMiniStats(snap) : '';
  const leadKk = `${BRAND} Қазақстан қалаларындағы мекенжайлар бойынша су, жарық, ыстық су және жылу ажыратуларын көрсетеді. Қаланы таңдап, үйіңізді тексеріңіз.`;
  const bodyHtml = `
    <p class="lead rv" style="text-align:center" data-kk="${esc(leadKk)}">${esc(BRAND)} показывает отключения воды, света, горячей воды и отопления по адресам в городах Казахстана. Выберите город и проверьте свой дом.</p>
    ${miniStats}
    ${mapPreviewHtml({ href: `${p}/map/pavlodar` })}
    <div class="sec rv"><div class="eyebrow" data-kk="Қалалар">Города</div><h2 data-kk="BARJOK қай жерде жұмыс істейді">Где работает BARJOK</h2></div>
    ${cityCardsHtml}
    ${stepsHtml({})}
    ${trustGridHtml()}
    ${reportCtaHtml({ href: `${p}/map/pavlodar?report=1` })}
    ${faqAccordionHtml(FAQ_HOME)}
    ${ctaFinalHtml({ title: 'Проверьте свой адрес прямо сейчас', href: `${p}/map/pavlodar` })}
  `;
  const html = renderSeoPage({
    lang, altHref: lang === 'kk' ? '/' : '/kz/',
    hrefRu: getHomeSeo('ru').canonical, hrefKk: getHomeSeo('kk').canonical,
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
    heroSlogan: 'Живая карта отключений — без звонков в диспетчерскую и поиска в чатах ЖК.',
    pillAnnText: 'Данные обновляются каждые несколько часов',
    bodyHtml, jsonLd: [organizationJsonLd(), websiteJsonLd],
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.status(200).send(lang === 'kk' ? bakeKk(html) : html);
}

async function renderMapHub(req, res) {
  const cities = allCities();
  const cityCardsHtml = `<div class="city-cards city-cards-scroll">${cities.map((c) => {
    const active = c.status === 'active';
    const nom = c.names.ru.nominative;
    const kkNom = c.names.kk && c.names.kk.nominative;
    return active
      ? `<a class="city-card" href="/map/${c.slug}"><b${kkNom ? ` data-kk="${esc(kkNom)}"` : ''}>${esc(nom)}</b><span class="city-card-sub" data-kk="Ажыратулар картасы">Карта отключений</span></a>`
      : `<div class="city-card disabled"><b${kkNom ? ` data-kk="${esc(kkNom)}"` : ''}>${esc(nom)}</b><span class="soon" data-kk="Жақында">Скоро</span></div>`;
  }).join('')}</div>`;
  const bodyHtml = `<p style="color:var(--ink-2)" data-kk="Су, жарық және жылу ажыратуларының картасын ашу үшін қаланы таңдаңыз.">Выберите город, чтобы открыть карту отключений воды, света и отопления.</p>${cityCardsHtml}`;
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
  if (!city || city.status !== 'active') return renderNotFound(req, res);

  const lang = langOf(req);
  const p = lang === 'kk' ? '/kz' : '';
  const seo = getCitySeo(citySlug, lang);
  const snap = await computeSnapshot();
  const loc = city.names.ru.locative;
  const nom = city.names.ru.nominative;

  const serviceCardsHtml = serviceTilesHtml(citySlug, SERVICE_CARDS, lang);

  const cardsHtml = snap.ok ? groupedOutagesHtml(snap.houses || [], 'current', citySlug, {
    eyebrow: 'Прямо сейчас', title: 'Текущие отключения',
    intro: 'Активные отключения — сгруппированы по улице. Нажмите на улицу, чтобы открыть её на карте.',
    idPrefix: 'current', lang,
  }) : '';
  const futureHtml = snap.ok ? groupedOutagesHtml(snap.houses || [], 'future', citySlug, {
    eyebrow: 'Заранее', title: 'Предстоящие отключения',
    intro: 'Плановые работы, известные заранее — сгруппированы по улице. Нажмите на улицу, чтобы открыть её на карте.',
    idPrefix: 'future', lang,
  }) : '';

  const otherCities = activeCities().filter((c) => c.slug !== citySlug);
  const otherCitiesHtml = otherCities.length
    ? '<div class="sec rv"><div class="eyebrow" data-kk="Тағы">Ещё</div><h2 data-kk="BARJOK-тың басқа қалалары">Другие города BARJOK</h2></div><div class="related-links">' +
      otherCities.map((c) => {
        const kkLoc = (c.names.kk && c.names.kk.nominative) || c.names.ru.locative;
        return `<a href="${p}/${c.slug}/" data-kk="${esc(kkLoc + ' ажыратулары')}">Отключения в ${esc(c.names.ru.locative)}</a>`;
      }).join('') + '</div>'
    : '';

  const faq = [
    [`Как узнать об отключении по адресу?`, `Найдите свой адрес на карте или введите его в поиске выше — если по нему есть плановое или аварийное отключение, вы увидите дату и время начала и окончания работ.`],
    [`А отопление и горячая вода?`, `На этой странице и на карте показаны все виды отключений: холодная и горячая вода, свет, отопление — по каждому дому отдельно, с датой и причиной.`],
    [`Откуда данные?`, `Официальные источники (Павлодарэнерго, Павлодар-Водоканал, Павлодарские тепловые сети) плюс подтверждённые сообщения жителей BARJOK.`],
    [`Не вижу своё отключение — что делать?`, `Иногда авария случается раньше, чем поставщик её опубликует. Нажмите «Сообщить о проблеме» ниже — после проверки отключение появится на карте.`],
    [`Какие ещё города?`, `Сейчас полноценно работает Павлодар. Другие города Казахстана подключаются поэтапно — они уже видны в списке со статусом «Скоро».`],
  ];

  const updatedAt = snap.generatedAt ? new Date(snap.generatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const kkLoc = (city.names.kk && city.names.kk.locative) || (city.names.kk && city.names.kk.nominative) || loc;
  const leadText = `Вода, свет, отопление — весь статус по вашему дому в ${esc(loc)} за секунды. Введи свой, чтобы узнать подробности.`;
  const leadTextKk = `Су, жарық, жылыту — ${esc(kkLoc)} үйіңіз бойынша барлық мәртебе. Толығырақ білу үшін өз мекенжайыңызды енгізіңіз.`;

  const searchBoxHtml = `<p class="lead rv" data-kk="${leadTextKk}">${leadText}</p>
  <div class="cap-wrap rv" style="margin:26px auto 0">
    <form class="capture" action="${p}/map/${citySlug}" method="get" onsubmit="var v=this.querySelector('input').value.trim();if(v){location.href='${p}/map/${citySlug}?q='+encodeURIComponent(v);return false;}">
      <label class="field">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/></svg>
        <input id="capInput" type="text" name="address" placeholder="Улица и номер дома — напр. Естая 38" aria-label="Адрес" autocomplete="off" autocorrect="off" spellcheck="false" data-map-href="${p}/map/${citySlug}" data-kk-ph="Көше және үй нөмірі — мыс. Естай 38">
      </label>
      <button class="btn primary" type="submit" data-kk="Тексеру">Проверить</button>
    </form>
    <div class="lsug" id="lsug" role="listbox"></div>
  </div>
  ${updatedAt ? `<p class="cap-note rv" data-kk="${esc('Бүгін жаңартылды: ' + updatedAt)}">Обновлено сегодня в ${esc(updatedAt)}</p>` : ''}`;

  const miniStats = snap.ok ? buildMiniStats(snap) : '';
  const sampleAddress = (snap.ok && snap.houses && snap.houses[0] && snap.houses[0].address) || 'Естая, 38';
  const bodyHtml = `
    <div style="text-align:center;padding-top:6px">
      ${searchBoxHtml}
    </div>
    ${miniStats}
    ${mapPreviewHtml({ href: `${p}/map/${citySlug}` })}
    <div class="sec rv"><div class="eyebrow" data-kk="Қызметтер">Услуги</div><h2 data-kk="${esc(kkLoc + ' не тексеруге болады')}">Что можно проверить в ${esc(loc)}</h2></div>
    ${serviceCardsHtml}
    ${cardsHtml}
    ${futureHtml}
    ${stepsHtml({ addressSample: sampleAddress })}
    ${trustGridHtml()}
    ${reportCtaHtml({ href: `${p}/map/${citySlug}?report=1` })}
    ${faqAccordionHtml(faq, 'faq', { contactHref: `${p}/map/${citySlug}?report=1` })}
    ${otherCitiesHtml}
    ${ctaFinalHtml({ title: `Проверьте свой адрес в ${esc(loc)}`, titleKk: `Мекенжайыңызды ${esc(kkLoc)} тексеріңіз`, href: `${p}/map/${citySlug}` })}
  `;

  const html = renderSeoPage({
    lang, altHref: `${lang === 'kk' ? '' : '/kz'}/${citySlug}/`,
    hrefRu: getCitySeo(citySlug, 'ru').canonical, hrefKk: getCitySeo(citySlug, 'kk').canonical,
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
    h1Kk: `${esc(kkLoc)} су мен жарық ажыратулары бүгін`,
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
  res.status(200).send(lang === 'kk' ? bakeKk(html) : html);
}

async function renderService(req, res) {
  const citySlug = String((req.query || {}).city || '');
  const serviceSlug = String((req.query || {}).service || '');
  const city = getCity(citySlug);
  const service = getService(serviceSlug);
  if (!city || !service || city.status !== 'active') return renderNotFound(req, res);

  const lang = langOf(req);
  const p = lang === 'kk' ? '/kz' : '';
  const seo = getServiceSeo(citySlug, serviceSlug, lang);
  const snap = await computeSnapshot();
  const loc = city.names.ru.locative;
  const nom = city.names.ru.nominative;

  let filterFn;
  if (service.resource) filterFn = (o) => o.resource === service.resource;
  else if (service.typeFilter) filterFn = (o) => o.type === service.typeFilter;
  else if (service.waterGroup) filterFn = (o) => o.resource === 'cold_water' || o.resource === 'hot_water' || o.resource === 'water';
  else filterFn = () => true;

  const allHouses = snap.houses || [];
  const matchedCount = snap.ok ? countMatching(allHouses, filterFn) : 0;
  // Дома, отфильтрованные под конкретную услугу (только подходящие outages) —
  // тот же группированный паттерн улиц/табов, что и на странице города, но
  // уже скоуплен под ресурс/тип этой конкретной услуги.
  const scopedHouses = allHouses
    .map((h) => ({ ...h, outages: (h.outages || []).filter((o) => filterFn(o, h)) }))
    .filter((h) => h.outages.length);

  const cardsHtml = snap.ok && !service.addressSearch ? groupedOutagesHtml(scopedHouses, 'current', citySlug, {
    eyebrow: 'Прямо сейчас', title: `Текущие отключения — ${service.label}`,
    intro: 'Активные отключения — сгруппированы по улице. Нажмите на улицу, чтобы открыть её на карте.',
    idPrefix: 'svcCurrent', lang,
  }) : '';
  const futureHtml = snap.ok && !service.addressSearch ? groupedOutagesHtml(scopedHouses, 'future', citySlug, {
    eyebrow: 'Заранее', title: `Предстоящие отключения — ${service.label}`,
    intro: 'Плановые работы, известные заранее — сгруппированы по улице. Нажмите на улицу, чтобы открыть её на карте.',
    idPrefix: 'svcFuture', lang,
  }) : '';

  const kkLoc = (city.names.kk && city.names.kk.locative) || (city.names.kk && city.names.kk.nominative) || loc;
  const kkLabel = service.labelKk || service.label;
  const relatedLinks = [
    ['Все отключения ' + nom, `${p}/${citySlug}/`, 'Барлық ажыратулар ' + esc(nom)], ['Отключение света', `${p}/${citySlug}/svet/`, 'Жарық ажыратуы'],
    ['Горячая вода', `${p}/${citySlug}/goryachaya-voda/`, 'Ыстық су'], ['Плановые отключения', `${p}/${citySlug}/planovye-otklyucheniya/`, 'Жоспарлы ажыратулар'],
    ['Карта ' + nom, `${p}/map/${citySlug}`, 'Карта ' + esc(nom)],
  ].filter(([, url]) => !url.endsWith(`/${serviceSlug}/`));

  const updatedAt = snap.generatedAt ? new Date(snap.generatedAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : null;
  const leadText = matchedCount
    ? `Сейчас в ${esc(loc)} <b>${matchedCount}</b> активных случаев по категории «${esc(service.label)}». Введи свой адрес, чтобы узнать подробности.`
    : `Активных случаев по категории «${esc(service.label)}» в ${esc(loc)} сейчас не найдено. Введи адрес — проверим, нет ли отключения именно по нему.`;
  const leadTextKk = matchedCount
    ? `Қазір ${esc(kkLoc)} «${esc(kkLabel)}» санаты бойынша <b>${matchedCount}</b> белсенді жағдай бар. Толығырақ білу үшін мекенжайыңызды енгізіңіз.`
    : `${esc(kkLoc)} «${esc(kkLabel)}» санаты бойынша қазір белсенді жағдай табылмады. Мекенжайды енгізіңіз — нақты сол бойынша ажырату бар-жоғын тексереміз.`;

  const searchBoxHtml = `<p class="lead rv" data-kk-html="${esc(leadTextKk)}">${leadText}</p>
  <div class="cap-wrap rv" style="margin:26px auto 0">
    <form class="capture" action="${p}/map/${citySlug}" method="get" onsubmit="var v=this.querySelector('input').value.trim();if(v){location.href='${p}/map/${citySlug}?q='+encodeURIComponent(v);return false;}">
      <label class="field">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/></svg>
        <input id="capInput" type="text" name="address" placeholder="Улица и номер дома — напр. Естая 38" aria-label="Адрес" autocomplete="off" autocorrect="off" spellcheck="false" data-map-href="${p}/map/${citySlug}" data-kk-ph="Көше және үй нөмірі — мыс. Естай 38">
      </label>
      <button class="btn primary" type="submit" data-kk="Тексеру">Проверить</button>
    </form>
    <div class="lsug" id="lsug" role="listbox"></div>
  </div>
  ${updatedAt ? `<p class="cap-note rv" data-kk="${esc('Бүгін жаңартылды: ' + updatedAt)}">Обновлено сегодня в ${esc(updatedAt)}</p>` : ''}`;

  const miniStats = snap.ok ? buildMiniStats(snap) : '';
  const sampleAddress = (scopedHouses[0] && scopedHouses[0].address) || (snap.ok && snap.houses && snap.houses[0] && snap.houses[0].address) || 'Естая, 38';

  const bodyHtml = `
    <div style="text-align:center;padding-top:6px">
      ${searchBoxHtml}
    </div>
    ${miniStats}
    ${mapPreviewHtml({ href: `${p}/map/${citySlug}` })}
    ${cardsHtml}
    ${futureHtml}
    ${stepsHtml({ addressSample: sampleAddress })}
    ${trustGridHtml()}
    ${faqAccordionHtml(FAQ_SERVICE[serviceSlug] || FAQ_HOME, 'faq', { contactHref: `${p}/map/${citySlug}?report=1` })}
    <div class="sec rv"><div class="eyebrow" data-kk="Тағы">Ещё</div><h2 data-kk="Байланысты беттер">Связанные страницы</h2></div>
    <div class="related-links">${relatedLinks.map(([name, url, nameKk]) => `<a href="${url}"${nameKk ? ` data-kk="${esc(nameKk)}"` : ''}>${esc(name)}</a>`).join('')}</div>
    ${ctaFinalHtml({ title: `Проверьте «${esc(service.label)}» по своему адресу`, titleKk: `«${esc(kkLabel)}» дегенді мекенжайыңыз бойынша тексеріңіз`, href: `${p}/map/${citySlug}` })}
  `;

  const html = renderSeoPage({
    lang, altHref: `${lang === 'kk' ? '' : '/kz'}/${citySlug}/${serviceSlug}/`,
    hrefRu: getServiceSeo(citySlug, serviceSlug, 'ru').canonical, hrefKk: getServiceSeo(citySlug, serviceSlug, 'kk').canonical,
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
    h1Kk: `${esc(kkLoc)} — ${esc(kkLabel)} ажыратуы`,
    pillAnnText: 'Обновляется каждые несколько часов',
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
  res.status(200).send(lang === 'kk' ? bakeKk(html) : html);
}

async function renderAbout(req, res) {
  const seo = getAboutSeo();

  const painItems = [
    ['Информация разбросана', 'У энергосбыта, водоканала и тепловых сетей — свои сайты, свой формат объявлений и разное качество обновления. Чтобы узнать, что происходит в городе, нужно проверять три-четыре источника вместо одного.'],
    ['Не видно свой дом', 'Официальные объявления пишут «улица Естая» — а не «какие именно дома». Люди не понимают, коснётся ли отключение их квартиры, пока не останутся без воды или света.'],
    ['Авария случается быстрее новости', 'Пока источник опубликует информацию, соседи уже часами сидят без воды в чатах ЖК и гадают, авария это или сосед перекрыл стояк.'],
  ];
  const painHtml = sectionHeadHtml('Какую боль решаем', 'Отключения есть всегда — понятной информации о них почти никогда',
    'BARJOK не производит отключения и не может их отменить. Мы делаем то, что должно было существовать с самого начала: один понятный источник, который показывает, что происходит именно с вашим домом.') + `
  <div class="pain-grid">
    ${painItems.map(([title, text], i) => `<div class="pain-item rv">
      <span class="k">${i + 1}</span>
      <div><h3>${esc(title)}</h3><p>${esc(text)}</p></div>
    </div>`).join('')}
  </div>`;

  const storyHtml = timelineHtml([
    { year: 'Идея', status: 'done', title: 'Одни и те же вопросы в чатах ЖК', text: 'Каждый день в чатах Павлодара повторялись одни вопросы: «а у вас есть вода?», «когда дадут свет?». Решили сделать так, чтобы ответ был виден сразу — без вопроса в чат.' },
    { year: 'Разработка', status: 'done', title: 'Парсер данных поставщиков', text: 'Написали парсер, который каждые несколько часов собирает объявления Павлодарэнерго, Водоканала и тепловых сетей и превращает список улиц в конкретные дома на карте.' },
    { year: 'Запуск', status: 'done', title: 'Карта и страницы по Павлодару', text: 'Запустили живую карту и страницы по городу и услугам — первому городу, где сервис работает полноценно: проверка по адресу, текущие и будущие отключения.' },
    { year: 'Сейчас', status: 'active', title: 'Точность данных и обратная связь', text: 'Донастраиваем привязку адресов по каждому дому и добавляем возможность сообщить о проблеме, которую поставщик ещё не опубликовал.' },
  ], { eyebrow: 'История', intro: 'Коротко о том, как появился BARJOK.' });

  const roadmapHtml = timelineHtml([
    { year: '2026', status: 'active', title: 'Павлодар — основной город', text: 'Отладка точности данных, разбор адресов по каждому дому и обратная связь от жителей — фундамент, на котором строится всё остальное.' },
    { year: '2027', status: 'next', title: 'Следующие города Казахстана', text: 'Подключаем крупные города по той же архитектуре — без необходимости переписывать сервис заново под каждый город.' },
    { year: '2028', status: 'next', title: 'Единая система по всей стране', text: 'Один интерфейс и одни правила для любого города Казахстана — независимо от того, сколько открытых данных публикует местный поставщик.' },
    { year: '2029', status: 'next', title: 'Подписка на свой дом', text: 'Персональные уведомления: сообщаем о плановых работах и авариях по вашему дому заранее — до отключения, а не после. Плюс возможность сообщить о проблеме прямо со своего адреса.' },
  ], { eyebrow: 'Куда движемся', title: 'Цели на ближайшие 3 года', intro: 'План простой: подключить все города Казахстана к единой системе, чтобы каждый житель видел статус своего дома и мог и сообщить о проблеме, и получать уведомления о ней.' });

  const contactHtml = `<section class="contact rv">
    <div class="in">
      <div>
        <h2>Автор и контакты</h2>
        <p>BARJOK делает Артур Михейлис. Если есть вопрос, предложение по городу или хотите быть частью проекта — пишите напрямую, отвечаю сам.</p>
      </div>
      <div class="contact-btns">
        <a class="cbtn" href="https://wa.me/77083445023" target="_blank" rel="noopener">
          <span class="ci" style="background:var(--wa)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.6.2-.2.3-.7.9-.8 1-.2.2-.3.2-.6.1-1.7-.9-2.8-1.5-4-3.4-.3-.5.3-.5.9-1.6.1-.2 0-.4 0-.5 0-.2-.6-1.6-.9-2.2-.2-.5-.4-.5-.6-.5h-.5c-.2 0-.5.1-.7.3-.9.9-1.1 2-1.1 2.2 0 .3.9 2.2 2.6 4 2.4 2.6 4.3 3.1 5 3.3.8.2 1.5.2 2.1.1.6-.1 1.7-.7 2-1.4.2-.7.2-1.2.2-1.4 0-.1-.2-.2-.5-.3zM12 2C6.5 2 2 6.5 2 12c0 1.8.5 3.4 1.3 4.9L2 22l5.3-1.4c1.4.8 3 1.2 4.7 1.2 5.5 0 10-4.5 10-10S17.5 2 12 2z"/></svg></span>
          <span class="ct"><span class="l">WhatsApp</span><span class="v">+7 708 344 50 23</span></span>
          <svg class="arw" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </a>
        <a class="cbtn" href="https://t.me/artumikh" target="_blank" rel="noopener">
          <span class="ci" style="background:var(--tg)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.9 4.3 18.7 19c-.2 1-.9 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.7-7.9c.4-.3-.1-.5-.6-.2L6.5 13.1l-4.6-1.4c-1-.3-1-1 .2-1.5L20.6 3c.8-.3 1.5.2 1.3 1.3z"/></svg></span>
          <span class="ct"><span class="l">Telegram</span><span class="v">@artumikh</span></span>
          <svg class="arw" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </a>
        <a class="cbtn" href="https://instagram.com/barjok.kz" target="_blank" rel="noopener">
          <span class="ci" style="background:linear-gradient(135deg,#f58529,#dd2a7b,#8134af)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"/></svg></span>
          <span class="ct"><span class="l">Instagram</span><span class="v">@barjok.kz</span></span>
          <svg class="arw" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </a>
      </div>
    </div>
  </section>`;

  const bodyHtml = `
    ${painHtml}
    ${storyHtml}
    ${roadmapHtml}
    ${trustGridHtml()}
    ${contactHtml}
    ${ctaFinalHtml({ title: 'Сейчас работает Павлодар', text: 'Откройте карту и проверьте свой адрес — вода, свет, отопление за 5 секунд.', href: '/map/pavlodar' })}
  `;

  const html = renderSeoPage({
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
    // Страница скрыта из навигации/sitemap по просьбе владельца — остаётся
    // доступной по прямой ссылке /about/, но не должна попадать в индекс.
    noindex: true,
    breadcrumbs: [{ name: BRAND, url: `${ORIGIN}/` }, { name: 'О проекте' }],
    bodyHtml,
    jsonLd: [
      organizationJsonLd(),
      webPageJsonLd({ url: seo.canonical, title: seo.title, description: seo.description }),
      breadcrumbsJsonLd([{ name: BRAND, url: `${ORIGIN}/` }, { name: 'О проекте', url: seo.canonical }]),
    ],
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
  res.status(200).send(html);
}

/*
 * /partners/ — B2B/B2G-оффер для коммунальных служб и городских организаций
 * (см. ТЗ на страницу Partners). Статическая страница, без live-данных и без
 * казахской версии на первом этапе — контент собран в partners-page.js.
 */
async function renderPartners(req, res) {
  const title = 'Партнёрам — быстрее сообщайте жителям об отключениях | BARJOK';
  const description = 'BARJOK помогает коммунальным службам и городским организациям быстрее доносить информацию об отключениях до жителей затронутых домов и снижает нагрузку на диспетчерские.';
  const canonical = `${ORIGIN}/partners/`;

  const html = renderSeoPage({
    title, description, canonical,
    h1: 'Сообщайте жителям об отключениях быстрее',
    noindex: false,
    breadcrumbs: [{ name: BRAND, url: `${ORIGIN}/` }, { name: 'Партнёрам' }],
    bodyHtml: renderPartnersBody(),
    jsonLd: [
      organizationJsonLd(),
      webPageJsonLd({ url: canonical, title, description }),
      breadcrumbsJsonLd([{ name: BRAND, url: `${ORIGIN}/` }, { name: 'Партнёрам', url: canonical }]),
    ],
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
  res.status(200).send(html);
}

/*
 * Catch-all 404 — ЕДИНСТВЕННЫЙ обработчик 404 на проекте. Статического
 * /404.html нет намеренно (был — удалён как недостижимый): Vercel не
 * подхватывает его автоматически, когда в vercel.json есть rewrites — проверено
 * на живом деплое, на несуществующий путь отдавался голый текст "Not found" без
 * стилей. Ловится через rewrite "/(.*)" ПОСЛЕДНИМ пунктом в vercel.json —
 * то есть только для путей, которые не совпали ни с одним более ранним
 * правилом и не являются существующим статическим файлом (Vercel резолвит
 * реальные файлы раньше rewrites, поэтому barjok.svg/shared.css/map/data.json
 * и т.п. этим catch-all не задевает).
 */
async function renderNotFound(req, res) {
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Страница не найдена — ${BRAND}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root{--bg:#f3f4f6;--canvas:#ffffff;--ink:#15171c;--ink-2:#565d6b;--ink-3:#8b919d;
    --line:#e6e8ec;--accent:#2f6bed;--accent-ink:#1c4fc4;--sans:'Manrope',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:var(--sans);color:var(--ink);background:var(--bg);min-height:100dvh;
    display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;
    background-image:radial-gradient(rgba(21,32,58,.055) 1px, transparent 1px);background-size:26px 26px;background-position:-13px -13px}
  a{color:inherit;text-decoration:none}
  .logo{display:inline-flex;align-items:center;gap:10px;margin-bottom:40px}
  .logo img{height:28px;width:auto;display:block}
  .code{font-size:clamp(64px,14vw,120px);font-weight:800;letter-spacing:-.04em;line-height:1;color:var(--accent);
    text-shadow:0 12px 30px rgba(47,107,237,.18)}
  h1{font-size:clamp(22px,3.4vw,30px);font-weight:800;letter-spacing:-.02em;margin-top:14px;max-width:20ch}
  p{color:var(--ink-2);font-size:15.5px;margin-top:12px;max-width:44ch;line-height:1.55}
  .actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-top:28px}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-weight:700;font-size:14px;
    border-radius:999px;padding:12px 22px;border:1px solid var(--line);cursor:pointer;transition:.15s}
  .btn.primary{background:var(--accent);color:#fff;border-color:transparent;box-shadow:0 6px 16px -6px rgba(47,107,237,.6)}
  .btn.primary:hover{background:var(--accent-ink)}
  .btn.ghost{background:var(--canvas);color:var(--ink)}
  .btn.ghost:hover{border-color:var(--ink-3)}
</style>
</head>
<body>
  <a class="logo" href="/"><img src="/barjok.svg" alt="${BRAND}"></a>
  <div class="code">404</div>
  <h1>Такой страницы нет</h1>
  <p>Возможно, адрес устарел или введён с опечаткой. Отключения по вашему дому всё ещё можно проверить на карте.</p>
  <div class="actions">
    <a class="btn primary" href="/map/pavlodar">Открыть карту</a>
    <a class="btn ghost" href="/">На главную</a>
  </div>
  <script defer src="/_vercel/insights/script.js"></script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.status(404).send(html);
}

async function renderSitemap(req, res) {
  const snap = await computeSnapshot();
  const now = snap.generatedAt || new Date().toISOString();
  const urls = [
    { loc: `${ORIGIN}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${ORIGIN}/map/`, changefreq: 'daily', priority: '0.5' },
    { loc: `${ORIGIN}/kz/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${ORIGIN}/partners/`, changefreq: 'monthly', priority: '0.6' },
  ];
  for (const city of activeCities()) {
    urls.push({ loc: `${ORIGIN}/${city.slug}/`, changefreq: 'hourly', priority: '0.9' });
    urls.push({ loc: `${ORIGIN}/map/${city.slug}/`, changefreq: 'hourly', priority: '0.9' });
    urls.push({ loc: `${ORIGIN}/kz/${city.slug}/`, changefreq: 'hourly', priority: '0.9' });
    for (const service of SERVICES) {
      urls.push({ loc: `${ORIGIN}/${city.slug}/${service.slug}/`, changefreq: 'hourly', priority: '0.8' });
      urls.push({ loc: `${ORIGIN}/kz/${city.slug}/${service.slug}/`, changefreq: 'hourly', priority: '0.8' });
    }
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

/*
 * ЖИВОЙ СЛОЙ отключений из Supabase — то, что подтверждено в админке, БЕЗ ожидания парсера.
 *
 * Зачем: map/data.json пересобирается парсером раз в час, поэтому подтверждение в
 * админке появлялось на карте только со следующим прогоном (до ~60 минут + деплой).
 * Владелец справедливо ждал, что ручное действие видно сразу. Карта грузит этот
 * эндпоинт сразу после data.json и накладывает поверх.
 *
 * ⚠️ Координат в таблице incidents НЕТ, и мы их тут НЕ ищем: подавляющее большинство
 * подтверждаемых домов уже есть в data.json (официальные наряды), поэтому карта
 * сливает запись по адресу и берёт координаты готового дома. Так эндпоинт остаётся
 * дешёвым (один SELECT, без геокодера и без реестра домов на 2.7 МБ в лямбде).
 *
 * ⚠️ Живёт ВЕТКОЙ pages.js, а не отдельным api/live.js: на Vercel Hobby лимит
 * 12 функций, занято 11 — свободный слот бережём (см. barjok.md, «Ограничения платформы»).
 */
async function renderLive(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const { fetchLiveIncidents } = require('./_lib/live-incidents');
  const { active, restored } = await fetchLiveIncidents();
  return res.status(200).json({ ok: true, updated: new Date().toISOString(), active, restored });
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const page = String((req.query || {}).page || '');
  try {
    if (page === 'live') return await renderLive(req, res);
    if (page === 'home') return await renderHome(req, res);
    if (page === 'maphub') return await renderMapHub(req, res);
    if (page === 'city') return await renderCity(req, res);
    if (page === 'service') return await renderService(req, res);
    if (page === 'about') return await renderAbout(req, res);
    if (page === 'partners') return await renderPartners(req, res);
    if (page === 'sitemap') return await renderSitemap(req, res);
    if (page === 'notfound') return await renderNotFound(req, res);
    return await renderNotFound(req, res);
  } catch (e) {
    console.error('pages.js failed:', e.message);
    res.status(500).send('Internal error');
  }
};
