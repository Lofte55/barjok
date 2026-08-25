/*
 * Переиспользуемые маркетинговые блоки в стиле лендинга (landing/index.html) —
 * stat-row, feat-grid, FAQ-аккордеон, финальный CTA. Используются на всех
 * SEO SSR-страницах, чтобы не терять маркетинговую часть ради тонкого SEO-контента.
 */
const { esc } = require('./seo-layout');
const { dk } = require('./i18n-kk');

function sectionHeadHtml(eyebrow, h2, intro) {
  return `<div class="sec rv">
    <div class="eyebrow"${dk(eyebrow)}>${esc(eyebrow)}</div>
    <h2${dk(h2)}>${esc(h2)}</h2>
    ${intro ? `<p class="intro"${dk(intro)}>${esc(intro)}</p>` : ''}
  </div>`;
}

function statRowHtml({ affectedAddresses, electricityAffected, hotWaterAffected, coldWaterAffected }) {
  return `<section class="stats rv">
    <div class="stat-row">
      <div class="stat a"><div class="n">${(affectedAddresses || 0).toLocaleString('ru-RU')}</div><div class="l"${dk('адресов затронуто')}>адресов затронуто</div></div>
      <div class="stat b"><div class="n">${(electricityAffected || 0).toLocaleString('ru-RU')}</div><div class="l">домов без света</div></div>
      <div class="stat c"><div class="n">${(hotWaterAffected || 0).toLocaleString('ru-RU')}</div><div class="l">без горячей воды</div></div>
      <div class="stat d"><div class="n">${(coldWaterAffected || 0).toLocaleString('ru-RU')}</div><div class="l">без холодной воды</div></div>
    </div>
  </section>`;
}

/* Компактные unboxed-цифры под hero — в духе awesomic.com (не боксы, просто число+подпись в ряд).
   pairs: [ [числоBase, подпись, suffix?, colorVar?] ] — анимируются count-up от 0 при появлении
   в viewport. Цветная точка-индикатор у каждой цифры — визуально читается как "живые данные",
   даже когда все значения честно нулевые (нет активных отключений), а не как "сломано". */
function minimalStatsHtml(pairs, { allZero } = {}) {
  return `<div class="mini-stats rv">
    ${allZero ? `<div class="mini-stats-ok"><span class="ok-dot"></span><span${dk('Сейчас всё в порядке — активных отключений не найдено')}>Сейчас всё в порядке — активных отключений не найдено</span></div>` : ''}
    <div class="mini-stats-row">
    ${pairs.map(([n, l, suffix, color]) => `<div class="mstat">
      <b data-to="${Number(n) || 0}"${suffix ? ` data-suffix="${esc(suffix)}"` : ''}>0${suffix ? esc(suffix) : ''}</b>
      <span>${color ? `<span class="mstat-dot" style="background:${color}"></span>` : ''}<span${dk(l)}>${esc(l)}</span></span>
    </div>`).join('')}
    </div>
  </div>`;
}

/* Превью карты как в первом блоке лендинга — браузерная рамка + скриншот + CTA + пульсирующий hint. */
function mapPreviewHtml({ href = '/map/pavlodar', hintText = 'Актуальные данные по адресам · обновляется каждый час' } = {}) {
  return `<section class="screen-sec rv" id="mapsec">
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
            <span data-kk="Картаны ашу">Открыть карту</span>
          </span>
          <span class="map-hint"><span class="ld"></span><span class="map-hint-text"${dk(hintText)}>${esc(hintText)}</span></span>
        </div>
      </a>
    </div>
  </section>`;
}

/* Иконка для каждой карточки своя — иначе выглядит шаблонно (все булавки). */
// AI-иллюстрации с прозрачным фоном (OpenAI Images API, gpt-image-1, background:transparent)
const FEAT_IMAGES = {
  pin: '/images/trust-house-pin.png',
  shield: '/images/trust-verified-data.png',
  clock: '/images/trust-live-clock.png',
  calendar: '/images/trust-future-calendar.png',
};

