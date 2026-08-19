/*
 * Общий SSR-каркас для SEO-страниц — использует ТОТ ЖЕ визуальный язык, что и
 * landing/index.html (landing/shared.css: Manrope, --accent #2f6bed, карточки,
 * hero, stat-row, feat-grid, FAQ-аккордеон и т.д.), а не отдельный минималистичный
 * стиль. Правило: новые SEO-страницы дополняют дизайн лендинга, а не заменяют его
 * на голый список ссылок.
 */
const BRAND = 'BARJOK';
const ORIGIN = 'https://barjok.kz';
const { activeCities, allCities } = require('./seo-cities');

const esc = (s) => String(s == null ? '' : s).replace(/[<&>"]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;', '"': '&quot;' }[c]));

function navHtml(currentCitySlug) {
  const cities = allCities();
  const cityMenuItems = cities.map((c) => {
    const active = c.status === 'active';
    return active
      ? `<button class="${c.slug === currentCitySlug ? 'on' : ''}" onclick="location.href='/${c.slug}/'"><span>${esc(c.names.ru.nominative)}</span></button>`
      : `<button disabled><span>${esc(c.names.ru.nominative)}</span><span class="soon">скоро</span></button>`;
  }).join('');
  const current = currentCitySlug ? cities.find((c) => c.slug === currentCitySlug) : null;
  const cityLabel = current ? current.names.ru.nominative : 'Города';

  return `<header class="nav" id="nav">
  <div class="wrap nav-in">
    <a class="logo" href="/"><img class="logo-img" src="/barjok.svg" alt="BARJOK" width="105" height="26"></a>
    <div class="nav-links">
      <a href="/pavlodar/">Павлодар</a>
      <a href="/map/">Карта</a>
      <a href="/#faq">Вопросы</a>
    </div>
    <div class="nav-right">
      <div class="city" id="citySel">
        <button class="city-btn" id="cityBtn" type="button" aria-haspopup="true">
          <svg class="pin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
          <span>${esc(cityLabel)}</span>
          <svg class="chev" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <div class="city-menu">${cityMenuItems}</div>
      </div>
      <a class="btn primary nav-cta" href="/map/pavlodar">Открыть карту</a>
      <button class="burger" id="burger" aria-expanded="false" aria-label="Меню"><span></span><span></span><span></span></button>
    </div>
    <div class="mobile-menu" id="mobileMenu">
      <a href="/pavlodar/">Павлодар</a>
      <a href="/map/">Карта</a>
      <a class="btn primary" href="/map/pavlodar">Открыть карту</a>
    </div>
  </div>
</header>
<script>
(function(){
  var city=document.getElementById('citySel'),cityBtn=document.getElementById('cityBtn');
  if(cityBtn)cityBtn.addEventListener('click',function(e){e.stopPropagation();city.dataset.open=city.dataset.open==='1'?'0':'1';});
  document.addEventListener('click',function(){if(city)city.dataset.open='0';});
  var nav=document.getElementById('nav');
  addEventListener('scroll',function(){nav.classList.toggle('stuck',scrollY>10);},{passive:true});
  var burger=document.getElementById('burger'),mm=document.getElementById('mobileMenu');
  if(burger)burger.addEventListener('click',function(e){e.stopPropagation();var open=nav.classList.toggle('menu-open');burger.setAttribute('aria-expanded',open?'true':'false');});
})();
</script>`;
}

function footerHtml() {
  return `<footer>
  <div class="wrap">
    <div class="foot-top">
      <div>
        <a class="logo" href="/"><img class="logo-img" src="/barjok.svg" alt="BARJOK" width="105" height="26"></a>
        <p>Живая карта отключений воды, света и отопления в городах Казахстана. Данные от официальных поставщиков, обновление каждые несколько часов.</p>
      </div>
      <div class="foot-links">
        <div class="fcol">
          <h4>Города</h4>
          <a href="/pavlodar/">Павлодар</a>
        </div>
        <div class="fcol">
          <h4>Сервисы</h4>
          <a href="/pavlodar/voda/">Вода</a>
          <a href="/pavlodar/svet/">Свет</a>
          <a href="/pavlodar/otoplenie/">Отопление</a>
        </div>
        <div class="fcol">
          <h4>Карта</h4>
          <a href="/map/pavlodar">Открыть карту</a>
        </div>
      </div>
    </div>
    <div class="foot-bot">
      <span>© 2026 ${BRAND} · Казахстан</span>
    </div>
  </div>
</footer>`;
}

function breadcrumbsHtml(items) {
  if (!items || !items.length) return '';
  const parts = items.map((it, i) => {
    const isLast = i === items.length - 1;
    return isLast ? `<span aria-current="page">${esc(it.name)}</span>` : `<a href="${esc(it.url)}">${esc(it.name)}</a>`;
  });
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.join(' <span class="sep">/</span> ')}</nav>`;
}

function breadcrumbsJsonLd(items) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: it.url })),
  };
}
function organizationJsonLd() {
  return { '@context': 'https://schema.org', '@type': 'Organization', name: BRAND, url: `${ORIGIN}/`, logo: `${ORIGIN}/barjok.svg` };
}
function webPageJsonLd({ url, title, description }) {
  return { '@context': 'https://schema.org', '@type': 'WebPage', url, name: title, description };
}

/*
 * opts: { title, description, canonical, h1, heroSlogan, currentCitySlug,
 *         breadcrumbs:[{name,url}], bodyHtml, jsonLd:[obj,...], noindex, ogImage,
 *         pillAnnText }
 */
function renderSeoPage(opts) {
  const jsonLdBlocks = (opts.jsonLd || []).map((obj) => `<script type="application/ld+json">${JSON.stringify(obj)}</script>`).join('\n');
  const heroBadge = opts.pillAnnText ? `<span class="pill-ann"><span class="dot"></span><span>${esc(opts.pillAnnText)}</span><span class="go">обновлено сегодня</span></span>` : '';
  const heroSlogan = opts.heroSlogan ? `<p class="hero-slogan">${opts.heroSlogan}</p>` : '';

  return `<!DOCTYPE html>
<html lang="ru-KZ">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(opts.title)}</title>
<meta name="description" content="${esc(opts.description)}">
<link rel="canonical" href="${esc(opts.canonical)}">
${opts.noindex ? '<meta name="robots" content="noindex">' : ''}
<meta name="theme-color" content="#2f6bed">
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/shared.css?v=1">
<style>
  /* Доп. стили для SEO-контентных блоков (status/cards/faq) поверх дизайна лендинга */
  .crumbs{font-size:12.5px;color:var(--ink-3);margin:18px 0 0}
  .crumbs .sep{margin:0 5px}
  .crumbs a{color:var(--ink-3)}
  .crumbs a:hover{color:var(--ink)}
  .page-hero{padding:38px 0 8px}
  .page-hero h1{font-size:clamp(28px,4.6vw,44px);font-weight:800;letter-spacing:-.03em;line-height:1.08;margin-top:14px;max-width:22ch}
  .status-block{background:var(--canvas);border:1px solid var(--line);border-radius:var(--radius);padding:22px 24px;margin:22px 0;line-height:1.6;box-shadow:var(--shadow-sm)}
  .status-block b{color:var(--ink)}
  .search-box{display:flex;gap:10px;margin:22px 0}
  .search-box input{flex:1;height:52px;border:1px solid var(--line);border-radius:999px;padding:0 20px;font-size:15px;font-family:inherit;background:var(--canvas)}
  .search-box input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 4px var(--accent-wash)}
  .cards-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin:20px 0}
  .city-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin:22px 0}
  .city-card{background:var(--canvas);border:1px solid var(--line);border-radius:var(--radius);padding:22px;text-decoration:none;color:var(--ink);transition:transform .18s,border-color .18s,box-shadow .18s;display:block}
  .city-card:hover{border-color:var(--ink-3);transform:translateY(-2px);box-shadow:var(--shadow-sm)}
  .city-card b{font-size:17px;display:block;font-weight:800;letter-spacing:-.01em}
  .city-card.disabled{opacity:.55;pointer-events:none}
  .city-card .soon{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-3);background:var(--line-2);border-radius:999px;padding:2px 8px;margin-top:8px;display:inline-block}
  .related-links{display:flex;flex-wrap:wrap;gap:10px 20px;font-size:14.5px;font-weight:600;margin:18px 0}
  .related-links a{color:var(--accent-ink)}
  .sec{margin-top:56px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin:20px 0}
  .outage-card{background:var(--canvas);border:1px solid var(--line);border-radius:var(--radius-sm);padding:20px;box-shadow:var(--shadow-sm)}
  .outage-card h3{font-size:15.5px;font-weight:800;letter-spacing:-.01em;margin-bottom:10px}
  .outage-card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:13.5px}
  .outage-card dt{color:var(--ink-3);font-weight:600}
  .outage-card dd{color:var(--ink-2)}
  .updated{font-size:13px;color:var(--ink-3);margin-top:18px;font-weight:600}
  .faq-col .faq-item{border-bottom:1px solid var(--line-2)}
  .faq-col .faq-item summary{cursor:pointer;padding:16px 34px 16px 0;position:relative;font-weight:700;font-size:16px;line-height:1.4;color:var(--ink);list-style:none}
  .faq-col .faq-item summary::-webkit-details-marker{display:none}
  .faq-col .faq-item summary::after{content:"+";position:absolute;right:8px;top:15px;font-weight:400;font-size:26px;line-height:1;color:var(--accent);transition:transform .25s}
  .faq-col .faq-item[open] summary::after{transform:rotate(45deg)}
  .faq-col .faq-item .faq-a{padding:2px 34px 18px 0;color:var(--ink-2);line-height:1.62;font-size:15px}
</style>
</head>
<body>
${navHtml(opts.currentCitySlug)}
<main>
<div class="wrap">
${breadcrumbsHtml(opts.breadcrumbs)}
<div class="page-hero">
  ${heroBadge}
  <h1>${opts.h1}</h1>
  ${heroSlogan}
</div>
${opts.bodyHtml}
</div>
</main>
${footerHtml()}
</body>
</html>`;
}

module.exports = { renderSeoPage, breadcrumbsJsonLd, organizationJsonLd, webPageJsonLd, esc, navHtml, footerHtml, BRAND, ORIGIN };
