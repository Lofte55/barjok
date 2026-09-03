/*
 * Общий каркас страниц /admin/* — шапка + боковое меню. Каждая страница передаёт
 * только свой контент и id пункта меню, который подсветить.
 */
const NAV = [
  { id: 'incidents', href: '/admin', label: 'События', icon: '💧' },
  { id: 'settings', href: '/admin/settings', label: 'Настройки', icon: '⚙️' },
  { id: 'ads', href: '/admin/ads', label: 'ADS', icon: '📣' },
  { id: 'analytics', href: '/admin/analytics', label: 'Аналитика', icon: '📊' },
];

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; background: #0f1115; color: #e7e9ee; display: flex; min-height: 100vh; }
  .side { width: 220px; flex: none; background: #12141a; border-right: 1px solid #232733; padding: 20px 12px; }
  .brand { font-weight: 700; font-size: 16px; padding: 0 10px 18px; color: #e7e9ee; }
  .brand span { color: #6ea8ff; }
  .nav a { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; color: #b7bdc9; text-decoration: none; font-size: 14px; margin-bottom: 2px; }
  .nav a:hover { background: #1b1f29; color: #e7e9ee; }
  .nav a.on { background: #1d2b4d; color: #9ec1ff; }
  .nav .ic { width: 18px; text-align: center; }
  main { flex: 1; padding: 24px; min-width: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #9aa2b1; font-size: 13px; margin-bottom: 20px; }
  .card { background: #171a21; border: 1px solid #262b36; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  form.new { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  input, select { background: #0f1115; border: 1px solid #2c3140; color: #e7e9ee; border-radius: 8px; padding: 8px 10px; font-size: 14px; }
  input[name=address] { flex: 1; min-width: 220px; }
  button { background: #2f6bed; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-size: 14px; cursor: pointer; }
  button.ghost { background: transparent; border: 1px solid #2c3140; color: #e7e9ee; }
  button.ghost.on { background: #1d2b4d; border-color: #2f6bed; color: #9ec1ff; }
  button:disabled { opacity: .5; cursor: default; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #232733; vertical-align: top; }
  th { color: #9aa2b1; font-weight: 500; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
  .b-active { background: #4a1f1f; color: #ff8a80; }
  .b-restored { background: #16321f; color: #7be08a; }
  .b-manual { background: #3a2f10; color: #ffcf6b; }
  .b-new { background: #1a2f47; color: #6ab6ff; }
  .muted { color: #6b7280; }
  .actions button { margin-right: 6px; margin-bottom: 4px; }
  .actions select.dur-sel, .actions input.dur-custom-val, .actions select.dur-custom-unit
    { margin-right: 6px; margin-bottom: 4px; padding: 6px 8px; font-size: 12.5px; vertical-align: middle;
      background: #0f1115; border: 1px solid #2c3140; color: #e7e9ee; border-radius: 8px; }
  .actions input.dur-custom-val { width: 60px; }
  .empty { color: #6b7280; padding: 20px 0; text-align: center; }
  .soon { text-align: center; padding: 60px 20px; color: #6b7280; }
  .soon b { color: #9aa2b1; display: block; margin-bottom: 6px; font-size: 15px; }

  /* ============ Мобильная адаптация (≤760px) ============
     Раньше .side был жёстко 220px, а <table> — обычной таблицей без обёртки:
     на телефоне это либо горизонтальный скролл всей страницы, либо нечитаемая
     мелкая сетка из 8 колонок. Меню сворачивается в горизонтальную полосу
     сверху, таблица — в стопку карточек (по одной строке-инциденту на карточку,
     подписи колонок — через data-label на <td>, см. api/admin.js:render()). */
  @media (max-width: 760px) {
    body { flex-direction: column; }
    .side { width: 100%; border-right: none; border-bottom: 1px solid #232733; padding: 12px; }
    .brand { padding: 0 6px 10px; }
    .nav { display: flex; gap: 4px; overflow-x: auto; -webkit-overflow-scrolling: touch; padding-bottom: 2px; }
    .nav a { flex: none; white-space: nowrap; margin-bottom: 0; }
    main { padding: 14px; }
    .card { padding: 12px; }
    form.new { gap: 6px; }
    input, select, button, .csel-btn { font-size: 16px; }  /* ≥16px — iOS Safari не зумит инпут при фокусе */

    table, thead, tbody, tr { display: block; width: 100%; }
    thead { position: absolute; left: -9999px; top: -9999px; }  /* убираем заголовок визуально, оставляем для скринридеров */
    tbody tr {
      display: block; margin-bottom: 10px; padding: 10px 10px 6px;
      background: #12141a; border: 1px solid #232733; border-radius: 10px;
    }
    tbody tr td { display: block; border-bottom: none; padding: 5px 0; }
    tbody tr td:before {
      content: attr(data-label); display: block; font-size: 11px; color: #6b7280;
      text-transform: uppercase; letter-spacing: .02em; margin-bottom: 2px;
    }
    tbody tr td:empty, tbody tr td[data-label]:has(> :only-child:empty) { display: none; }
    tbody tr td.actions { padding-top: 8px; border-top: 1px solid #232733; margin-top: 4px; }
    tbody tr td.actions:before { display: none; }
    tbody tr td.actions button, tbody tr td.actions select.dur-sel,
    tbody tr td.actions input.dur-custom-val, tbody tr td.actions select.dur-custom-unit { font-size: 13px; }
  }

  /* ============ .csel — кастомный (не системный) select, тёмная тема ============
     Тот же компонент, что на карте (map/styles.css) — оборачивает <select> в
     <div class="csel" data-csel>, сам select остаётся невидимым источником
     значения, поверх — кнопка + список в стиле панели. Инициализация — общий
     скрипт ниже, работает на любой странице /admin/*, для любого числа селектов. */
  .csel { position: relative; display: inline-block; }
  .csel-native { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; pointer-events: none; }
  .csel-btn { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-width: 140px;
    background: #0f1115; border: 1px solid #2c3140; color: #e7e9ee; border-radius: 8px; padding: 8px 10px;
    font-family: inherit; font-size: 14px; text-align: left; cursor: pointer; }
  .csel-btn:focus-visible, .csel.open .csel-btn { border-color: #2f6bed; box-shadow: 0 0 0 3px rgba(47,107,237,.25); }
  .csel-val { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .csel-chev { flex: none; color: #6b7280; transition: transform .18s; }
  .csel.open .csel-chev { transform: rotate(180deg); }
  .csel-menu { position: absolute; top: calc(100% + 6px); left: 0; min-width: 100%; z-index: 20; max-height: 260px; overflow-y: auto;
    background: #171a21; border: 1px solid #2c3140; border-radius: 10px; box-shadow: 0 20px 40px -12px rgba(0,0,0,.6);
    padding: 5px; opacity: 0; visibility: hidden; transform: translateY(-6px); transition: .16s; }
  .csel.open .csel-menu { opacity: 1; visibility: visible; transform: none; }
  .csel-opt { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%;
    background: none; border: 0; font-family: inherit; font-size: 13.5px; font-weight: 500; color: #e7e9ee;
    padding: 8px 9px; border-radius: 7px; cursor: pointer; text-align: left; white-space: nowrap; }
  .csel-val.placeholder { color: #8a92a3; }
  .csel-opt:hover, .csel-opt.active { background: #1b1f29; }
  .csel-opt.on { color: #9ec1ff; }
  .csel-opt .csel-check { width: 15px; height: 15px; flex: none; color: #2f6bed; visibility: hidden; }
  .csel-opt.on .csel-check { visibility: visible; }
`;

/* ⚠️⚠️ ПАРНЫЙ ФАЙЛ: точно такой же buildCsel живёт инлайном в map/index.html.
 * Дублирование вынужденное (карта — статический HTML без шаблонизатора, сюда
 * не может сделать require). Копии УЖЕ РАЗЪЕЗЖАЛИСЬ: класс csel-native был
 * добавлен только в одну, обработка placeholder — только в другую.
 * ПРАВИЛО: любая правка buildCsel/.csel-* вносится СРАЗУ В ОБА МЕСТА. */
const CSEL_SCRIPT = `
document.addEventListener('DOMContentLoaded', function () {
  function buildCsel(wrap) {
    var sel = wrap.querySelector('select');
    if (!sel || wrap.dataset.cselReady) return;
    wrap.dataset.cselReady = '1';
    sel.classList.add('csel-native');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'csel-btn';
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="csel-val"></span><svg class="csel-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    var menu = document.createElement('div');
    menu.className = 'csel-menu'; menu.setAttribute('role', 'listbox'); menu.hidden = true;
    var valEl = btn.querySelector('.csel-val');
    var opts = [];
    function renderLabel() {
      var opt = sel.options[sel.selectedIndex];
      valEl.textContent = opt ? opt.textContent : '';
      valEl.classList.toggle('placeholder', !!(opt && !opt.value));
      opts.forEach(function (o) { o.el.classList.toggle('on', o.opt === opt); o.el.setAttribute('aria-selected', o.opt === opt ? 'true' : 'false'); });
    }
    [].slice.call(sel.options).forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'csel-opt'; b.setAttribute('role', 'option');
      b.innerHTML = '<span>' + opt.textContent + '</span><svg class="csel-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-11"/></svg>';
      if (opt.disabled) b.disabled = true;
      b.addEventListener('click', function () { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); renderLabel(); close(); });
      menu.appendChild(b); opts.push({ opt: opt, el: b });
    });
    function open() { wrap.classList.add('open'); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); }
    function close() { wrap.classList.remove('open'); menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); setActive(-1); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); wrap.classList.contains('open') ? close() : open(); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });

    /* Клавиатура: нативный <select> здесь tabindex=-1/aria-hidden, поэтому его
       стрелки/Home/End нужно воспроизвести руками — иначе для клавиатурного
       пользователя это регресс по сравнению с обычным select. Подсветка —
       класс .csel-opt.active (под него и написано правило в STYLE выше). */
    var activeIdx = -1;
    function setActive(i) {
      activeIdx = i;
      opts.forEach(function (o, n) { o.el.classList.toggle('active', n === i); });
      if (i >= 0 && opts[i]) opts[i].el.scrollIntoView({ block: 'nearest' });
    }
    // from === undefined: от текущей подсветки (или от выбранного пункта, если её нет).
    // from задан явно (Home/End): стартуем ровно с него, не оглядываясь на selectedIndex.
    function step(dir, from) {
      if (!opts.length) return;
      var i = from !== undefined ? from
        : (activeIdx < 0 ? (sel.selectedIndex >= 0 ? sel.selectedIndex : 0) : activeIdx + dir);
      for (var n = 0; n < opts.length; n++) {           // перепрыгиваем disabled
        if (i < 0) i = opts.length - 1;
        if (i > opts.length - 1) i = 0;
        if (!opts[i].el.disabled) break;
        i += dir;
      }
      setActive(i);
    }
    function commit() {
      if (activeIdx < 0 || !opts[activeIdx] || opts[activeIdx].el.disabled) return close();
      sel.value = opts[activeIdx].opt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      renderLabel(); close(); btn.focus();
    }
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); btn.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!wrap.classList.contains('open')) open();
        step(e.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (e.key === 'Home' || e.key === 'End') {
        if (!wrap.classList.contains('open')) return;
        e.preventDefault();
        // от края внутрь, чтобы попасть на первый/последний НЕ-disabled
        step(e.key === 'Home' ? 1 : -1, e.key === 'Home' ? 0 : opts.length - 1);
        return;
      }
      if ((e.key === 'Enter' || e.key === ' ') && wrap.classList.contains('open')) {
        e.preventDefault(); commit();
      }
    });
    sel.addEventListener('change', renderLabel);
    wrap.appendChild(btn); wrap.appendChild(menu);
    renderLabel();
  }
  document.querySelectorAll('[data-csel]').forEach(buildCsel);
});
`;

function renderAdminPage({ active, title, sub, body, script }) {
  const navHtml = NAV.map((n) =>
    `<a class="${n.id === active ? 'on' : ''}" href="${n.href}"><span class="ic">${n.icon}</span>${n.label}</a>`
  ).join('');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>BARJOK · ${title}</title>
<style>${STYLE}</style>
</head>
<body>
  <div class="side">
    <div class="brand">BAR<span>JOK</span> · admin</div>
    <div class="nav">${navHtml}</div>
  </div>
  <main>
    <h1>${title}</h1>
    ${sub ? `<div class="sub">${sub}</div>` : ''}
    ${body}
  </main>
<script>${CSEL_SCRIPT}</script>
${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

module.exports = { renderAdminPage };
