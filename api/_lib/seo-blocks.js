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

const TRUST_FEATURES = [
  ['Точная привязка к дому', 'Разворачиваем «улицу» в конкретные дома и показываем отключение только тем, кого оно реально касается.'],
  ['Данные поставщиков, не слухи', 'Каждое отключение — из официального источника, с датой и причиной, плюс подтверждение жителями.'],
  ['Обновляется каждые 3 часа', 'Не нужно искать в чатах и на сайтах ведомств — актуальный статус всегда под рукой.'],
  ['Видно и будущее', 'Плановые работы показываем заранее — можно набрать воды или зарядить технику до отключения.'],
];

function trustGridHtml(features = TRUST_FEATURES) {
  return sectionHeadHtml('Почему нам можно верить', 'Не слухи из чатов, а данные поставщиков') + `
  <div class="feat-grid rv wrap">
    ${features.map(([title, desc]) => `<div class="feat">
      <span class="fi" style="background:var(--accent-wash);color:var(--accent-ink)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-5.7-7-11a7 7 0 0 1 14 0c0 5.3-7 11-7 11z"/><circle cx="12" cy="10" r="2.4"/></svg></span>
      <h3>${esc(title)}</h3>
      <p>${esc(desc)}</p>
    </div>`).join('')}
  </div>`;
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

module.exports = { sectionHeadHtml, statRowHtml, trustGridHtml, faqAccordionHtml, ctaFinalHtml, TRUST_FEATURES };
