/*
 * Переиспользуемые маркетинговые блоки в стиле лендинга (landing/index.html) —
 * stat-row, feat-grid, FAQ-аккордеон, финальный CTA. Используются на всех
 * SEO SSR-страницах, чтобы не терять маркетинговую часть ради тонкого SEO-контента.
 */
const { esc } = require('./seo-layout');

function sectionHeadHtml(eyebrow, h2, intro) {
  return `<div class="sec wrap rv" style="padding-left:0;padding-right:0">
    <div class="eyebrow">${esc(eyebrow)}</div>
    <h2>${esc(h2)}</h2>
    ${intro ? `<p class="intro">${esc(intro)}</p>` : ''}
  </div>`;
}

function statRowHtml({ affectedAddresses, electricityAffected, hotWaterAffected, coldWaterAffected }) {
  return `<section class="stats wrap rv">
    <div class="stat-row">
      <div class="stat a"><div class="n">${(affectedAddresses || 0).toLocaleString('ru-RU')}</div><div class="l">адресов затронуто</div></div>
      <div class="stat b"><div class="n">${(electricityAffected || 0).toLocaleString('ru-RU')}</div><div class="l">домов без света</div></div>
      <div class="stat c"><div class="n">${(hotWaterAffected || 0).toLocaleString('ru-RU')}</div><div class="l">без горячей воды</div></div>
      <div class="stat d"><div class="n">${(coldWaterAffected || 0).toLocaleString('ru-RU')}</div><div class="l">без холодной воды</div></div>
    </div>
  </section>`;
}

/* Компактные unboxed-цифры под hero — в духе awesomic.com (не боксы, просто число+подпись в ряд). */
function minimalStatsHtml(pairs) {
  return `<div class="mini-stats rv">
    ${pairs.map(([n, l]) => `<div class="mstat"><b>${esc(String(n))}</b><span>${esc(l)}</span></div>`).join('')}
  </div>`;
}

/* Превью карты как в первом блоке лендинга — браузерная рамка + скриншот + CTA + пульсирующий hint. */
function mapPreviewHtml({ href = '/map/pavlodar', hintText = 'Актуальные данные по адресам · обновляется каждый час' } = {}) {
  return `<section class="screen-sec wrap rv" id="mapsec">
    <div class="browser">
      <div class="bar">
        <span class="dots"><i></i><i></i><i></i></span>
        <span class="url">barjok.kz<b>/map</b></span>
        <span style="width:44px"></span>
      </div>
      <a class="mapshot" href="${esc(href)}" aria-label="Открыть карту">
        <img class="mapshot-img" src="/map-preview.jpg" alt="Живая карта отключений" loading="lazy" width="1600" height="863">
        <div class="map-cta">
          <span class="btn primary lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z"/><path d="M9 7v13M15 4v13"/></svg>
            <span>Открыть карту</span>
          </span>
          <span class="map-hint"><span class="ld"></span><span class="map-hint-text">${esc(hintText)}</span></span>
        </div>
      </a>
    </div>
  </section>`;
}

/* Иконка для каждой карточки своя — иначе выглядит шаблонно (все булавки). */
const FEAT_ICONS = {
  pin: '<path d="M12 21s-7-5.7-7-11a7 7 0 0 1 14 0c0 5.3-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/>',
  shield: '<path d="M12 3l7 3v6c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6l7-3z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16"/><path d="m9.5 15 1.7 1.7L15 13"/>',
};

const TRUST_FEATURES = [
  ['pin', 'Точная привязка к дому', 'Разворачиваем «улицу» в конкретные дома и показываем отключение только тем, кого оно реально касается.'],
  ['shield', 'Данные поставщиков, не слухи', 'Каждое отключение — из официального источника, с датой и причиной, плюс подтверждение жителями.'],
  ['clock', 'Обновляется каждые 3 часа', 'Не нужно искать в чатах и на сайтах ведомств — актуальный статус всегда под рукой.'],
  ['calendar', 'Видно и будущее', 'Плановые работы показываем заранее — можно набрать воды или зарядить технику до отключения.'],
];

function trustGridHtml(features = TRUST_FEATURES) {
  return sectionHeadHtml('Почему нам можно верить', 'Не слухи из чатов, а данные поставщиков') + `
  <div class="feat-grid rv wrap">
    ${features.map(([icon, title, desc]) => `<div class="feat">
      <span class="fi" style="background:var(--accent-wash);color:var(--accent-ink)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FEAT_ICONS[icon] || FEAT_ICONS.pin}</svg></span>
      <h3>${esc(title)}</h3>
      <p>${esc(desc)}</p>
    </div>`).join('')}
  </div>`;
}

