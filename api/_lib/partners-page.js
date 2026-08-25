/*
 * Контент страницы /partners/ (B2B/B2G-оффер для коммунальных служб, акиматов
 * и городских организаций). Статическая страница без live-данных и без
 * казахской версии (см. ТЗ на страницу Partners — только RU на первом этапе).
 * Вынесена отдельным модулем, а не в pages.js, потому что контент большой —
 * так pages.js остаётся обзорным (венёт renderSeoPage), а сам оффер живёт
 * отдельно, как и остальные крупные генераторы блоков (seo-blocks.js, seo-cards.js).
 */
const { esc } = require('./seo-layout');
const { sectionHeadHtml, ctaFinalHtml, mapPreviewHtml } = require('./seo-blocks');

const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M5 12l5 5 9-11"/></svg>';
const ARROW_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function heroHtml() {
  return `<div style="text-align:center">
    <p class="lead rv">BARJOK превращает сообщения об аварийных и плановых работах в понятную информацию по конкретным адресам и показывает её жителям на карте.</p>
    <p class="lead rv" style="margin-top:10px;font-weight:700;color:var(--ink)">Меньше звонков диспетчеру. Меньше вопросов «Когда дадут воду?». Больше понятной информации для жителей.</p>
    <div class="pt-hero-cta rv">
      <a class="btn primary lg" href="#partner-form">Стать партнёром BARJOK</a>
      <a class="btn ghost lg" href="#how">Как это работает</a>
    </div>
  </div>`;
}

const AUDIENCE = ['Водоканалы', 'Теплосети', 'Энергокомпании', 'Коммунальные предприятия', 'Акиматы', 'Городские службы', 'ОСИ / КСК', 'Управляющие компании', 'СМИ', 'Поставщики городских данных'];
function audienceHtml() {
  return sectionHeadHtml('Кому подходит', 'BARJOK работает со всей городской инфраструктурой') + `
  <div class="pt-chips rv">
    ${AUDIENCE.map((a) => `<span class="pt-chip">${esc(a)}</span>`).join('')}
  </div>`;
}

function problemHtml() {
  return sectionHeadHtml('Проблема', 'Одно сообщение — сотни одинаковых вопросов',
    'Коммунальная служба публикует официальное объявление — а жителю приходится проделывать всю работу самому.') + `
  <div class="pt-quote rv">
    <p>«25 августа в связи с проведением ремонтных работ будет временно прекращена подача холодной воды по адресам…»</p>
  </div>
  <div class="pt-flowline rv">
    <span class="step">Найти публикацию</span>${ARROW_SVG}
    <span class="step">Прочитать большой текст</span>${ARROW_SVG}
    <span class="step">Найти свою улицу</span>${ARROW_SVG}
    <span class="step">Найти дом</span>${ARROW_SVG}
    <span class="step">Понять сроки</span>
  </div>
  <div class="pt-outcome rv">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    <span>Если не нашёл — звонит диспетчеру</span>
  </div>`;
}

function solutionHtml() {
  return sectionHeadHtml('Решение', 'BARJOK показывает каждому жителю только то, что касается его дома') + `
  <div class="pt-transform rv">
    <div class="pt-t-was">
      <b>Было</b>
      Большое текстовое объявление на несколько улиц сразу — без привязки к конкретному дому.
    </div>
    <div class="pt-t-arrow">${ARROW_SVG}</div>
    <div class="pt-t-now">
      <div class="ocard">
        <div class="h"><b>Естая, 38</b><span>Холодная вода</span></div>
        <div class="row">
          <span class="ic" style="background:var(--cold)"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c3.2 4.2 6 7.6 6 11a6 6 0 1 1-12 0c0-3.4 2.8-6.8 6-11z"/></svg></span>
          <div class="rt"><b>09:00–17:00</b><span class="tag">Плановые работы</span>
            <div class="meta">Источник: официальный партнёр</div></div>
        </div>
      </div>
      <a class="pt-src-badge" href="/map/pavlodar">${CHECK_SVG}<span>Посмотреть на карте</span></a>
    </div>
  </div>
  <div class="pt-quote rv" style="margin-top:30px;text-align:center;font-weight:700;color:var(--ink);font-size:16px">
    <p style="padding-left:0">Партнёр передаёт информацию один раз. BARJOK распределяет её по конкретным адресам.</p>
  </div>`;
}