const TRUST_FEATURES = [
  ['pin', 'Точная привязка к дому', 'Разворачиваем «улицу» в конкретные дома и показываем отключение только тем, кого оно реально касается.'],
  ['shield', 'Данные поставщиков, не слухи', 'Каждое отключение — из официального источника, с датой и причиной, плюс подтверждение жителями.'],
  ['clock', 'Обновляется каждые 3 часа', 'Не нужно искать в чатах и на сайтах ведомств — актуальный статус всегда под рукой.'],
  ['calendar', 'Видно и будущее', 'Плановые работы показываем заранее — можно набрать воды или зарядить технику до отключения.'],
];

// Без карточек-коробок (border-first anti-pattern при большом кол-ве плашек) —
// иллюстрация без фона + тонкая верхняя линия-разделитель, текст рядом крупным блоком.
function trustGridHtml(features = TRUST_FEATURES) {
  return sectionHeadHtml('Почему нам можно верить', 'Не слухи из чатов, а данные поставщиков') + `
  <div class="feat-grid">
    ${features.map(([icon, title, desc]) => `<div class="feat rv">
      <img class="fi-img" src="${FEAT_IMAGES[icon] || FEAT_IMAGES.pin}" alt="" width="96" height="96" loading="lazy">
      <div class="feat-text">
        <h3${dk(title)}>${esc(title)}</h3>
        <p${dk(desc)}>${esc(desc)}</p>
      </div>
    </div>`).join('')}
  </div>`;
}

/* Анимированный блок "Сообщить о проблеме" — живой мокап с печатающимся текстом
   и чек-анимацией отправки, как в первом экране лендинга (#report-cta/.rc-band). */
