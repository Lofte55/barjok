/*
 * Информационный баннер об использовании cookie — единый для всех страниц
 * (/, /map/, /ads). Подключать одной строкой: <script defer src="/cookie-consent.js"></script>
 *
 * Модель: УВЕДОМЛЕНИЕ (не consent-gate). Аналитика (Яндекс.Метрика) работает всегда;
 * баннер сообщает об этом и по кнопке «Подробнее» показывает список конкретных cookie.
 * Кнопка «Понятно» просто скрывает баннер (выбор помнится в localStorage).
 *
 * ⚠️ Счётчик Метрики живёт ЗДЕСЬ, а не инлайном в HTML — чтобы id и настройки были
 * в одном месте на все три страницы. Не дублировать его обратно в разметку.
 */
(function () {
  var KEY = 'barjoq_cookie_notice';       // 'seen'
  var METRIKA_ID = 111276553;

  function seen() { try { return localStorage.getItem(KEY) === 'seen'; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(KEY, 'seen'); } catch (e) {} }

  /* Яндекс.Метрика — стартует сразу при загрузке страницы */
  (function startMetrika() {
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      for (var j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) return; }
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js?id=' + METRIKA_ID, 'ym');
    window.ym(METRIKA_ID, 'init', {
      ssr: true, webvisor: true, clickmap: true, ecommerce: 'dataLayer',
      referrer: document.referrer, url: location.href,
      accurateTrackBounce: true, trackLinks: true,
    });
  })();

  if (seen()) return;                     // баннер уже показывали

  var LANG = (function () {
    try { if (localStorage.getItem('barjoq_lang') === 'kk') return 'kk'; } catch (e) {}
    return (document.documentElement.lang || 'ru').indexOf('kk') === 0 ? 'kk' : 'ru';
  })();

  var T = {
    ru: {
      text: 'Мы используем cookie и Яндекс.Метрику, чтобы понимать, как пользуются сервисом, и делать его удобнее.',
      more: 'Подробнее', hide: 'Свернуть', ok: 'Понятно',
      head: ['Cookie / хранилище', 'Зачем'],
      rows: [
        ['_ym_uid, _ym_d', 'Яндекс.Метрика: различает посетителей и дату первого визита'],
        ['_ym_isad', 'Яндекс.Метрика: определяет наличие блокировщика рекламы'],
        ['_ym_visorc', 'Яндекс.Метрика (вебвизор): запись действий на странице для анализа удобства'],
        ['barjoq_lang', 'Ваш выбор языка (RU / KZ)'],
        ['barjoq_notice_v1', 'Скрытая информационная плашка на карте'],
        ['barjoq_cookie_notice', 'То, что вы уже видели это уведомление'],
      ],
      note: 'Cookie Метрики можно удалить или заблокировать в настройках браузера — сервис продолжит работать.',
    },
    kk: {
      text: 'Сервисті ыңғайлы ету үшін cookie және Яндекс.Метрика қолданамыз.',
      more: 'Толығырақ', hide: 'Жию', ok: 'Түсінікті',
      head: ['Cookie / жад', 'Не үшін'],
      rows: [
        ['_ym_uid, _ym_d', 'Яндекс.Метрика: келушіні және алғашқы кіру күнін ажыратады'],
        ['_ym_isad', 'Яндекс.Метрика: жарнама бұғаттағышын анықтайды'],
        ['_ym_visorc', 'Яндекс.Метрика (вебвизор): бетпен жұмысты жазу'],
        ['barjoq_lang', 'Тіл таңдауыңыз (RU / KZ)'],
        ['barjoq_notice_v1', 'Картадағы жабылған ақпарат жолағы'],
        ['barjoq_cookie_notice', 'Осы хабарламаны көргеніңіз'],
      ],
      note: 'Метрика cookie-файлдарын браузер баптауларынан жоюға болады — сервис жұмысын жалғастырады.',
    },
  }[LANG];

  var CSS = ''
    + '.cc-bar{position:fixed;left:0;right:0;bottom:0;z-index:2000;padding:14px 18px;background:#fff;'
    + 'border-top:1px solid #e7eaef;box-shadow:0 -8px 30px rgba(20,30,50,.10);'
    + 'font-family:Manrope,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
    + 'transform:translateY(100%);transition:transform .35s cubic-bezier(.22,1,.36,1);max-height:82vh;overflow-y:auto}'
    + '.cc-bar.show{transform:none}'
    + '.cc-row{display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap}'
    + '.cc-text{font-size:13.5px;line-height:1.5;color:#5a6472;max-width:66ch;margin:0}'
    + '.cc-btns{display:flex;gap:9px;flex:none;align-items:center}'
    + '.cc-btn{border:0;border-radius:999px;padding:11px 20px;font-family:inherit;font-weight:700;font-size:13.5px;cursor:pointer;transition:background .2s,transform .1s}'
    + '.cc-btn:active{transform:translateY(1px)}'
    + '.cc-ok{background:#2f6bed;color:#fff}.cc-ok:hover{background:#1f5fe0}'
    + '.cc-more{background:transparent;color:#2f6bed;padding:11px 8px;text-decoration:underline}'
    + '.cc-list{display:none;max-width:900px;margin:14px auto 2px;border-top:1px solid #eef1f5;padding-top:12px}'
    + '.cc-list.open{display:block}'
    + '.cc-list table{width:100%;border-collapse:collapse;font-size:12.5px}'
    + '.cc-list th{text-align:left;color:#8a94a3;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.5px;padding:0 10px 7px 0}'
    + '.cc-list td{padding:7px 10px 7px 0;border-top:1px solid #f2f4f7;color:#5a6472;vertical-align:top;line-height:1.45}'
    + '.cc-list td:first-child{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#12161c;white-space:nowrap}'
    + '.cc-note{margin:10px 0 0;font-size:12px;color:#8a94a3}'
    + '@media(max-width:760px){.cc-row{justify-content:flex-start}.cc-text{font-size:13px}'
    + '.cc-btns{width:100%}.cc-ok{flex:1;padding:13px 14px}'
    + '.cc-list td:first-child{white-space:normal}}';

  function render() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    var rows = T.rows.map(function (r) {
      return '<tr><td></td><td></td></tr>';
    }).join('');

    var bar = document.createElement('div');
    bar.className = 'cc-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Cookie');
    bar.innerHTML = '<div class="cc-row"><p class="cc-text"></p>'
      + '<div class="cc-btns"><button class="cc-btn cc-more" type="button"></button>'
      + '<button class="cc-btn cc-ok" type="button"></button></div></div>'
      + '<div class="cc-list"><table><thead><tr><th></th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<p class="cc-note"></p></div>';

    bar.querySelector('.cc-text').textContent = T.text;
    bar.querySelector('.cc-more').textContent = T.more;
    bar.querySelector('.cc-ok').textContent = T.ok;
    var ths = bar.querySelectorAll('thead th');
    ths[0].textContent = T.head[0]; ths[1].textContent = T.head[1];
    var trs = bar.querySelectorAll('tbody tr');
    T.rows.forEach(function (r, i) {
      var tds = trs[i].querySelectorAll('td');
      tds[0].textContent = r[0]; tds[1].textContent = r[1];
    });
    bar.querySelector('.cc-note').textContent = T.note;

    document.body.appendChild(bar);
    requestAnimationFrame(function () { bar.classList.add('show'); });

    var list = bar.querySelector('.cc-list');
    bar.querySelector('.cc-more').onclick = function () {
      var open = list.classList.toggle('open');
      this.textContent = open ? T.hide : T.more;
    };
    bar.querySelector('.cc-ok').onclick = function () {
      markSeen();
      bar.classList.remove('show');
      setTimeout(function () { bar.remove(); }, 400);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
