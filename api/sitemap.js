/*
 * sitemap.xml — только реально индексируемые URL (§40). Города status=soon и их
 * страницы НЕ включаются. Параметры/поиск/фильтры карты — не отдельные URL, их
 * тут нет по определению (генерируется из City Config, не из query-строк).
 */
const { activeCities, SERVICES } = require('./_lib/seo-cities');
const { computeSnapshot } = require('./_lib/city-stats');

module.exports = async (req, res) => {
  const ORIGIN = 'https://barjok.kz';
  // lastmod = момент реального snapshot данных (§41), а не время запроса sitemap.
  const snap = await computeSnapshot();
  const now = snap.generatedAt || new Date().toISOString();
  const urls = [
    { loc: `${ORIGIN}/`, changefreq: 'daily', priority: '1.0' },
    { loc: `${ORIGIN}/map/`, changefreq: 'daily', priority: '0.5' },
  ];
  for (const city of activeCities()) {
    urls.push({ loc: `${ORIGIN}/${city.slug}/`, changefreq: 'hourly', priority: '0.9' });
    urls.push({ loc: `${ORIGIN}/map/${city.slug}`, changefreq: 'hourly', priority: '0.9' });
    for (const service of SERVICES) {
      urls.push({ loc: `${ORIGIN}/${city.slug}/${service.slug}/`, changefreq: 'hourly', priority: '0.8' });
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
};