const BENEFITS = [
  ['<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
    'Меньше нагрузки на диспетчерскую', 'Житель самостоятельно видит, что произошло, затронут ли его дом, когда начались работы, когда ожидается восстановление и изменилась ли ситуация.'],
  ['<path d="M13 2 4 14h6l-1 8 9-12h-6z"/>',
    'Быстрое информирование', 'Новое аварийное отключение или изменение срока можно быстро передать в BARJOK — без долгих согласований формата.'],
  ['<path d="M12 2 3 7v6c0 5.5 3.8 9.7 9 11 5.2-1.3 9-5.5 9-11V7l-9-5z"/><path d="M9 12l2 2 4-4"/>',
    'Официальный статус', 'Информация партнёра отмечается как «Подтверждено официальным источником» — это отличает её от обычных сообщений жителей.'],
  ['<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18M3 12h18"/>',
    'Адресное информирование', 'Не «отключение на нескольких улицах», а информация для каждого конкретно затронутого дома.'],
  ['<path d="M3 3v18h18"/><path d="M7 15l4-6 3 3 5-8"/>',
    'Статистика', 'Партнёр видит, сколько жителей увидело сообщение, какие районы затронуты, число подтверждений и сообщений о восстановлении.'],
];
function benefitsHtml() {
  return sectionHeadHtml('Что получает партнёр', 'Одно из главных преимуществ сотрудничества') + `
  <div class="feat-grid rv" style="margin-top:34px">
    ${BENEFITS.map(([icon, title, desc]) => `<div class="feat">
      <span class="pt-fi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>
      <div class="feat-text"><h3>${esc(title)}</h3><p>${esc(desc)}</p></div>
    </div>`).join('')}
  </div>`;
}

function howHtml() {
  return `<div id="how">${sectionHeadHtml('Как это работает', 'Вам не нужно менять привычную работу',
    'BARJOK должен подстраиваться под партнёра, а не наоборот.')}</div>
  <div class="pt-flow rv">
    <div class="pt-fstep">
      <span class="k">1</span>
      <div>
        <h3>Партнёр передаёт информацию</h3>
        <p>Любым удобным способом — не нужно ничего внедрять заранее.</p>
        <div class="pt-channels">
          <span class="pt-channel">WhatsApp</span>
          <span class="pt-channel">Telegram</span>
          <span class="pt-channel">Форма BARJOK</span>
          <span class="pt-channel">Email</span>
          <span class="pt-channel">Готовая таблица</span>
          <span class="pt-channel">Автоматическая передача</span>
        </div>
        <p class="pt-note">Для крупных организаций можем настроить автоматическую передачу данных без дополнительной работы сотрудников.</p>
      </div>
    </div>
    <div class="pt-fstep">
      <span class="k">2</span>
      <div><h3>BARJOK обрабатывает информацию</h3><p>Система определяет тип отключения, адреса, время, причину и конкретные затронутые дома.</p></div>
    </div>
    <div class="pt-fstep">
      <span class="k">3</span>
      <div><h3>Информация появляется на карте</h3><p>Жители находят свой адрес и получают понятный статус — без звонка диспетчеру.</p></div>
    </div>
    <div class="pt-fstep">
      <span class="k">4</span>
      <div><h3>Партнёр передаёт изменения</h3><p>Например: «Восстановление перенесено с 17:00 на 19:00» — BARJOK обновляет информацию для всех затронутых домов.</p></div>
    </div>
  </div>`;
}

function waterExampleHtml() {
  return sectionHeadHtml('Пример для водоканала', 'Один диспетчерский сигнал → информация для всех затронутых домов') + `
  <div class="pt-signal rv">Авария на водопроводной сети.
Естая 32–48.
Холодная вода.
Ориентировочно до 17:00.</div>
  <div class="pt-fanout rv">
    ${['38', '40'].map((h) => `<div class="ocard">
      <div class="h"><b>Естая ${h}</b><span>Холодная вода</span></div>
      <div class="row">
        <span class="ic" style="background:var(--emerg)"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></span>
        <div class="rt"><b>Аварийное отключение</b><span class="tag">Ориентировочно до 17:00</span></div>
      </div>
    </div>`).join('')}
  </div>`;
}

function feedbackHtml() {
  return sectionHeadHtml('Обратная связь', 'BARJOK может давать обратную связь',
    'Жители могут сообщать о статусе прямо по своему дому.') + `
  <div class="pt-fb-chips rv">
    <span class="pt-fb-chip">«Воды всё ещё нет»</span>
    <span class="pt-fb-chip">«Вода появилась»</span>
    <span class="pt-fb-chip">«Света всё ещё нет»</span>
    <span class="pt-fb-chip">«Электричество восстановлено»</span>
  </div>
  <div class="pt-quote rv" style="margin-top:22px">
    <p><b>12 жителей трёх домов сообщили, что подача ещё не восстановлена.</b></p>
  </div>
  <p class="pt-note rv">BARJOK помогает дополнительно видеть фактические сигналы от жителей после публикации официальной информации — это не заменяет официальные данные, а дополняет их.</p>`;
}

