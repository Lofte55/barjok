const { requireAdmin } = require('./_lib/auth');
const { renderAdminPage } = require('./_lib/admin-layout');

const BODY = `
  <div class="card">
    <form class="new" id="importForm">
      <input name="feed_url" placeholder="Apps Script /exec URL (тот же, что CITIZEN_FEED_URL)" style="flex:1;min-width:320px">
      <button type="submit" class="ghost">Импортировать старые жалобы из Sheet</button>
    </form>
    <div class="muted" style="margin-top:8px;font-size:12px">Разовая операция — подтягивает все approved-строки из таблицы в incidents. Повторный запуск не создаёт дублей активных.</div>
  </div>

  <div class="card">
    <form class="new" id="newForm">
      <input name="address" placeholder="улица Абая, 12" required>
      <div class="csel" data-csel>
        <select name="utility_type">
          <option value="hot_water">Горячая вода</option>
          <option value="cold_water">Холодная вода</option>
          <option value="water">Нет воды (совсем)</option>
          <option value="electricity">Электричество</option>
          <option value="heating">Отопление</option>
          <option value="gas">Газ</option>
        </select>
      </div>
      <input name="reason" placeholder="причина (необязательно)" style="flex:1;min-width:180px">
      <div class="csel" data-csel>
        <select name="duration_days" title="Срок автовосстановления" id="newDurationSel">
          <option value="eod" selected>До конца дня (в 00:00)</option>
          <option value="1">Восстановится через 1 день</option>
          <option value="5">Восстановится через 5 дней</option>
          <option value="custom">Своё значение…</option>
          <option value="0">Без даты (вручную)</option>
        </select>
      </div>
      <span id="newCustomDurationWrap" style="display:none;gap:6px;align-items:center">
        <input type="number" name="duration_custom_value" min="1" max="999" placeholder="8" style="width:64px">
        <div class="csel" data-csel>
          <select name="duration_custom_unit">
            <option value="hours">часы</option>
            <option value="days">дни</option>
          </select>
        </div>
      </span>
      <button type="submit">Принудительно отключить</button>
    </form>
  </div>

  <div class="card">
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <div>
        <label style="margin-right:8px;color:#9aa2b1;font-size:13px">Показать:</label>
        <div class="csel" data-csel>
          <select id="statusFilter">
            <option value="all" selected>Все</option>
            <option value="NEW">Новые жалобы</option>
            <option value="ACTIVE">Активные</option>
            <option value="RESTORED">Восстановленные</option>
            <option value="SUGGESTION">Предложения</option>
          </select>
        </div>
      </div>
      <div>
        <label style="margin-right:8px;color:#9aa2b1;font-size:13px">Ресурс:</label>
        <div class="csel" data-csel>
          <select id="resourceFilter">
            <option value="all">Все</option>
            <option value="hot_water">Горячая вода</option>
            <option value="cold_water">Холодная вода</option>
            <option value="water">Нет воды (совсем)</option>
            <option value="electricity">Электричество</option>
            <option value="heating">Отопление</option>
            <option value="gas">Газ</option>
          </select>
        </div>
      </div>
      <div>
        <label style="margin-right:8px;color:#9aa2b1;font-size:13px">Город:</label>
        <div class="csel" data-csel>
          <select id="cityFilter">
            <option value="all">Все города</option>
            <option value="pavlodar">Павлодар</option>
            <option value="ekibastuz">Экибастуз</option>
            <option value="aksu">Аксу</option>
          </select>
        </div>
      </div>
      <button type="button" class="ghost" id="refreshBtn">Обновить</button>
      <button type="button" class="ghost" id="exportCsv" style="margin-left:auto">Скачать CSV</button>
    </div>
    <table>
      <thead><tr>
        <th>Город</th><th>Адрес</th><th>Ресурс</th><th>Статус</th><th>Подтверждение</th><th>Ручное управление</th><th>Дата</th><th>Действия</th>
      </tr></thead>
      <tbody id="rows"><tr><td colspan="8" class="empty">Загрузка…</td></tr></tbody>
    </table>
  </div>
`;