/* Анимированный блок "Сообщить о проблеме" — живой мокап с печатающимся текстом
   и чек-анимацией отправки, как в первом экране лендинга (#report-cta/.rc-band). */
function reportCtaHtml({ href = '/map/?report=1' } = {}) {
  return `<section class="wrap rv" id="report-cta">
    <div class="rc-band">
      <div class="rc-text">
        <div class="eyebrow">Не нашли своё отключение?</div>
        <h2>Проблема есть, а на карте — нет? Сообщите нам</h2>
        <p>Иногда авария случается раньше, чем поставщик её опубликует. Нажмите «Сообщить о проблеме», опишите, что отключено — после проверки это появится на карте.</p>
        <a class="btn primary lg" href="${esc(href)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          <span>Сообщить о проблеме</span>
        </a>
      </div>
      <div class="rc-anim" aria-hidden="true">
        <div class="rc-mock">
          <div class="rc-mhead"><span class="rc-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></span>Сообщить о проблеме</div>
          <div class="rc-seg"><span class="on">Жалоба</span><span>Предложение</span></div>
          <div class="rc-field"><span class="rc-type">Нет холодной воды</span></div>
          <div class="rc-field" style="min-height:44px"><span class="rc-type" style="animation-delay:.6s">улица Естая, 25</span></div>
          <div class="rc-send" style="position:relative">
            <span class="rc-def">Отправить</span>
            <span class="rc-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg>Отправлено</span>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* Блок "3 шага" — как найти свой адрес. Живой мокап (поиск → карточка дома →
   итог дня), тот же паттерн, что был в первом экране лендинга (.step/.demo). */
function stepsHtml({ addressSample = 'Естая, 38' } = {}) {
  return sectionHeadHtml('Как это работает', 'Три шага до ответа «есть или нет»',
    `Информация об отключениях уже существует — она просто разбросана по сайтам поставщиков и чатам. Мы собираем её каждые несколько часов и показываем по твоему дому.`) + `
  <div class="step rv wrap">
    <div class="txt">
      <span class="k">1</span>
      <h3>Введи адрес</h3>
      <p>Улица и номер дома — подсказки помогут найти нужный дом быстро.</p>
    </div>
    <div class="demo">
      <div class="searchbox">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/></svg>
        ${esc(addressSample)}<span class="cur"></span>
      </div>
      <div class="filters">
        <span class="fchip"><span class="d" style="background:var(--hot)"></span><span>Горячая вода</span></span>
        <span class="fchip"><span class="d" style="background:var(--elec)"></span><span>Свет</span></span>
        <span class="fchip"><span class="d" style="background:var(--cold)"></span><span>Холодная вода</span></span>
        <span class="fchip"><span class="d" style="background:var(--hot)"></span><span>Отопление</span></span>
      </div>
    </div>
  </div>

  <div class="step rev rv wrap">
    <div class="txt">
      <span class="k">2</span>
      <h3>Увидь, что отключено</h3>
      <p>Карточка по дому: какая система, когда отключили, когда восстановят и почему. Ничего лишнего с чужих улиц.</p>
    </div>
    <div class="demo">
      <div class="ocard">
        <div class="h"><b>${esc(addressSample)}</b><span>отключено 2 системы</span></div>
        <div class="row">
          <span class="ic" style="background:var(--hot)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a5.5 5.5 0 0 0 5.5-5.5c0-3.4-5.5-8.5-5.5-8.5s-5.5 5.1-5.5 8.5A5.5 5.5 0 0 0 12 22z"/></svg></span>
          <div class="rt"><b>Горячая вода</b><span class="tag">Плановое</span>
            <div class="when">Восстановят <b>сегодня, 23:59</b></div>
            <div class="meta">Гидравлические испытания теплосети</div></div>
        </div>
        <div class="row">
          <span class="ic" style="background:var(--elec)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span>
          <div class="rt"><b>Электричество</b><span class="tag">Плановое</span>
            <div class="when">Восстановят <b>17:00</b></div>
            <div class="meta">Капитальный ремонт · ТП-5РУ</div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="step rv wrap">
    <div class="txt">
      <span class="k">3</span>
      <h3>Планируй день</h3>
      <p>Набрать воды заранее, зарядить технику, перенести стирку. Видно и текущие, и будущие отключения на карте.</p>
    </div>
    <div class="demo" style="padding:0;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid var(--line-2);display:flex;gap:10px;align-items:center">
        <span class="ic" style="background:var(--accent);width:30px;height:30px"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M5 12l5 5 9-11"/></svg></span>
        <div><b style="font-weight:800">По вашему адресу всё в порядке</b><div style="font-size:12.5px;color:var(--ink-3)">Вода и свет в норме</div></div>
      </div>
      <div style="padding:14px 20px;display:flex;gap:22px">
        <div><div style="font-size:22px;font-weight:800;color:var(--accent)">927</div><div style="font-size:12px;color:var(--ink-3);font-weight:600">сейчас</div></div>
        <div><div style="font-size:22px;font-weight:800;color:var(--ink)">2 612</div><div style="font-size:12px;color:var(--ink-3);font-weight:600">скоро</div></div>
        <div><div style="font-size:22px;font-weight:800;color:var(--hot)">941</div><div style="font-size:12px;color:var(--ink-3);font-weight:600">без гор. воды</div></div>
      </div>
    </div>
  </div>`;
}

/* Цветные интерактивные плитки услуг вместо шаблонных белых карточек —
   у каждого ресурса свой фирменный акцент (совпадает с .fchip/.ic на карте). */
const SERVICE_TILE_META = {
  voda: { color: 'var(--cold)', icon: '<path d="M12 3c3.2 4.2 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 2.8-6.8 6-11z"/>' },
  svet: { color: 'var(--elec)', icon: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>' },
  otoplenie: { color: 'var(--hot)', icon: '<path d="M12 22a5.5 5.5 0 0 0 5.5-5.5c0-3.4-5.5-8.5-5.5-8.5s-5.5 5.1-5.5 8.5A5.5 5.5 0 0 0 12 22z"/>' },
  'planovye-otklyucheniya': { color: 'var(--accent)', icon: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16"/>' },
  'avariynye-otklyucheniya': { color: 'var(--emerg)', icon: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>' },
  'po-adresu': { color: 'var(--ink)', icon: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>' },
};

function serviceTilesHtml(citySlug, items) {
  return `<div class="svc-grid rv wrap">${items.map(([slug, label]) => {
    const meta = SERVICE_TILE_META[slug] || SERVICE_TILE_META['po-adresu'];
    return `<a class="svc-tile" href="/${citySlug}/${slug}/" style="--svc-c:${meta.color}">
      <span class="svc-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${meta.icon}</svg></span>
      <b>${esc(label)}</b>
      <svg class="svc-arw" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </a>`;
  }).join('')}</div>`;
}

function faqAccordionHtml(list, idPrefix = 'faq') {
  if (!list || !list.length) return '';
  return `<section class="sec wrap rv" id="${esc(idPrefix)}">
    <div class="eyebrow">Частые вопросы</div>
    <h2>Отвечаем на главное</h2>
    <div class="faq-col" style="margin-top:26px">
      ${list.map(([q, a]) => `<details class="faq-item">
        <summary>${esc(q)}</summary>
        <div class="faq-a">${esc(a)}</div>
      </details>`).join('')}
    </div>
  </section>`;
}

function ctaFinalHtml({ title = 'Проверьте свой адрес прямо сейчас', text = 'Вода, свет, отопление — весь статус по дому за 5 секунд.', href = '/map/pavlodar', btnText = 'Открыть карту' } = {}) {
  return `<section class="wrap rv" style="margin-top:56px">
    <div class="cta-final">
      <div class="shine"></div>
      <div class="cta-in" style="position:relative;z-index:2;padding:48px 40px;text-align:center;color:#fff">
        <h2 style="color:#fff;font-size:clamp(24px,3.4vw,34px);font-weight:800;letter-spacing:-.02em">${esc(title)}</h2>
        <p style="color:rgba(255,255,255,.85);margin-top:12px;font-size:16px">${esc(text)}</p>
        <a class="btn lg cta-btn" href="${esc(href)}" style="margin-top:22px;background:#fff;color:var(--accent-ink);display:inline-flex">${esc(btnText)}</a>
      </div>
    </div>
  </section>`;
}

module.exports = { sectionHeadHtml, statRowHtml, minimalStatsHtml, mapPreviewHtml, stepsHtml, serviceTilesHtml, trustGridHtml, reportCtaHtml, faqAccordionHtml, ctaFinalHtml, TRUST_FEATURES };