const NEEDED = ['Что отключено', 'Какие адреса затронуты', 'Время начала', 'Ориентировочное время восстановления', 'Причину', 'Изменения сроков', 'Информацию о восстановлении'];
function neededHtml() {
  return sectionHeadHtml('Что потребуется', 'От партнёра требуется только актуальная информация',
    'BARJOK берёт на себя дальнейшее отображение информации для жителей.') + `
  <div class="pt-check-grid rv">
    ${NEEDED.map((n) => `<div class="pt-check">${CHECK_SVG}<span>${esc(n)}</span></div>`).join('')}
  </div>`;
}

const SHARE = ['Разместить ссылку на BARJOK на своём сайте', 'Рассказать о BARJOK в социальных сетях', 'Добавить BARJOK в список способов получения информации об отключениях', 'Указывать ссылку на карту в публикациях', 'Рассказывать жителям, что статус своего дома можно проверить на BARJOK'];
function informHtml() {
  return sectionHeadHtml('Информационное партнёрство', 'Вместе помогаем жителям быстрее находить информацию',
    'От официальных партнёров BARJOK ожидает взаимную информационную поддержку.') + `
  <div class="pt-share-list rv">
    ${SHARE.map((s) => `<div class="pt-share-item">${ARROW_SVG}<span>${esc(s)}</span></div>`).join('')}
  </div>
  <div class="pt-quote rv" style="margin-top:22px;font-weight:700;color:var(--ink)">
    <p>Чем больше жителей знают о BARJOK, тем меньше необходимости обращаться в диспетчерскую за информацией, которую можно проверить самостоятельно.</p>
  </div>`;
}

function messageExampleHtml() {
  return sectionHeadHtml('Пример сообщения', 'Готовый формат для совместных публикаций') + `
  <div class="rv">
    <div class="pt-msg">Информацию об актуальных отключениях и сроках восстановления по своему адресу можно также проверить на BARJOK — barjok.kz.</div>
    <div class="pt-msg">Проверьте, затронут ли ваш дом, на карте BARJOK.</div>
  </div>`;
}

const WHY = [
  ['<circle cx="12" cy="12" r="7"/><path d="m20 20-3.4-3.4"/>', 'По конкретным адресам', 'Жителю не приходится искать свой дом в больших списках.'],
  ['<path d="M12 2 3 7v6c0 5.5 3.8 9.7 9 11 5.2-1.3 9-5.5 9-11V7l-9-5z"/>', 'Официальные данные + жители', 'BARJOK объединяет разные источники в одном месте.'],
  ['<path d="M9 20l-6-3V4l6 3 6-3 6 3v13l-6-3-6 3z"/><path d="M9 7v13M15 4v13"/>', 'Карта', 'Информацию проще воспринимать визуально.'],
  ['<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>', 'Мобильный формат', 'Житель может проверить ситуацию с телефона за несколько секунд.'],
  ['<path d="M3 3v18h18"/><path d="M7 15l4-6 3 3 5-8"/>', 'Масштабирование', 'Система рассчитана на подключение новых городов и коммунальных служб Казахстана.'],
];
function whyHtml() {
  return sectionHeadHtml('Почему BARJOK', 'Коротко о главном') + `
  <div class="feat-grid rv" style="margin-top:34px">
    ${WHY.map(([icon, title, desc]) => `<div class="feat">
      <span class="pt-fi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg></span>
      <div class="feat-text"><h3>${esc(title)}</h3><p>${esc(desc)}</p></div>
    </div>`).join('')}
  </div>
  <div class="pt-badge-demo rv">${CHECK_SVG}<b>Официальный партнёр BARJOK</b></div>`;
}

function statsMockHtml() {
  return sectionHeadHtml('Статистика партнёра', 'Что можно увидеть в кабинете партнёра') + `
  <div class="pt-stats-mock rv">
    <div><div class="n">28</div><div class="l">опубликованных отключений</div></div>
    <div><div class="n">14 820</div><div class="l">просмотров</div></div>
    <div><div class="n">8 400</div><div class="l">затронутых домов</div></div>
    <div><div class="n">1 240</div><div class="l">пользовательских подтверждений</div></div>
    <div><div class="n">320</div><div class="l">сообщений о восстановлении</div></div>
  </div>
  <p class="pt-stats-caption rv">Пример статистики партнёра — за месяц</p>`;
}

function valueChainHtml() {
  const steps = ['Партнёр сообщает об отключении', 'BARJOK определяет затронутые дома', 'Житель вводит свой адрес', 'Получает понятную информацию', 'Меньше звонков и повторяющихся вопросов'];
  return sectionHeadHtml('Логика BARJOK', 'Дайте жителям простой способ самостоятельно получать актуальную информацию — и сократите количество одинаковых обращений в диспетчерскую') + `
  <div class="pt-chain rv">
    ${steps.map((s, i) => `${i ? `<span class="pt-chain-arrow">${ARROW_SVG}</span>` : ''}<div class="pt-chain-step">${esc(s)}</div>`).join('')}
  </div>`;
}

