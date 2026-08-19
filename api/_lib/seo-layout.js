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
  // Реальный <a href>, а не <button onclick=location.href=...> — чтобы ссылка на
  // город была обычной crawlable-ссылкой для поисковых роботов (SEO discovery §4).
  const cityMenuItems = cities.map((c) => {
    const active = c.status === 'active';
    return active
      ? `<a href="/${c.slug}/" class="${c.slug === currentCitySlug ? 'on' : ''}"><span>${esc(c.names.ru.nominative)}</span></a>`
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
      <button class="btn contact-open" type="button">Связаться с нами</button>
    </div>
  </div>
</footer>
${contactsModalHtml()}`;
}

function contactsModalHtml() {
  return `<div class="modal-ov" id="contactsModal" aria-hidden="true">
  <div class="modal">
    <button class="modal-x" id="contactsClose" aria-label="Закрыть">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
    </button>
    <div class="modal-eyebrow">Контакты</div>
    <h3 class="modal-title">Свяжитесь с нами</h3>
    <p class="modal-sub">Выберите удобный способ — ответим в течение рабочего дня.</p>
    <div class="modal-list">
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
      <a class="cbtn" href="tel:+77083445023">
        <span class="ci" style="background:var(--elec)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15 15 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.2.2 2.4.6 3.6.1.4 0 .8-.3 1l-2.2 2.2z"/></svg></span>
        <span class="ct"><span class="l">Позвонить</span><span class="v">+7 708 344 50 23</span></span>
        <svg class="arw" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </a>
    </div>
  </div>
</div>
<script>
(function(){
  var m=document.getElementById('contactsModal');
  if(!m)return;
  function open(){ m.classList.add('show'); m.setAttribute('aria-hidden','false'); }
  function close(){ m.classList.remove('show'); m.setAttribute('aria-hidden','true'); }
  document.querySelectorAll('.contact-open').forEach(function(b){ b.addEventListener('click',open); });
  var x=document.getElementById('contactsClose');
  if(x)x.addEventListener('click',close);
  m.addEventListener('click',function(e){ if(e.target===m) close(); });
  addEventListener('keydown',function(e){ if(e.key==='Escape') close(); });
})();
</script>`;
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
  /* горизонтальная лента вместо растущей сетки — добавление городов не раздувает
     блок по высоте, лента просто становится длиннее и скроллится вбок */
  .city-cards-scroll{display:flex;overflow-x:auto;scroll-snap-type:x proximity;gap:10px;margin:22px 0;
    padding-bottom:6px;-webkit-overflow-scrolling:touch;scrollbar-width:thin}
  .city-cards-scroll .city-card{flex:0 0 240px;scroll-snap-align:start}
  .city-card{background:var(--canvas);border:1px solid var(--line);border-radius:14px;padding:24px;text-decoration:none;color:var(--ink);
    transition:transform .16s cubic-bezier(.16,1,.3,1),border-color .16s;display:block;position:relative}
  .city-card:hover{transform:translateY(-2px);border-color:var(--ink-3)}
  .city-card:active{transform:translateY(0) scale(.99)}
  .city-card b{font-size:17px;display:block;font-weight:800;letter-spacing:-.015em;line-height:1.3}
  .city-card-sub{font-size:13px;color:var(--ink-3);font-weight:600;margin-top:6px;display:block}
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
  /* city-menu теперь <a href> вместо <button onclick> (crawlable-ссылка) — те же
     стили, что и .city-menu button в shared.css, но для нового тега */
  .city-menu a{display:flex;align-items:center;justify-content:space-between;width:100%;gap:10px;background:none;border:0;
    font-family:inherit;font-size:14px;font-weight:600;color:var(--ink);padding:10px 12px;border-radius:9px;cursor:pointer;
    text-align:left;text-decoration:none}
  .city-menu a:hover{background:var(--bg)}
  .city-menu a.on{color:var(--accent-ink)}
  /* на широкой 1344px-вёрстке 18ch/46ch из лендинга (рассчитано на узкий hero)
     выглядят как узкая колонка текста с пустым синим полем справа —
     даём заголовку/описанию больше места под фактическую ширину grid-колонки */
  .rc-band{grid-template-columns:1.5fr .5fr}
  .rc-band h2{max-width:24ch;font-size:clamp(28px,3.4vw,40px)}
  .rc-band p{max-width:52ch;font-size:17px}
  @media(max-width:760px){.rc-band{grid-template-columns:1fr}}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:10px;margin:20px 0}
  .outage-card{border:1px solid var(--line);border-radius:14px;background:var(--canvas);padding:18px 20px;transition:border-color .16s,box-shadow .16s}
  /* карточка улицы — целиком ссылка на карту, не только название улицы */
  a.street-card{display:block;text-decoration:none;color:inherit;cursor:pointer;outline:none}
  a.street-card:hover{border-color:var(--accent);box-shadow:0 10px 24px -14px rgba(21,32,58,.22)}
  a.street-card:focus-visible{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-wash)}
  a.street-card{display:flex;flex-direction:column}
  a.street-card .res-pill{align-self:flex-start}
  a.street-card h3{display:flex;align-items:center;gap:5px;color:var(--ink)}
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
${a11yWidgetHtml()}
<!-- Яндекс.Метрика + cookie-баннер — единый скрипт на все страницы (map/index.html
     подключает его так же). Раньше этот блок отсутствовал в SSR-шаблоне SEO-страниц —
     аналитика не считала визиты на / и /{city}/... вообще. -->
<script defer src="/cookie-consent.js?v=2"></script>
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

/*
 * Плавающая кнопка доступности (снизу справа, position:fixed — едет вместе
 * со скроллом по всему сайту) + панель: размер текста, контраст, вспомогательные
 * функции для слабовидящих. Выбор сохраняется в localStorage и переживает
 * переход между страницами (применяется заново при каждой загрузке).
 */
function a11yWidgetHtml() {
  return `<div id="a11y-widget">
  <button id="a11yFab" type="button" aria-label="Настройки доступности" aria-expanded="false">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><path d="M12 8v6M12 8c-2.8 0-5.2.6-7 1.4M12 8c2.8 0 5.2.6 7 1.4M9 14l-2.2 6M15 14l2.2 6"/></svg>
  </button>
  <div id="a11yPanel" role="dialog" aria-label="Настройки доступности" hidden>
    <div class="a11y-head">
      <b>Доступность</b>
      <p>Настройте отображение сайта под себя. Выбор сохраняется на этом устройстве.</p>
    </div>
    <div class="a11y-group">
      <div class="a11y-label">Размер текста</div>
      <div class="a11y-seg" data-group="text" role="group">
        <button data-val="1" class="on" style="font-size:12px">A</button>
        <button data-val="2" style="font-size:14px">A</button>
        <button data-val="3" style="font-size:16px">A</button>
        <button data-val="4" style="font-size:18px">A</button>
      </div>
    </div>
    <div class="a11y-group">
      <div class="a11y-label">Контраст</div>
      <div class="a11y-seg" data-group="contrast" role="group">
        <button data-val="default" class="on">Обычный</button>
        <button data-val="high">Высокий</button>
        <button data-val="bw">Ч/Б</button>
      </div>
    </div>
    <div class="a11y-group">
      <div class="a11y-label">Вспомогательные функции</div>
      <button class="a11y-toggle" data-toggle="readable-font"><span>Читаемый шрифт</span><span class="a11y-state">Выкл</span></button>
      <button class="a11y-toggle" data-toggle="highlight-links"><span>Выделить ссылки</span><span class="a11y-state">Выкл</span></button>
      <button class="a11y-toggle" data-toggle="big-cursor"><span>Крупный курсор</span><span class="a11y-state">Выкл</span></button>
      <button class="a11y-toggle" data-toggle="reduce-motion"><span>Меньше анимации</span><span class="a11y-state">Выкл</span></button>
    </div>
    <button id="a11yReset" type="button">Сбросить всё</button>
  </div>
</div>
<style>
  #a11y-widget{position:fixed;right:20px;bottom:20px;z-index:9999;font-family:var(--sans);text-align:left}
  #a11yFab{width:52px;height:52px;border-radius:50%;background:var(--accent);color:#fff;border:0;cursor:pointer;
    display:grid;place-items:center;box-shadow:0 10px 24px -8px rgba(47,107,237,.55);transition:transform .18s}
  #a11yFab:hover{transform:scale(1.06)}
  #a11yFab svg{width:26px;height:26px}
  #a11yPanel{position:absolute;right:0;bottom:64px;width:300px;max-width:calc(100vw - 40px);background:var(--canvas);
    border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow-lg);padding:20px}
  #a11yPanel[hidden]{display:none}
  .a11y-head b{font-size:16px;font-weight:800;letter-spacing:-.01em}
  .a11y-head p{font-size:12.5px;color:var(--ink-3);margin-top:4px;line-height:1.4}
  .a11y-group{margin-top:16px}
  .a11y-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--ink-3);margin-bottom:8px}
  .a11y-seg{display:flex;gap:6px;background:var(--bg);border-radius:10px;padding:4px}
  .a11y-seg button{flex:1;background:none;border:0;border-radius:7px;padding:8px 4px;font-family:inherit;font-weight:700;
    color:var(--ink-2);cursor:pointer}
  .a11y-seg button.on{background:var(--canvas);color:var(--accent-ink);box-shadow:var(--shadow-sm)}
  .a11y-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--bg);
    border:0;border-radius:10px;padding:11px 14px;font-family:inherit;font-size:13.5px;font-weight:600;color:var(--ink);
    cursor:pointer;margin-top:8px}
  .a11y-toggle .a11y-state{font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase}
  .a11y-toggle.on{background:var(--accent-wash)}
  .a11y-toggle.on .a11y-state{color:var(--accent-ink)}
  #a11yReset{width:100%;margin-top:16px;background:none;border:1px solid var(--line);border-radius:10px;padding:11px;
    font-family:inherit;font-weight:700;font-size:13px;color:var(--ink-2);cursor:pointer}
  #a11yReset:hover{border-color:var(--ink-3)}
  @media(max-width:480px){#a11y-widget{right:14px;bottom:14px}}
  /* --- применяемые режимы --- */
  html.a11y-contrast-high{--ink:#000;--ink-2:#111;--ink-3:#333;--bg:#fff;--canvas:#fff;--line:#000;--line-2:#000;
    --accent:#0033cc;--accent-ink:#002499;--accent-wash:#dbe6ff}
  html.a11y-contrast-bw{filter:grayscale(1)}
  html.a11y-readable-font body, html.a11y-readable-font input, html.a11y-readable-font button{font-family:Verdana,Arial,sans-serif!important}
  html.a11y-highlight-links a{text-decoration:underline!important;text-decoration-thickness:2px!important;text-underline-offset:2px}
  html.a11y-big-cursor, html.a11y-big-cursor *{cursor:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2240%22 height=%2240%22 viewBox=%220 0 24 24%22><path d=%22M4 2l14 8-6 1.5L14 20l-3-1.5L8 12H4z%22 fill=%22black%22 stroke=%22white%22 stroke-width=%221%22/></svg>') 4 4, auto!important}
  html.a11y-reduce-motion *{animation:none!important;transition:none!important;scroll-behavior:auto!important}
</style>
<script>
(function(){
  var root=document.documentElement;
  var fab=document.getElementById('a11yFab'), panel=document.getElementById('a11yPanel');
  var STORE_KEY='barjok_a11y';
  function load(){ try{return JSON.parse(localStorage.getItem(STORE_KEY))||{};}catch(e){return {};} }
  function save(s){ try{localStorage.setItem(STORE_KEY, JSON.stringify(s));}catch(e){} }
  var state=Object.assign({text:1, contrast:'default', toggles:{}}, load());

  function apply(){
    document.body.style.zoom = state.text===1?'': (100+(state.text-1)*12)+'%';
    root.classList.toggle('a11y-contrast-high', state.contrast==='high');
    root.classList.toggle('a11y-contrast-bw', state.contrast==='bw');
    ['readable-font','highlight-links','big-cursor','reduce-motion'].forEach(function(k){
      root.classList.toggle('a11y-'+k, !!state.toggles[k]);
    });
    document.querySelectorAll('.a11y-seg[data-group="text"] button').forEach(function(b){b.classList.toggle('on', +b.dataset.val===state.text);});
    document.querySelectorAll('.a11y-seg[data-group="contrast"] button').forEach(function(b){b.classList.toggle('on', b.dataset.val===state.contrast);});
    document.querySelectorAll('.a11y-toggle').forEach(function(b){
      var on=!!state.toggles[b.dataset.toggle];
      b.classList.toggle('on', on);
      b.querySelector('.a11y-state').textContent = on?'Вкл':'Выкл';
    });
  }
  apply();

  fab.addEventListener('click', function(){
    var open=panel.hidden;
    panel.hidden=!open;
    fab.setAttribute('aria-expanded', open?'true':'false');
  });
  document.addEventListener('click', function(e){
    if(!panel.hidden && !panel.contains(e.target) && e.target!==fab && !fab.contains(e.target)) panel.hidden=true;
  });
  document.querySelectorAll('.a11y-seg[data-group="text"] button').forEach(function(b){
    b.addEventListener('click', function(){ state.text=+b.dataset.val; save(state); apply(); });
  });
  document.querySelectorAll('.a11y-seg[data-group="contrast"] button').forEach(function(b){
    b.addEventListener('click', function(){ state.contrast=b.dataset.val; save(state); apply(); });
  });
  document.querySelectorAll('.a11y-toggle').forEach(function(b){
    b.addEventListener('click', function(){
      var k=b.dataset.toggle;
      state.toggles[k]=!state.toggles[k];
      save(state); apply();
    });
  });
  document.getElementById('a11yReset').addEventListener('click', function(){
    state={text:1, contrast:'default', toggles:{}};
    save(state); apply();
  });
})();
</script>`;
}

module.exports = { renderSeoPage, breadcrumbsJsonLd, organizationJsonLd, webPageJsonLd, esc, navHtml, footerHtml, a11yWidgetHtml, BRAND, ORIGIN };
