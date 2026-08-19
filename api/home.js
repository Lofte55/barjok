const { allCities } = require('./_lib/seo-cities');
const { getHomeSeo, BRAND, ORIGIN } = require('./_lib/seo');
const { renderSeoPage, organizationJsonLd, esc } = require('./_lib/seo-layout');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const seo = getHomeSeo();
  const cities = allCities();

  const cityCardsHtml = `<div class="city-cards">${cities.map((c) => {
    const active = c.status === 'active';
    const nom = c.names.ru.nominative;
    return active
      ? `<a class="city-card" href="/${c.slug}/"><b>Отключения воды и света в ${esc(nom)}</b></a>`
      : `<div class="city-card disabled"><b>${esc(nom)}</b><span class="soon">Скоро</span></div>`;
  }).join('')}</div>`;

  const websiteJsonLd = {
    '@context': 'https://schema.org', '@type': 'WebSite', name: BRAND, url: `${ORIGIN}/`,
  };

  const bodyHtml = `
    <p style="color:var(--ink-2);font-size:15px;max-width:60ch">${BRAND} показывает отключения воды, света, горячей воды и отопления по адресам в городах Казахстана. Выберите город и проверьте свой дом.</p>
    <div class="section-title">Города</div>
    ${cityCardsHtml}
    <div class="section-title">Как работает ${esc(BRAND)}</div>
    <p style="max-width:60ch;line-height:1.6">Введите адрес — увидите все отключения по своему дому: вода, свет, отопление. Дата, время, причина. Данные собираются из официальных источников (энергосбыт, водоканал, теплосети) каждые несколько часов и подтверждаются сообщениями жителей.</p>
    <div class="section-title">Что отслеживаем</div>
    <p style="max-width:60ch">Холодная и горячая вода, электричество, отопление — плановые и аварийные отключения, с адресами, датами и причинами.</p>
  `;

  const html = renderSeoPage({
    title: seo.title, description: seo.description, canonical: seo.canonical, h1: seo.h1,
    bodyHtml,
    jsonLd: [organizationJsonLd(), websiteJsonLd],
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.status(200).send(html);
};