const SCRIPT = `
const UT = { hot_water: 'Горячая вода', cold_water: 'Холодная вода', water: 'Нет воды (совсем)', electricity: 'Электричество', heating: 'Отопление', gas: 'Газ' };
const CITY = { pavlodar: 'Павлодар', ekibastuz: 'Экибастуз', aksu: 'Аксу' };
const CT = { COMMUNITY: 'Жители (авто)', OFFICIAL: 'Официально', COMMUNITY_AND_OFFICIAL: 'Официально + жители', MANUAL: 'Вручную (админ)' };
// FORCE_OUTAGE/FORCE_RESTORED — это "ручной режим": статус зафиксирован администратором
// и Decision Engine (автоматика по жалобам жителей) больше НЕ может сам его менять,
// пока не нажать "Снять ручное управление".
const OV = { FORCE_OUTAGE: 'Зафиксировано вручную: отключено', FORCE_RESTORED: 'Зафиксировано вручную: восстановлено' };
const fmt = (s) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// allRows — единый список: incidents (status ACTIVE/RESTORED) + pending-жалобы
// (status NEW, синтетические — не строка из incidents, а сгруппированные
// user_reports, которые ещё не набрали порог автоподтверждения).
let allRows = [];

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

function esc(s) { return String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c])); }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

// Срок автовосстановления рядом с "Подтвердить"/"Снова отключить" — читается
// кликом по кнопке (querySelector внутри той же ячейки .actions), см.
// обработчик клика ниже. Оба <select> обёрнуты в .csel — те же кастомные
// (не системные) дропдауны, что и везде в админке. Строки рендерятся
// динамически ПОСЛЕ того, как CSEL_SCRIPT уже просканировал DOM на
// DOMContentLoaded — здесь их инициализирует сам render() ниже, вызывая
// window.buildCsel() (см. admin-layout.js) на каждый новый [data-csel].
// ⚠️ "До конца дня" — ДЕФОЛТ (selected), а не "Без даты": найден живой кейс,
// когда админ жмёт "Подтвердить" в списке жалоб и не задумывается об этом
// селекте рядом — раньше по умолчанию срок оставался пустым, и запись висела
// "Восстановят —" бессрочно. "Без даты" всё ещё доступна как осознанный выбор.
// "Своё значение" — число + часы/дни, рядом с основным селектом, скрыты по
// умолчанию (см. слушатель change на .dur-sel ниже — общий делегированный,
// строки рендерятся динамически).
function durationSelectHtml() {
  return '<div class="csel dur-csel" data-csel><select class="dur-sel" data-duration title="Срок автовосстановления">' +
    '<option value="eod" selected>До конца дня</option>' +
    '<option value="1">1 день</option>' +
    '<option value="5">5 дней</option>' +
    '<option value="custom">Своё значение…</option>' +
    '<option value="0">Без даты</option>' +
    '</select></div>' +
    '<input type="number" class="dur-custom-val" data-duration-value min="1" max="999" placeholder="8" style="display:none">' +
    '<div class="csel dur-csel" data-csel style="display:none"><select class="dur-custom-unit" data-duration-unit>' +
    '<option value="hours">часы</option><option value="days">дни</option>' +
    '</select></div>';
}

function currentFilters() {
  return {
    status: document.getElementById('statusFilter').value,
    resource: document.getElementById('resourceFilter').value,
    city: document.getElementById('cityFilter').value,
  };
}
function rowDate(r) {
  if (r.status === 'NEW') return r.latest_report_at;
  if (r.status === 'SUGGESTION') return r.created_at;
  // ⚠️ Есть свежие жалобы после подтверждения — сортируем по НИМ, а не по дате
  // подтверждения: иначе инцидент, подтверждённый три дня назад, оставался внизу
  // списка, хотя люди жалуются на него сегодня (жалоба владельца).
  if (r.status === 'ACTIVE' && r.fresh_at) return r.fresh_at;
  return r.status === 'ACTIVE' ? r.confirmed_at : r.restored_at;
}
// Новые жалобы, необработанные предложения И подтверждённые отключения, по
// которым продолжают жаловаться ("не починили") — всё это требует внимания,
// всё идёт сверху списка (см. сортировку ниже).
function needsAttention(r) {
  return r.status === 'NEW'
    || (r.status === 'SUGGESTION' && !r.done)
    || (r.status === 'ACTIVE' && r.fresh_votes > 0);
}
function filteredRows() {
  const f = currentFilters();
  return allRows
    .filter((r) =>
      (f.status === 'all' || r.status === f.status) &&
      (f.resource === 'all' || r.utility_type === f.resource) &&
      (f.city === 'all' || (r.city_id || 'pavlodar') === f.city)
    )
    // "Новая"/необработанное предложение всегда сверху, внутри каждой
    // группы — по дате, свежее выше.
    .sort((a, b) => {
      const aNew = needsAttention(a) ? 0 : 1, bNew = needsAttention(b) ? 0 : 1;
      if (aNew !== bNew) return aNew - bNew;
      return (rowDate(b) || '') < (rowDate(a) || '') ? -1 : 1;
    });
}

function render() {
  const rows = document.getElementById('rows');
  const list = filteredRows();
  if (!list.length) { rows.innerHTML = '<tr><td colspan="8" class="empty">Ничего нет по этому фильтру</td></tr>'; return; }
  rows.innerHTML = list.map((inc) => {
    const cityLabel = CITY[inc.city_id || 'pavlodar'] || (inc.city_id || 'Павлодар');
    let statusBadge, confirmCell, overrideCell, dateVal, actions = [];
    if (inc.status === 'SUGGESTION') {
      // Предложение (kind=suggestion в форме "Уведомление BARJOK") — не привязано
      // к конкретному ресурсу/инциденту, адрес необязателен. status в БД: NEW/DONE.
      statusBadge = inc.done ? '<span class="badge b-restored">Обработано</span>' : '<span class="badge b-new">Предложение</span>';
      confirmCell = '<div class="muted">' + esc(inc.message || '') + '</div>';
      overrideCell = '<span class="muted">—</span>';
      dateVal = inc.created_at;
      if (!inc.done) actions.push('<button data-act="done_suggestion" data-id="' + inc.id + '">Обработано</button>');
      actions.push('<button class="ghost" data-act="delete_suggestion" data-id="' + inc.id + '" title="Удалить запись совсем">Удалить</button>');
    } else if (inc.status === 'NEW') {
      statusBadge = '<span class="badge b-new">Новая</span>';
      // votes = сколько зачтёт автоподтверждение; raw_votes = сколько жалоб всего.
      // Расходятся, когда часть жалоб пришла с одного IP (потолок против накрутки
      // сменой cookie) — показываем обе цифры, иначе выглядит как ошибка счёта.
      var capped = inc.raw_votes && inc.raw_votes > inc.votes;
      confirmCell = inc.votes + ' ' + (inc.votes === 1 ? 'сообщение' : 'сообщений')
        + (capped ? '<div class="muted">всего ' + inc.raw_votes + ', часть с одного IP — не в счёт</div>' : '')
        + (inc.message ? '<div class="muted">' + esc(inc.message) + '</div>' : '');
      overrideCell = '<span class="muted">Ждёт подтверждения</span>';
      dateVal = inc.latest_report_at;
      actions.push(durationSelectHtml());
      actions.push('<button data-act="confirm_pending" data-address="' + escAttr(inc.address) + '" data-utility="' + inc.utility_type + '">Подтвердить</button>');
      actions.push('<button class="ghost" data-act="reject_pending" data-address="' + escAttr(inc.address) + '" data-utility="' + inc.utility_type + '">Отклонить</button>');
    } else {
      statusBadge = inc.status === 'ACTIVE' ? '<span class="badge b-active">Отключено</span>' : '<span class="badge b-restored">Восстановлено</span>';
      // Продолжают жаловаться после подтверждения — значит, не починили. Раньше
      // такие жалобы админка не показывала вообще (см. loadPendingReports).
      if (inc.status === 'ACTIVE' && inc.fresh_votes > 0) {
        statusBadge += ' <span class="badge b-new">Жалуются снова: ' + inc.fresh_votes + '</span>';
      }
      confirmCell = (CT[inc.confirmation_type] || inc.confirmation_type)
        + (inc.fresh_votes > 0
          ? '<div class="muted">После подтверждения ещё ' + inc.fresh_votes + ' '
            + (inc.fresh_votes === 1 ? 'сообщение' : 'сообщений') + ', последнее ' + fmt(inc.fresh_at) + '</div>'
            + (inc.fresh_message ? '<div class="muted">' + esc(inc.fresh_message) + '</div>' : '')
          : '');
      // manual_override_until — срок автовосстановления (см. api/admin-api.js:force_outage,
      // api/_lib/decision-engine.js:sweepExpiredOverrides). Показываем рядом с бейджем,
      // иначе после "Подтвердить → 5 дней" не видно, что вообще что-то запланировано.
      overrideCell = inc.manual_override !== 'NONE'
        ? '<span class="badge b-manual">' + (OV[inc.manual_override] || inc.manual_override) + '</span>'
          + (inc.manual_override_until ? '<div class="muted">Восстановится ' + fmt(inc.manual_override_until) + '</div>' : '')
          + (inc.manual_override_reason ? '<div class="muted">' + esc(inc.manual_override_reason) + '</div>' : '')
        : '<span class="muted">Автоматический режим</span>';
      dateVal = inc.status === 'ACTIVE' ? inc.confirmed_at : inc.restored_at;
      if (inc.status === 'ACTIVE') actions.push('<button data-act="force_restored" data-id="' + inc.id + '">Восстановлено</button>');
      else { actions.push(durationSelectHtml()); actions.push('<button data-act="force_outage_again" data-address="' + escAttr(inc.address) + '" data-utility="' + inc.utility_type + '">Снова отключить</button>'); }
      if (inc.manual_override !== 'NONE') actions.push('<button class="ghost" data-act="clear_override" data-id="' + inc.id + '">Снять ручное управление</button>');
      actions.push('<button class="ghost" data-act="delete" data-id="' + inc.id + '" title="Удалить запись совсем">Удалить</button>');
    }
    const addrLabel = inc.status === 'SUGGESTION'
      ? (inc.address ? esc(inc.address) : '<span class="muted">без адреса</span>')
      : esc(inc.address);
    const resLabel = inc.status === 'SUGGESTION' ? '<span class="muted">—</span>' : (UT[inc.utility_type] || inc.utility_type);
    return '<tr>' +
      '<td data-label="Город">' + esc(cityLabel) + '</td>' +
      '<td data-label="Адрес">' + addrLabel + '</td>' +
      '<td data-label="Ресурс">' + resLabel + '</td>' +
      '<td data-label="Статус">' + statusBadge + '</td>' +
      '<td data-label="Подтверждение">' + confirmCell + '</td>' +
      '<td data-label="Ручное управление">' + overrideCell + '</td>' +
      '<td data-label="Дата" class="muted">' + fmt(dateVal) + '</td>' +
      '<td data-label="Действия" class="actions">' + actions.join('') + '</td>' +
      '</tr>';
  }).join('');
  // Динамически вставленные [data-csel] (durationSelectHtml()) не попали в
  // сканирование на DOMContentLoaded (admin-layout.js) — инициализируем сами.
  // buildCsel сам пропускает уже готовые (data-cselReady), повторный вызов
  // на каждый render() безопасен.
  if (window.buildCsel) rows.querySelectorAll('[data-csel]').forEach(window.buildCsel);
}

function csvEscape(s) {
  s = String(s == null ? '' : s);
  return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv() {
  const list = filteredRows();
  const head = ['Город', 'Адрес', 'Ресурс', 'Статус', 'Подтверждение', 'Дата'];
  const statusRu = { NEW: 'Новая', ACTIVE: 'Отключено', RESTORED: 'Восстановлено', SUGGESTION: 'Предложение' };
  const lines = [head.map(csvEscape).join(',')];
  list.forEach((inc) => {
    const cityLabel = CITY[inc.city_id || 'pavlodar'] || (inc.city_id || 'Павлодар');
    const confirmTxt = inc.status === 'NEW' ? inc.votes + ' сообщений'
      : inc.status === 'SUGGESTION' ? (inc.done ? 'Обработано: ' : '') + (inc.message || '')
      : (CT[inc.confirmation_type] || inc.confirmation_type || '');
    const dateVal = rowDate(inc);
    const resVal = inc.status === 'SUGGESTION' ? '' : (UT[inc.utility_type] || inc.utility_type);
    lines.push([cityLabel, inc.address || '', resVal, statusRu[inc.status] || inc.status, confirmTxt, fmt(dateVal)].map(csvEscape).join(','));
  });
  const blob = new Blob(['\\uFEFF' + lines.join('\\r\\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'barjok-otklyucheniya-' + new Date().toISOString().slice(0, 10) + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

async function load() {
  const rows = document.getElementById('rows');
  try {
    const { incidents, pending, fresh, suggestions } = await api('/api/admin-api');
    const pendingRows = (pending || []).map((p) => Object.assign({ status: 'NEW' }, p));
    const suggestionRows = (suggestions || []).map((s) => Object.assign({}, s, { status: 'SUGGESTION', done: s.status === 'DONE' }));
    // Жалобы, пришедшие ПОСЛЕ подтверждения ("не починили") — вешаем на строку
    // самого инцидента: она и подсветится, и поднимется наверх (см. needsAttention/rowDate).
    const freshByKey = new Map((fresh || []).map((f) => [f.address + '|' + f.utility_type, f]));
    incidents.forEach((inc) => {
      const f = freshByKey.get(inc.address + '|' + inc.utility_type);
      if (f) { inc.fresh_votes = f.votes; inc.fresh_raw = f.raw_votes; inc.fresh_at = f.latest_report_at; inc.fresh_message = f.message; }
    });
    allRows = incidents.concat(pendingRows, suggestionRows);
    render();
  } catch (e) {
    rows.innerHTML = '<tr><td colspan="8" class="empty">Ошибка загрузки: ' + esc(e.message) + '</td></tr>';
  }
}
document.getElementById('statusFilter').addEventListener('change', render);
document.getElementById('resourceFilter').addEventListener('change', render);
document.getElementById('cityFilter').addEventListener('change', render);
document.getElementById('exportCsv').addEventListener('click', downloadCsv);
document.getElementById('refreshBtn').addEventListener('click', load);

// "Своё значение" в форме "Принудительно отключить" — показать/скрыть поле
// числа + селект часы/дни рядом с основным .csel (тот дублирует change на
// native <select>, см. buildCsel в admin-layout.js — слушаем именно его).
const newDurationSel = document.getElementById('newDurationSel');
const newCustomWrap = document.getElementById('newCustomDurationWrap');
newDurationSel.addEventListener('change', () => {
  newCustomWrap.style.display = newDurationSel.value === 'custom' ? 'inline-flex' : 'none';
});
// То же для динамических .dur-sel в строках таблицы (durationSelectHtml()) —
// делегированный слушатель, строки перерисовываются на каждый load()/render().
// ⚠️ .dur-sel теперь ВНУТРИ .csel (см. durationSelectHtml()) — ближайший
// общий контейнер с полем числа и селектом единицы это ячейка <td>, а не
// e.target.parentElement (это уже сам .csel). Для .dur-custom-unit скрывать
// нужно её .csel-обёртку целиком, иначе кастомная кнопка останется видна
// поверх скрытого системного <select>.
document.getElementById('rows').addEventListener('change', (e) => {
  if (!e.target.classList.contains('dur-sel')) return;
  const td = e.target.closest('td');
  if (!td) return;
  const show = e.target.value === 'custom' ? 'inline-block' : 'none';
  const val = td.querySelector('.dur-custom-val');
  const unitSel = td.querySelector('.dur-custom-unit');
  const unitWrap = unitSel ? unitSel.closest('.csel') : null;
  if (val) val.style.display = show;
  if (unitWrap) unitWrap.style.display = show;
});
// Автообновление раз в 60с — жалобы приходят в реальном времени, страница
// раньше загружала список один раз при открытии и больше не обновляла его.
setInterval(load, 60000);

document.getElementById('importForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const feedUrl = f.get('feed_url');
  if (!feedUrl) { alert('Вставьте URL фида'); return; }
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Импортирую…';
  try {
    const r = await api('/api/admin-api', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'import_sheet', feed_url: feedUrl }),
    });
    alert('Готово: активных ' + r.createdActive + ', восстановленных ' + r.createdRestored + ', пропущено ' + r.skipped + ' из ' + r.total);
    await load();
  } catch (err) { alert('Ошибка: ' + err.message); }
  btn.disabled = false; btn.textContent = 'Импортировать старые жалобы из Sheet';
});

document.getElementById('newForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    await api('/api/admin-api', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'force_outage', address: f.get('address'), utility_type: f.get('utility_type'), reason: f.get('reason'),
        duration_days: f.get('duration_days'),
        duration_custom_value: f.get('duration_custom_value'), duration_custom_unit: f.get('duration_custom_unit'),
      }),
    });
    e.target.reset();
    newCustomWrap.style.display = 'none';
    await load();
  } catch (err) { alert('Ошибка: ' + err.message); }
  btn.disabled = false;
});

document.getElementById('rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'delete' && !confirm('Удалить эту запись совсем? Действие необратимо.')) return;
  if (btn.dataset.act === 'delete_suggestion' && !confirm('Удалить это предложение совсем? Действие необратимо.')) return;
  if (btn.dataset.act === 'reject_pending' && !confirm('Отклонить эту жалобу? Голоса жителей будут списаны.')) return;
  btn.disabled = true;
  try {
    const act = btn.dataset.act;
    if (act === 'delete') {
      await api('/api/admin-api', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: Number(btn.dataset.id) }),
      });
    } else if (act === 'force_outage_again' || act === 'confirm_pending') {
      // Селект срока + поля "Своё значение" — соседи кнопки в той же ячейке
      // .actions (см. durationSelectHtml()).
      const durSel = btn.parentElement.querySelector('[data-duration]');
      const durVal = btn.parentElement.querySelector('[data-duration-value]');
      const durUnit = btn.parentElement.querySelector('[data-duration-unit]');
      await api('/api/admin-api', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'force_outage', address: btn.dataset.address, utility_type: btn.dataset.utility,
          duration_days: durSel ? durSel.value : '0',
          duration_custom_value: durVal ? durVal.value : '', duration_custom_unit: durUnit ? durUnit.value : '',
        }),
      });
    } else if (act === 'reject_pending') {
      await api('/api/admin-api', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reject_pending', address: btn.dataset.address, utility_type: btn.dataset.utility }),
      });
    } else {
      await api('/api/admin-api', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: act, id: Number(btn.dataset.id) }),
      });
    }
    await load();
  } catch (err) { alert('Ошибка: ' + err.message); }
  btn.disabled = false;
});

load();
`;

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const html = renderAdminPage({
    active: 'incidents', title: 'События',
    sub: 'Отключения (ручные + автоматические) и предложения жителей. Источник правды для карты.',
    body: BODY, script: SCRIPT,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