function reportCtaHtml({ href = '/map/?report=1' } = {}) {
  return `<section class="rv" id="report-cta">
    <div class="rc-band">
      <div class="rc-text">
        <div class="eyebrow" data-kk="Өз ажыратуыңызды таппадыңыз ба?">Не нашли своё отключение?</div>
        <h2 data-kk="Мәселе бар, ал картада жоқ па? Бізге хабарлаңыз">Проблема есть, а на карте — нет? Сообщите нам</h2>
        <p data-kk="Кейде апат жеткізуші оны жариялағанға дейін болады. «Мәселе туралы хабарлау» түймесін басып, не ажыратылғанын жазыңыз — тексерілгеннен кейін бұл картада пайда болады.">Иногда авария случается раньше, чем поставщик её опубликует. Нажмите «Сообщить о проблеме», опишите, что отключено — после проверки это появится на карте.</p>
        <a class="btn primary lg" href="${esc(href)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>
          <span data-kk="Мәселе туралы хабарлау">Сообщить о проблеме</span>
        </a>
      </div>
      <div class="rc-anim" aria-hidden="true">
        <div class="rc-mock">
          <div class="rc-mhead"><span class="rc-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></span><span data-kk="Мәселе туралы хабарлау">Сообщить о проблеме</span></div>
          <div class="rc-seg"><span class="on" data-kk="Шағым">Жалоба</span><span data-kk="Ұсыныс">Предложение</span></div>
          <div class="rc-field"><span class="rc-type" data-kk="Суық су жоқ">Нет холодной воды</span></div>
          <div class="rc-field" style="min-height:44px"><span class="rc-type" style="animation-delay:.6s">улица Естая, 25</span></div>
          <div class="rc-send" style="position:relative">
            <span class="rc-def" data-kk="Жіберу">Отправить</span>
            <span class="rc-ok"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg><span data-kk="Жіберілді">Отправлено</span></span>
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

/* Блок "3 шага" — как найти свой адрес. Живой мокап (поиск → карточка дома →
   итог дня), тот же паттерн, что был в первом экране лендинга (.step/.demo). */
function stepsHtml({ addressSample = 'Естая, 38' } = {}) {
  return sectionHeadHtml('Как это работает', 'Как начать',
    `Информация об отключениях уже существует — она просто разбросана по сайтам поставщиков и чатам. Мы собираем её каждые несколько часов и показываем по твоему дому.`) + `
  <div class="step rv">
    <div class="txt">
      <span class="k">1</span>
      <h3 data-kk="Мекенжайды енгіз">Введи адрес</h3>
      <p data-kk="Көше мен үй нөмірі — ұсыныстар керек үйді жылдам табуға көмектеседі.">Улица и номер дома — подсказки помогут найти нужный дом быстро.</p>
    </div>
    <div class="demo">
      <div class="searchbox">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/></svg>
        ${esc(addressSample)}<span class="cur"></span>
      </div>
      <div class="filters">
        <span class="fchip"><span class="d" style="background:var(--hot)"></span><span data-kk="Ыстық су">Горячая вода</span></span>
        <span class="fchip"><span class="d" style="background:var(--elec)"></span><span data-kk="Жарық">Свет</span></span>
        <span class="fchip"><span class="d" style="background:var(--cold)"></span><span data-kk="Суық су">Холодная вода</span></span>
        <span class="fchip"><span class="d" style="background:var(--hot)"></span><span data-kk="Жылыту">Отопление</span></span>
      </div>
    </div>
  </div>

  <div class="step rev rv">
    <div class="txt">
      <span class="k">2</span>
      <h3 data-kk="Не ажыратылғанын көр">Увидь, что отключено</h3>
      <p data-kk="Үй бойынша карточка: қай жүйе, қашан ажыратылды, қашан қосылады және неге. Басқа көшелерден артық ақпарат жоқ.">Карточка по дому: какая система, когда отключили, когда восстановят и почему. Ничего лишнего с чужих улиц.</p>
    </div>
    <div class="demo">
      <div class="ocard">
        <div class="h"><b>${esc(addressSample)}</b><span data-kk="2 жүйе ажыратылған">отключено 2 системы</span></div>
        <div class="row">
          <span class="ic" style="background:var(--hot)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 22a5.5 5.5 0 0 0 5.5-5.5c0-3.4-5.5-8.5-5.5-8.5s-5.5 5.1-5.5 8.5A5.5 5.5 0 0 0 12 22z"/></svg></span>
          <div class="rt"><b data-kk="Ыстық су">Горячая вода</b><span class="tag" data-kk="Жоспарлы">Плановое</span>
            <div class="when"><span data-kk="Қосылады">Восстановят</span> <b data-kk="бүгін, 23:59">сегодня, 23:59</b></div>
            <div class="meta" data-kk="Жылу желісінің гидравликалық сынағы">Гидравлические испытания теплосети</div></div>
        </div>
        <div class="row">
          <span class="ic" style="background:var(--elec)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h6l-1 8 9-12h-6z"/></svg></span>
          <div class="rt"><b data-kk="Электр">Электричество</b><span class="tag" data-kk="Жоспарлы">Плановое</span>
            <div class="when"><span data-kk="Қосылады">Восстановят</span> <b>17:00</b></div>
            <div class="meta" data-kk="Күрделі жөндеу · ТП-5РУ">Капитальный ремонт · ТП-5РУ</div></div>
        </div>
      </div>
    </div>
  </div>

  <div class="step rv">
    <div class="txt">
      <span class="k">3</span>
      <h3 data-kk="Күніңді жоспарла">Планируй день</h3>
      <p data-kk="Алдын ала су жинап қою, техниканы зарядтау, кір жууды басқа уақытқа ауыстыру. Картада қазіргі және болашақ ажыратулар да көрінеді.">Набрать воды заранее, зарядить технику, перенести стирку. Видно и текущие, и будущие отключения на карте.</p>
    </div>
    <div class="demo" style="padding:0;overflow:hidden">
      <div style="padding:18px 20px;border-bottom:1px solid var(--line-2);display:flex;gap:10px;align-items:center">
        <span class="ic" style="background:var(--accent);width:30px;height:30px"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px"><path d="M5 12l5 5 9-11"/></svg></span>
        <div><b style="font-weight:800" data-kk="Сіздің мекенжай бойынша бәрі дұрыс">По вашему адресу всё в порядке</b><div style="font-size:12.5px;color:var(--ink-3)" data-kk="Су мен жарық қалыпты">Вода и свет в норме</div></div>
      </div>
      <div style="padding:14px 20px;display:flex;gap:22px">
        <div><div style="font-size:22px;font-weight:800;color:var(--accent)">927</div><div style="font-size:12px;color:var(--ink-3);font-weight:600" data-kk="қазір">сейчас</div></div>
        <div><div style="font-size:22px;font-weight:800;color:var(--ink)">2 612</div><div style="font-size:12px;color:var(--ink-3);font-weight:600" data-kk="жақында">скоро</div></div>
        <div><div style="font-size:22px;font-weight:800;color:var(--hot)">941</div><div style="font-size:12px;color:var(--ink-3);font-weight:600" data-kk="ыст. сусыз">без гор. воды</div></div>
      </div>
    </div>
  </div>`;
}

/* Цветные интерактивные плитки услуг вместо шаблонных белых карточек —
   у каждого ресурса свой фирменный акцент (совпадает с .fchip/.ic на карте). */
const SERVICE_TILE_META = {
  voda: { color: 'var(--cold)', icon: '<path d="M12 3c3.2 4.2 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 2.8-6.8 6-11z"/>', desc: 'Холодная и горячая вода по каждому дому — с датой и причиной.', descKk: 'Әр үй бойынша суық және ыстық су — күні мен себебімен.' },
  svet: { color: 'var(--elec)', icon: '<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>', desc: 'Плановые и аварийные отключения электричества по адресу.', descKk: 'Мекенжай бойынша жоспарлы және апаттық электр ажыратулары.' },
  otoplenie: { color: 'var(--hot)', icon: '<path d="M12 22a5.5 5.5 0 0 0 5.5-5.5c0-3.4-5.5-8.5-5.5-8.5s-5.5 5.1-5.5 8.5A5.5 5.5 0 0 0 12 22z"/>', desc: 'Статус теплоснабжения и график ремонтных работ.', descKk: 'Жылумен қамту мәртебесі және жөндеу жұмыстарының кестесі.' },
  'planovye-otklyucheniya': { color: 'var(--accent)', icon: '<rect x="4" y="5.5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16"/>', desc: 'Работы, о которых известно заранее — можно подготовиться.', descKk: 'Алдын ала белгілі жұмыстар — дайындалуға болады.' },
  'avariynye-otklyucheniya': { color: 'var(--emerg)', icon: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>', desc: 'Внезапные отключения из-за аварий на сетях.', descKk: 'Желідегі апаттарға байланысты кенеттен ажыратулар.' },
  'po-adresu': { color: 'var(--ink)', icon: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>', desc: 'Введите улицу и дом — покажем всё, что отключено именно у вас.', descKk: 'Көше мен үйді енгізіңіз — сізде нақты не ажыратылғанын көрсетеміз.' },
};

// lang — ТОЛЬКО префикс для href (текст плиток по-прежнему data-kk + bakeKk()).
function serviceTilesHtml(citySlug, items, lang) {
  const p = lang === 'kk' ? '/kz' : '';
  return `<div class="svc-grid">${items.map(([slug, label]) => {
    const meta = SERVICE_TILE_META[slug] || SERVICE_TILE_META['po-adresu'];
    return `<a class="svc-tile rv" href="${p}/${citySlug}/${slug}/" style="--svc-c:${meta.color}">
      <span class="svc-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${meta.icon}</svg></span>
      <b${dk(label)}>${esc(label)}<svg class="svc-arw" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></b>
      <span class="svc-desc"${meta.descKk ? ` data-kk="${esc(meta.descKk)}"` : ''}>${esc(meta.desc)}</span>
    </a>`;
  }).join('')}</div>`;
}

/* Двухколоночный FAQ в духе awesomic.com: слева заголовок + карточка "остались
   вопросы", справа — вопросы pill-строками (не белые карточки с рамкой, а
   мягкий тонированный фон) с шевроном, который поворачивается при открытии. */
function faqAccordionHtml(list, idPrefix = 'faq', { contactHref = '/map/?report=1' } = {}) {
  if (!list || !list.length) return '';
  return `<section class="sec rv" id="${esc(idPrefix)}">
    <div class="faq-layout">
      <div class="faq-side">
        <div class="eyebrow" data-kk="Жиі қойылатын сұрақтар">Частые вопросы</div>
        <h2 style="white-space:nowrap" data-kk="Сұрақтарыңыз бар ма?">Есть вопросы?</h2>
        <div class="faq-contact rv">
          <b data-kk="Сұрақтарыңыз қалды ма?">Остались вопросы?</b>
          <p data-kk="Бізге жазыңыз — жауап береміз және қажет болса, тізімді толықтырамыз.">Напишите нам — ответим и, если нужно, дополним этот список.</p>
          <a class="btn primary" href="${esc(contactHref)}" data-kk="Бізге жазу">Написать нам</a>
        </div>
      </div>
      <div class="faq-list">
        ${list.map(([q, a]) => `<details class="faq-pill rv">
          <summary><span${dk(q)}>${esc(q)}</span><svg class="faq-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></summary>
          <div class="faq-a"${dk(a)}>${esc(a)}</div>
        </details>`).join('')}
      </div>
    </div>
  </section>`;
}

/* Вертикальный таймлайн (история проекта / roadmap) — тонкая линия + точки-статусы,
   каждый пункт с классом .rv, чтобы появляться по одному при скролле, как и весь
   остальной сайт (используется в /about/). status: 'done' | 'active' | 'next'. */
function timelineHtml(items, { eyebrow, title, intro } = {}) {
  const head = eyebrow || title ? sectionHeadHtml(eyebrow, title, intro) : '';
  return head + `
  <div class="timeline">
    ${items.map((it) => `<div class="tl-item rv">
      <span class="tl-dot ${esc(it.status || 'next')}"><span class="in"></span></span>
      <div class="tl-year">${esc(it.year)}</div>
      <h3>${esc(it.title)}</h3>
      <p>${esc(it.text)}</p>
    </div>`).join('')}
  </div>`;
}

function ctaFinalHtml({ title = 'Проверьте свой адрес прямо сейчас', text = 'Вода, свет, отопление — весь статус по дому за 5 секунд.', href = '/map/pavlodar', btnText = 'Открыть карту', titleKk, textKk } = {}) {
  // titleKk/textKk — для динамических заголовков с подстановкой города/услуги,
  // где готового перевода в словаре dk() по определению быть не может (город/
  // услуга разные на каждой странице). Если не передан — dk() пробует словарь.
  const titleAttr = titleKk ? ` data-kk="${esc(titleKk)}"` : dk(title);
  const textAttr = textKk ? ` data-kk="${esc(textKk)}"` : dk(text);
  const pins = [
    { c: 'var(--hot)', x: '8%', y: '18%', dl: '0s' },
    { c: 'var(--elec)', x: '88%', y: '22%', dl: '.9s' },
    { c: 'var(--cold)', x: '15%', y: '74%', dl: '1.7s' },
    { c: '#fff', x: '92%', y: '70%', dl: '.4s' },
  ];
  return `<section class="rv" style="margin-top:76px">
    <div class="cta-final">
      <div class="shine"></div>
      ${pins.map((p) => `<span class="fpin" style="--c:${p.c};--x:${p.x};--y:${p.y};--dl:${p.dl}"></span>`).join('')}
      <div class="cta-in" style="position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;text-align:center;color:#fff">
        <h2 style="color:#fff;font-size:clamp(24px,3.4vw,34px);font-weight:800;letter-spacing:-.02em;max-width:20ch"${titleAttr}>${esc(title)}</h2>
        <p style="color:rgba(255,255,255,.85);margin-top:12px;font-size:16px;max-width:46ch"${textAttr}>${esc(text)}</p>
        <a class="btn lg cta-btn" href="${esc(href)}" style="background:#fff;color:var(--accent-ink)"${dk(btnText)}>${esc(btnText)}</a>
      </div>
    </div>
  </section>`;
}

module.exports = { sectionHeadHtml, statRowHtml, minimalStatsHtml, mapPreviewHtml, stepsHtml, serviceTilesHtml, trustGridHtml, reportCtaHtml, faqAccordionHtml, ctaFinalHtml, timelineHtml, TRUST_FEATURES };
