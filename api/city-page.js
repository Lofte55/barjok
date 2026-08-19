const { getCity, SERVICES, activeCities } = require('./_lib/seo-cities');
const { getCitySeo, BRAND, ORIGIN } = require('./_lib/seo');
const { renderSeoPage, breadcrumbsJsonLd, organizationJsonLd, webPageJsonLd, esc } = require('./_lib/seo-layout');
const { computeSnapshot } = require('./_lib/city-stats');
const { outageCardsHtml, statusBlockHtml } = require('./_lib/seo-cards');

const SERVICE_CARDS = [
  ['voda', 'Вода'], ['svet', 'Свет'], ['otoplenie', 'Отопление'],
  ['planovye-otklyucheniya', 'Плановые отключения'], ['avariynye-otklyucheniya', 'Аварийные отключения'], ['po-adresu', 'Проверить по адресу'],
];

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const citySlug = String((req.query || {}).city || '');
  const city = getCity(citySlug);
  if (!city || city.status !== 'active') return res.status(404).send('Not found');

  const seo = getCitySeo(citySlug);
  const snap = await computeSnapshot();
  const loc = city.names.ru.locative;
  const nom = city.names.ru.nominative;

  const statusHtml = statusBlockHtml({
    locative: loc,
    activeOutages: snap.activeOutages || 0,
    affectedAddresses: snap.affectedAddresses || 0,
    electricityAffected: snap.electricityAffected || 0,
    hotWaterAffected: snap.hotWaterAffected || 0,
    coldWaterAffected: snap.coldWaterAffected || 0,
    generatedAt: snap.generatedAt,
    ok: snap.ok,
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
    [`Как узнать об отключении воды по адресу в ${esc(loc)}?`, `Найдите свой адрес на карте или введите его в поиске выше — если по нему есть плановое или аварийное отключение, вы увидите дату и время начала и окончания работ.`],
    [`Откуда берутся данные об отключениях?`, `Официальные источники (Павлодарэнерго, Павлодар-Водоканал, Павлодарские тепловые сети) плюс подтверждённые сообщения жителей BARJOK.`],
  ];
  const faqHtml = '<div class="section-title">Частые вопросы</div>' + faq.map(([q, a]) =>
    `<details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('');

  const searchBoxHtml = `<form class="search-box" action="/map/${citySlug}" method="get">
    <input type="text" name="address" placeholder="Улица и номер дома" aria-label="Адрес">
    <button type="submit">Проверить</button>
  </form>`;

  const bodyHtml = `
    ${statusHtml}
    ${searchBoxHtml}
    <div class="section-title">Услуги</div>
    ${serviceCardsHtml}
    ${cardsHtml ? '<div class="section-title">Текущие отключения</div>' + cardsHtml : ''}
    ${futureHtml}
    <div class="section-title">Карта</div>
    <p><a href="/map/${citySlug}">Открыть карту отключений ${esc(loc)} →</a></p>
    <div class="section-title">Источники данных</div>
    <p>Павлодарэнерго, Павлодар-Водоканал, Павлодарские тепловые сети — обновление каждые 3 часа. Часть отключений подтверждается сообщениями жителей BARJOK.</p>
    ${faqHtml}
    ${otherCitiesHtml}
  `;

  const html = renderSeoPage({
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
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
};