function formHtml() {
  return `<div id="partner-form" class="pt-form-wrap rv">
    ${sectionHeadHtml('Заявка', 'Подключите свою организацию к BARJOK', 'Обсудим ваш текущий процесс информирования и подберём самый простой способ передачи данных. Вам не потребуется перестраивать работу диспетчерской.')}
    <form id="ptForm" novalidate>
      <input type="text" id="ptHp" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px;opacity:0" aria-hidden="true">
      <div class="pt-form-grid">
        <div class="pt-field"><label for="ptOrg">Организация <span class="req">*</span></label><input id="ptOrg" type="text" autocomplete="organization"></div>
        <div class="pt-field"><label for="ptCity">Город <span class="req">*</span></label><input id="ptCity" type="text" autocomplete="address-level2"></div>
        <div class="pt-field"><label for="ptName">Имя <span class="req">*</span></label><input id="ptName" type="text" autocomplete="name"></div>
        <div class="pt-field"><label for="ptPos">Должность</label><input id="ptPos" type="text"></div>
        <div class="pt-field"><label for="ptPhone">Телефон <span class="req">*</span></label><input id="ptPhone" type="tel" autocomplete="tel" placeholder="+7 7__ ___ __ __"></div>
        <div class="pt-field"><label for="ptContact">Email или WhatsApp</label><input id="ptContact" type="text"></div>
        <div class="pt-field full"><label for="ptComment">Комментарий</label><textarea id="ptComment" placeholder="Кратко о вашей организации и текущем процессе информирования"></textarea></div>
      </div>
      <div class="pt-form-err" id="ptErr"></div>
      <button class="btn primary lg pt-form-submit" id="ptSubmit" type="submit">Обсудить подключение</button>
    </form>
    <div class="pt-form-ok" id="ptOk">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.36 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
      <h3>Спасибо, заявка отправлена</h3>
      <p>Свяжемся с вами в течение рабочего дня.</p>
    </div>
  </div>
  <script>
  (function(){
    var form=document.getElementById('ptForm'), ok=document.getElementById('ptOk'), err=document.getElementById('ptErr'),
        submit=document.getElementById('ptSubmit'), hp=document.getElementById('ptHp');
    if(!form) return;
    function showErr(m){ err.textContent=m; err.classList.add('show'); }
    form.addEventListener('submit', function(e){
      e.preventDefault();
      err.classList.remove('show');
      var org=document.getElementById('ptOrg').value.trim(), city=document.getElementById('ptCity').value.trim(),
          name=document.getElementById('ptName').value.trim(), position=document.getElementById('ptPos').value.trim(),
          phone=document.getElementById('ptPhone').value.trim(), contact=document.getElementById('ptContact').value.trim(),
          comment=document.getElementById('ptComment').value.trim();
      if(!org) return showErr('Укажите организацию');
      if(!city) return showErr('Укажите город');
      if(!name) return showErr('Укажите имя');
      if(!phone) return showErr('Укажите телефон');
      submit.disabled=true; submit.textContent='Отправляем…';
      fetch('/api/report/', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ kind:'partner', org:org, city:city, name:name, position:position, phone:phone, contact:contact, message:comment, website:hp.value }),
      }).then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return { ok:r.ok, j:j }; }); })
        .then(function(res){
          if(res.ok && res.j.ok){ form.hidden=true; ok.classList.add('show'); }
          else if(res.j.error==='not_configured') showErr('Отправка ещё не настроена — напишите нам напрямую в футере сайта.');
          else showErr('Не удалось отправить. Попробуйте ещё раз.');
        })
        .catch(function(){ showErr('Нет связи. Проверьте интернет и повторите.'); })
        .finally(function(){ submit.disabled=false; submit.textContent='Обсудить подключение'; });
    });
  })();
  </script>`;
}

function renderPartnersBody() {
  return `
    ${heroHtml()}
    ${audienceHtml()}
    ${problemHtml()}
    ${solutionHtml()}
    ${mapPreviewHtml({ href: '/map/pavlodar', hintText: 'Реальный интерфейс BARJOK — карта с адресами и статусами' })}
    ${benefitsHtml()}
    ${howHtml()}
    ${waterExampleHtml()}
    ${feedbackHtml()}
    ${neededHtml()}
    ${informHtml()}
    ${messageExampleHtml()}
    ${whyHtml()}
    ${statsMockHtml()}
    ${valueChainHtml()}
    ${formHtml()}
    ${ctaFinalHtml({ title: 'Подключите свою организацию к BARJOK', text: 'Обсудим ваш текущий процесс информирования и подберём самый простой способ передачи данных.', href: '#partner-form', btnText: 'Стать партнёром' })}
  `;
}

module.exports = { renderPartnersBody };
