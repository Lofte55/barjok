/*
 * Общий SSR-каркас для всех SEO-страниц города/сервиса (§10, §25 SEO-ТЗ).
 * Один визуальный стиль, единая шапка/футер/breadcrumbs — конкретные страницы
 * передают только свой bodyHtml + метаданные.
 */
const BRAND = 'BARJOK';
const ORIGIN = 'https://barjok.kz';
const { activeCities } = require('./seo-cities');

const esc = (s) => String(s == null ? '' : s).replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));

function navHtml(currentCitySlug) {
  const cities = activeCities();
  const links = cities.map((c) =>
    `<a href="/${c.slug}/"${c.slug === currentCitySlug ? ' aria-current="page"' : ''}>${esc(c.names.ru.nominative)}</a>`
  ).join('');
  return `<nav class="topnav"><a class="logo" href="/">${BRAND}</a><div class="cities">${links}</div></nav>`;
}

function breadcrumbsHtml(items) {
  // items: [{name, url}] — последний элемент без ссылки (текущая страница)
  const parts = items.map((it, i) => {
    const isLast = i === items.length - 1;
    return isLast ? `<span aria-current="page">${esc(it.name)}</span>` : `<a href="${esc(it.url)}">${esc(it.name)}</a>`;
  });
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">${parts.join(' <span class="sep">/</span> ')}</nav>`;
}

function breadcrumbsJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem', position: i + 1, name: it.name, item: it.url,
    })),
  };
}

function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: BRAND,
    url: `${ORIGIN}/`,
    logo: `${ORIGIN}/barjok.svg`,
  };
}

function webPageJsonLd({ url, title, description }) {
  return { '@context': 'https://schema.org', '@type': 'WebPage', url, name: title, description };
}

/*
 * opts: { title, description, canonical, h1, currentCitySlug, breadcrumbs:[{name,url}],
 *         bodyHtml, jsonLd: [obj,...], noindex: bool, ogImage }
 */
function renderSeoPage(opts) {
  const jsonLdBlocks = (opts.jsonLd || []).map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`).join('\n');
  return `<!DOCTYPE html>
<html lang="ru-KZ">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(opts.canonical)}">
${opts.noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta property="og:site_name" content="${BRAND}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:url" content="${esc(opts.canonical)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${esc(opts.ogImage || ORIGIN + '/og-cover.png')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(opts.title)}">
<meta name="twitter:description" content="${esc(opts.description)}">
${jsonLdBlocks}
<style>
  :root { --bg:#f6f7f9; --panel:#fff; --ink:#12161c; --ink-2:#5a6472; --ink-3:#8a94a3; --line:#e7eaef; --brand:#1f6feb; --brand-ink:#0f4fbf; }
  * { box-sizing:border-box; }
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif; background:var(--bg); color:var(--ink); }
  a { color:var(--brand); text-decoration:none; }
  a:hover { text-decoration:underline; }
  .topnav { display:flex; align-items:center; gap:20px; padding:16px 20px; background:var(--panel); border-bottom:1px solid var(--line); }
  .topnav .logo { font-weight:800; font-size:18px; color:var(--ink); text-decoration:none; }
  .topnav .cities { display:flex; gap:14px; font-size:14px; font-weight:600; }
  .topnav .cities a[aria-current] { color:var(--brand-ink); }
  .wrap { max-width:900px; margin:0 auto; padding:20px; }
  .breadcrumbs { font-size:12.5px; color:var(--ink-3); margin-bottom:14px; }
  .breadcrumbs .sep { margin:0 4px; }
  h1 { font-size:clamp(24px,4vw,36px); font-weight:800; letter-spacing:-.02em; margin:0 0 6px; }
  .updated { font-size:13px; color:var(--ink-3); margin-bottom:18px; }
  .status-block { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:18px 20px; margin-bottom:20px; line-height:1.55; }
  .status-block b { color:var(--ink); }
  .search-box { display:flex; gap:8px; margin-bottom:22px; }
  .search-box input { flex:1; height:46px; border:1px solid var(--line); border-radius:999px; padding:0 18px; font-size:15px; }
  .search-box button { height:46px; padding:0 22px; border:0; border-radius:999px; background:var(--brand); color:#fff; font-weight:700; cursor:pointer; }
  .cards { display:grid; gap:10px; margin-bottom:22px; }
  article.outage-card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:14px 16px; }
  article.outage-card h3 { margin:0 0 6px; font-size:15px; }
  article.outage-card dl { display:grid; grid-template-columns:auto 1fr; gap:2px 10px; margin:8px 0 0; font-size:13px; }
  article.outage-card dt { color:var(--ink-3); }
  article.outage-card dd { margin:0; }
  .section-title { font-size:18px; font-weight:800; margin:28px 0 12px; }
  .related-links { display:flex; flex-wrap:wrap; gap:10px 18px; font-size:14px; }
  .city-cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:14px; margin:22px 0; }
  .city-card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:20px; text-decoration:none; color:var(--ink); }
  .city-card.disabled { opacity:.5; pointer-events:none; }
  .city-card b { font-size:18px; display:block; margin-bottom:4px; }
  .city-card .soon { font-size:11px; text-transform:uppercase; color:var(--ink-3); }
  footer.site-footer { text-align:center; padding:30px 20px; color:var(--ink-3); font-size:13px; border-top:1px solid var(--line); margin-top:30px; }
  details.faq { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:12px 16px; margin-bottom:8px; }
  details.faq summary { font-weight:700; cursor:pointer; }
</style>
</head>
<body>
${navHtml(opts.currentCitySlug)}
<div class="wrap">
${opts.breadcrumbs ? breadcrumbsHtml(opts.breadcrumbs) : ''}
<h1>${esc(opts.h1)}</h1>
${opts.bodyHtml}
</div>
<footer class="site-footer">© 2026 ${BRAND} · Живые данные об отключениях в городах Казахстана</footer>
</body>
</html>`;
}

module.exports = { renderSeoPage, breadcrumbsJsonLd, organizationJsonLd, webPageJsonLd, esc, navHtml };
