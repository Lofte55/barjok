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
  .crumbs{font-size:12.5px;color:var(--ink-3);margin:18px 0 0;text-align:center}
  .crumbs .sep{margin:0 5px}
  .crumbs a{color:var(--ink-3)}
  .crumbs a:hover{color:var(--ink)}
  /* hero — центрированный, как на лендинге (pill-ann/hero-h1/hero-slogan уже определены в shared.css) */
  .page-hero{padding:30px 0 8px;text-align:center}
  .page-hero h1{font-size:clamp(32px,5.4vw,56px);font-weight:800;letter-spacing:-.035em;line-height:1.06;margin:22px auto 0;max-width:19ch;text-wrap:balance}
  .page-hero .hero-slogan{margin:12px auto 0}
  .page-hero .lead{font-size:clamp(15.5px,2vw,18px);color:var(--ink-2);max-width:56ch;margin:18px auto 0;line-height:1.55}
  /* status/search — тонкая рамка снизу вместо коробки, в духе awesomic (данные без "плашек") */
  .status-block{border-top:1px solid var(--line);padding:20px 0;margin:22px 0;line-height:1.6}
  .status-block b{color:var(--ink)}
  .search-box.capture{margin-left:0}
  /* unboxed-цифры под hero, как "20 000+ completed projects" на awesomic.com */
  .mini-stats{margin:34px 0 6px;text-align:center}
  .mini-stats-ok{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:var(--ok);
    background:color-mix(in srgb, var(--ok) 10%, white);border-radius:999px;padding:7px 14px 7px 12px;margin-bottom:22px}
  .mini-stats-ok .ok-dot{width:7px;height:7px;border-radius:50%;background:var(--ok);flex:none;animation:beat 2s infinite}
  .mini-stats-row{display:flex;flex-wrap:wrap;justify-content:center;gap:34px 52px}
  .mini-stats .mstat{text-align:center}
  .mini-stats .mstat b{display:block;font-size:clamp(24px,3vw,32px);font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
  .mini-stats .mstat span{font-size:13px;color:var(--ink-3);font-weight:600;display:inline-flex;align-items:center;gap:6px;margin-top:4px}
  .mstat-dot{width:7px;height:7px;border-radius:50%;flex:none}
  /* case-card: border-first (hairline-рамка держит форму, не тень) — паттерн Dub.co,
     hover = граница темнеет + лёгкий подъём, а не разрастающаяся тень */
  .city-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin:22px 0}
  .city-card{background:var(--canvas);border:1px solid var(--line);border-radius:14px;padding:24px;text-decoration:none;color:var(--ink);
    transition:transform .16s cubic-bezier(.16,1,.3,1),border-color .16s;display:block;position:relative}
  .city-card:hover{transform:translateY(-2px);border-color:var(--ink-3)}
  .city-card:active{transform:translateY(0) scale(.99)}
  .city-card b{font-size:17px;display:block;font-weight:800;letter-spacing:-.015em;line-height:1.3}
  .city-card.disabled{opacity:.5;pointer-events:none}
  .city-card .soon{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-3);background:var(--line-2);border-radius:999px;padding:2px 8px;margin-top:10px;display:inline-block}
  /* related-links: chip-теги вместо синего списка */
  .related-links{display:flex;flex-wrap:wrap;gap:10px;margin:18px 0}
  .related-links a{color:var(--ink-2);font-size:13.5px;font-weight:700;text-decoration:none;background:var(--canvas);border:1px solid var(--line);border-radius:999px;padding:9px 16px;transition:border-color .18s,color .18s}
  .related-links a:hover{border-color:var(--accent);color:var(--accent-ink)}
  /* цветные плитки услуг — border-first (hairline-рамка + акцентная граница на hover,
     без разрастающихся теней и декоративного свечения) */
  .svc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin:26px 0}
  .svc-tile{display:flex;flex-direction:column;align-items:flex-start;gap:0;background:var(--canvas);border:1px solid var(--line);border-radius:14px;
    padding:22px 22px 20px;text-decoration:none;color:var(--ink);position:relative;
    transition:transform .16s cubic-bezier(.16,1,.3,1),border-color .16s}
  .svc-tile:hover{transform:translateY(-2px);border-color:var(--svc-c)}
  .svc-tile:active{transform:translateY(0) scale(.99)}
  .svc-tile .svc-ic{width:40px;height:40px;border-radius:11px;flex:none;display:grid;place-items:center;background:color-mix(in srgb, var(--svc-c) 15%, white);color:var(--svc-c);margin-bottom:14px;transition:transform .2s cubic-bezier(.34,1.56,.64,1)}
  .svc-tile:hover .svc-ic{transform:scale(1.08)}
  .svc-tile .svc-ic svg{width:20px;height:20px}
  .svc-tile b{position:relative;font-size:16px;font-weight:800;letter-spacing:-.01em;display:flex;align-items:center;gap:6px;width:100%}
  .svc-tile .svc-desc{position:relative;font-size:13px;color:var(--ink-2);line-height:1.5;margin-top:6px;font-weight:500}
  .svc-tile .svc-arw{color:var(--ink-3);flex:none;transition:transform .16s,color .16s;margin-left:auto}
  .svc-tile:hover .svc-arw{transform:translateX(3px);color:var(--svc-c)}
  .more-chip{display:inline-block;font-size:11px;font-weight:700;color:var(--ink-3);background:var(--line-2);border-radius:999px;padding:1px 7px;margin-left:2px}
  /* trust-блок "Почему нам можно верить" — БЕЗ карточек-коробок: иллюстрация
     с прозрачным фоном + тонкая верхняя линия-разделитель вместо
     border+shadow+фоновой плашки под иконку (Border-first/anti-card-overuse) */
  .feat-grid{grid-template-columns:1fr 1fr;gap:36px 48px}
  .feat{position:relative;display:flex;align-items:center;gap:22px;padding:26px 0 0;
    border:0;border-top:1px solid var(--line);background:none;border-radius:0}
  /* без hover-эффекта по просьбе — карточка статична, реагирует только идле-анимация иконки */
  .feat:hover{border-top-color:var(--line);transform:none;box-shadow:none}
  .feat .fi-img{width:72px;height:72px;flex:none;object-fit:contain;
    filter:drop-shadow(0 6px 14px rgba(47,107,237,.28))}
  .feat-text{min-width:0}
  .feat-text h3{font-size:17px}
  .feat-text p{margin-top:6px}
  .feat:nth-child(1) .fi-img{animation:fiBounce 2.6s ease-in-out infinite}
  .feat:nth-child(2) .fi-img{animation:fiPulse 2.6s ease-in-out infinite}
  .feat:nth-child(3) .fi-img{animation:fiPulse 2.6s ease-in-out infinite .35s}
  .feat:nth-child(4) .fi-img{animation:fiWiggle 3.4s ease-in-out infinite}
  @keyframes fiBounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
  @keyframes fiPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}
  @keyframes fiWiggle{0%,100%{transform:rotate(0)}25%{transform:rotate(-8deg)}75%{transform:rotate(8deg)}}
  @media(max-width:760px){.feat-grid{grid-template-columns:1fr}.feat{flex-direction:column;align-items:flex-start;gap:14px}}
  @media(prefers-reduced-motion:reduce){.feat .fi-img{animation:none!important}.feat{transition:none}}
  .sec{margin-top:76px}
  #report-cta{margin-top:76px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin:20px 0}
  .outage-card{border:1px solid var(--line);border-radius:14px;background:var(--canvas);padding:18px 20px;transition:border-color .16s,box-shadow .16s}
  /* карточка улицы — целиком ссылка на карту, не только название улицы */
  a.street-card{display:block;text-decoration:none;color:inherit;cursor:pointer;outline:none}
  a.street-card:hover{border-color:var(--accent);box-shadow:0 10px 24px -14px rgba(21,32,58,.22)}
  a.street-card:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-wash)}
  a.street-card h3{display:inline-flex;align-items:center;gap:5px;color:var(--ink)}
  a.street-card h3 svg{color:var(--ink-3);flex:none;transition:transform .16s,color .16s}
  a.street-card:hover h3 svg{transform:translate(2px,-2px);color:var(--accent-ink)}
  /* компактный вариант — "Текущие отключения" может быть десятки карточек подряд,
     полные подписи ("Ожидаемое восстановление", месяц словом) растягивали их по
     высоте; тут короткие подписи + числовые даты + обрезанный текст причины */
  .cards-compact{grid-template-columns:repeat(auto-fill,minmax(230px,1fr))}
  .cards-compact .outage-card{padding:14px 16px}
  .cards-compact .outage-card h3{font-size:14px}
  .cards-compact .outage-card dl{grid-template-columns:auto 1fr;gap:3px 8px;font-size:12.5px}
  .cards-compact .outage-card dd{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .outage-card:hover{border-color:var(--ink-3)}
  .outage-card h3{font-size:15.5px;font-weight:800;letter-spacing:-.01em;margin-bottom:10px}
  .outage-card dl{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;font-size:13.5px}
  .outage-card dt{color:var(--ink-3);font-weight:600}
  .outage-card dd{color:var(--ink-2)}
  .res-pill{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;border-radius:999px;padding:3px 9px 3px 7px;margin-bottom:2px}
  .res-pill .dot{width:6px;height:6px;border-radius:50%;flex:none}
  /* переключатель ресурса над "Предстоящими отключениями" — фильтрует карточки на клиенте */
  .res-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 4px}
  .res-tab{font-family:inherit;font-size:13.5px;font-weight:700;color:var(--ink-2);background:var(--canvas);
    border:1px solid var(--line);border-radius:999px;padding:8px 16px;cursor:pointer;transition:border-color .16s,color .16s,background .16s}
  .res-tab:hover{border-color:var(--ink-3)}
  .res-tab.on{background:var(--ink);color:#fff;border-color:var(--ink)}
  .outage-card[hidden]{display:none}
  /* "+N ещё" — замыкающая плитка сетки вместо тихого обрезания списка, ведёт
     на общий вид карты (без фильтра по конкретной улице) */
  .outage-more{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;
    text-decoration:none;color:var(--ink);background:var(--bg);border-style:dashed;gap:2px;padding:20px 16px;outline:none}
  .outage-more:hover{background:var(--line-2);border-color:var(--ink-3)}
  .outage-more:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-wash)}
  .outage-more-n{font-size:26px;font-weight:800;letter-spacing:-.02em;color:var(--accent-ink)}
  .outage-more-label{font-size:12.5px;color:var(--ink-3);font-weight:600;max-width:26ch;line-height:1.4}
  .outage-more-cta{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:700;color:var(--accent-ink);margin-top:10px}
  .street-link{display:inline-flex;align-items:center;gap:5px;color:var(--ink);text-decoration:none}
  .street-link:hover{color:var(--accent-ink)}
  .street-link svg{color:var(--ink-3);flex:none}
  .street-link:hover svg{color:var(--accent-ink)}
  .updated{font-size:13px;color:var(--ink-3);margin-top:18px;font-weight:600}
  /* FAQ — двухколоночная раскладка в духе awesomic.com: слева заголовок+контакт,
     справа pill-строки вопросов на тонированном фоне (не белые карточки с рамкой) */
  .faq-layout{display:grid;grid-template-columns:minmax(220px,340px) 1fr;gap:40px;align-items:start;margin-top:26px}
  .faq-side{position:sticky;top:90px}
  .faq-contact{margin-top:24px;background:var(--canvas);border:1px solid var(--line);border-radius:16px;padding:20px}
  .faq-contact b{display:block;font-size:16px;font-weight:800;letter-spacing:-.01em}
  .faq-contact p{font-size:13.5px;color:var(--ink-2);line-height:1.5;margin:8px 0 14px}
  .faq-contact .btn{width:100%}
  .faq-list{display:flex;flex-direction:column;gap:10px}
  .faq-pill{background:var(--line-2);border-radius:16px;transition:background .18s}
  .faq-pill:hover{background:var(--accent-wash)}
  .faq-pill[open]{background:var(--accent-wash)}
  .faq-pill summary{cursor:pointer;padding:18px 50px 18px 22px;position:relative;font-weight:700;font-size:15.5px;line-height:1.4;color:var(--ink);list-style:none}
  .faq-pill summary::-webkit-details-marker{display:none}
  .faq-chev{position:absolute;right:20px;top:18px;color:var(--ink-3);transition:transform .25s cubic-bezier(.16,1,.3,1)}
  .faq-pill[open] .faq-chev{transform:rotate(180deg);color:var(--accent)}
  .faq-pill .faq-a{padding:0 50px 18px 22px;color:var(--ink-2);line-height:1.62;font-size:14.5px}
  @media(max-width:820px){.faq-layout{grid-template-columns:1fr}.faq-side{position:static}}
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
<script>
(function(){
  var rvs=[].slice.call(document.querySelectorAll('.rv'));
  var groupIdx=new Map();
  rvs.forEach(function(el){
    var p=el.parentElement;
    var i=groupIdx.get(p)||0;
    groupIdx.set(p,i+1);
    el.style.transitionDelay=(Math.min(i,8)*70)+'ms';
  });
  if('IntersectionObserver' in window){
    var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12,rootMargin:'0px 0px -6% 0px'});
    rvs.forEach(function(el){io.observe(el);});
  } else rvs.forEach(function(el){el.classList.add('in');});
  setTimeout(function(){rvs.forEach(function(el){el.classList.add('in');});},1400);
})();
(function(){
  // ---------- count-up для чисел [data-to] (mini-stats/stat-row) ----------
  function countUp(el){var to=+el.dataset.to||0,s=performance.now(),d=1200;(function step(t){var p=Math.min((t-s)/d,1),e=1-Math.pow(1-p,3);el.textContent=Math.round(to*e).toLocaleString('ru-RU')+(el.dataset.suffix||'');if(p<1)requestAnimationFrame(step);})(s);}
  var nums=[].slice.call(document.querySelectorAll('[data-to]'));
  if(nums.length){
    if('IntersectionObserver' in window){
      var io3=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){countUp(e.target);io3.unobserve(e.target);}});},{threshold:.4});
      nums.forEach(function(el){io3.observe(el);});
    } else nums.forEach(countUp);
  }
})();
(function(){
  // ---------- табы-фильтр по ресурсу — работает НЕЗАВИСИМО для каждой группы
  // (и "Текущие", и "Предстоящие" отключения используют один и тот же паттерн:
  // .res-tabs, за которым сразу идёт .cards с карточками) ----------
  document.querySelectorAll('.res-tabs').forEach(function(tabsEl){
    var cardsEl=tabsEl.nextElementSibling;
    if(!cardsEl) return;
    var tabs=[].slice.call(tabsEl.querySelectorAll('.res-tab'));
    var cards=[].slice.call(cardsEl.querySelectorAll('.outage-card'));
    tabs.forEach(function(tab){
      tab.addEventListener('click',function(){
        tabs.forEach(function(t){t.classList.remove('on');});
        tab.classList.add('on');
        var f=tab.dataset.filter;
        cards.forEach(function(c){
          // плитка "+N ещё" видна только в общем виде "Все" (в конкретном ресурсе
          // и так показаны все карточки этого ресурса, "ещё" неприменимо)
          if(c.dataset.res==='__more__'){ c.hidden=(f!=='all'); return; }
          var isExtra=c.hasAttribute('data-extra');
          if(f==='all'){ c.hidden = isExtra; }
          else { c.hidden = (c.dataset.res!==f); }
        });
      });
    });
  });
})();
(function(){
  // ---------- живые подсказки адреса (тот же паттерн, что на карте) ----------
  var capInput=document.getElementById('capInput'), lsug=document.getElementById('lsug');
  if(!capInput||!lsug) return;
  var mapHref=capInput.dataset.mapHref||'/map/pavlodar';
  var ADDR=null;
  function loadAddr(){ if(ADDR) return Promise.resolve(ADDR);
    return fetch('/map/addresses.json').then(function(r){return r.json();}).then(function(d){ADDR=d;return d;}).catch(function(){return ADDR={};}); }
  function norm(s){ return (s||'').toLowerCase().replace(/^(улица|ул\\.?|проспект|пр\\.?|переулок|пер\\.?|мкр\\.?|площадь|пл\\.?)\\s*/,'').replace(/ё/g,'е').replace(/[.,]/g,' ').replace(/\\s+/g,' ').trim(); }
  function parseQ(raw){
    var s=(raw||'').trim().replace(/^(ул|улица|пр|проспект|пер|переулок|мкр|пл)\\.?\\s+/i,'');
    var m=s.match(/^(.*?)[\\s,]+(\\d+[а-я]?(?:\\/\\d+)?)\\s*$/i);
    return { street: norm(m?m[1]:s), house: m?m[2].toLowerCase():'' };
  }
  function esc2(s){return String(s).replace(/[<&>"]/g,function(c){return {'<':'&lt;','&':'&amp;','>':'&gt;','"':'&quot;'}[c];});}
  function renderSug(raw){
    var q=(raw||'').trim(); if(q.length<2){ lsug.classList.remove('show'); return; }
    var pq=parseQ(q);
    loadAddr().then(function(d){
      var streets=Object.keys(d).filter(function(s){return norm(s).indexOf(pq.street)>=0;})
        .sort(function(a,b){return d[b].length-d[a].length;});
      var html='';
      if(pq.house){
        var rows=[];
        for(var i=0;i<streets.length && rows.length<7;i++){
          var st=streets[i], hs=d[st];
          var exact=[], part=[];
          for(var j=0;j<hs.length;j++){ var hn=String(hs[j][0]).toLowerCase();
            if(hn===pq.house) exact.push(hs[j][0]); else if(hn.indexOf(pq.house)===0) part.push(hs[j][0]); }
          part.sort(function(a,b){ var na=parseInt(a,10),nb=parseInt(b,10); return (na-nb)|| (String(a)<String(b)?-1:1); });
          exact.concat(part).slice(0,7-rows.length).forEach(function(h){ rows.push({street:st,house:h}); });
        }
        html=rows.map(function(r){ var qq=r.street+', '+r.house;
          return '<a href="'+mapHref+'?q='+encodeURIComponent(qq)+'"><span class="p"></span><span class="nm">'+esc2(r.street)+', '+esc2(r.house)+'</span></a>'; }).join('');
      }
      if(!html){
        var hits=streets.slice(0,6);
        if(!hits.length){ lsug.classList.remove('show'); return; }
        html=hits.map(function(s){ var qq=s+(pq.house?(', '+pq.house):'');
          return '<a href="'+mapHref+'?q='+encodeURIComponent(qq)+'"><span class="p"></span><span class="nm">'+esc2(s)+'</span><span class="hs">'+d[s].length+' адр.</span></a>'; }).join('');
      }
      lsug.innerHTML=html; lsug.classList.add('show');
    });
  }
  capInput.addEventListener('input',function(){ renderSug(this.value); });
  capInput.addEventListener('focus',function(){ if(this.value.trim().length>=2) renderSug(this.value); });
  document.addEventListener('click',function(e){ if(!e.target.closest('.cap-wrap')) lsug.classList.remove('show'); });
})();
</script>
</body>
</html>`;
}

module.exports = { renderSeoPage, breadcrumbsJsonLd, organizationJsonLd, webPageJsonLd, esc, navHtml, footerHtml, BRAND, ORIGIN };
