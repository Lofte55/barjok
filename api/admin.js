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
      <select name="utility_type">
        <option value="hot_water">Горячая вода</option>
        <option value="cold_water">Холодная вода</option>
        <option value="electricity">Электричество</option>
        <option value="heating">Отопление</option>
        <option value="gas">Газ</option>
      </select>
      <input name="reason" placeholder="причина (необязательно)" style="flex:1;min-width:180px">
      <button type="submit">Принудительно отключить</button>
    </form>
  </div>

  <div class="card">
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <div>
        <label style="margin-right:8px;color:#9aa2b1;font-size:13px">Показать:</label>
        <select id="statusFilter">
          <option value="all" selected>Все</option>
          <option value="NEW">Новые</option>
          <option value="ACTIVE">Активные</option>
          <option value="RESTORED">Восстановленные</option>
        </select>
      </div>
      <div>
        <label style="margin-right:8px;color:#9aa2b1;font-size:13px">Ресурс:</label>
        <select id="resourceFilter">
          <option value="all">Все</option>
          <option value="hot_water">Горячая вода</option>
          <option value="cold_water">Холодная вода</option>
          <option value="electricity">Электричество</option>
          <option value="heating">Отопление</option>
          <option value="gas">Газ</option>
        </select>
      </div>
      <div>
        <label style="margin-right:8px;color:#9aa2b1;font-size:13px">Город:</label>
        <select id="cityFilter">
          <option value="all">Все города</option>
          <option value="pavlodar">Павлодар</option>
          <option value="ekibastuz">Экибастуз</option>
          <option value="aksu">Аксу</option>
        </select>
      </div>
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
const UT = { hot_water: 'Горячая вода', cold_water: 'Холодная вода', electricity: 'Электричество', heating: 'Отопление', gas: 'Газ' };
const CITY = { pavlodar: 'Павлодар', ekibastuz: 'Экибастуз', aksu: 'Аксу' };
const CT = { COMMUNITY: 'Жители (авто, 3+ сообщения)', OFFICIAL: 'Официально', COMMUNITY_AND_OFFICIAL: 'Официально + жители', MANUAL: 'Вручную (админ)' };
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

function currentFilters() {
  return {
    status: document.getElementById('statusFilter').value,
    resource: document.getElementById('resourceFilter').value,
    city: document.getElementById('cityFilter').value,
  };
}
function rowDate(r) {
  return r.status === 'NEW' ? r.latest_report_at : (r.status === 'ACTIVE' ? r.confirmed_at : r.restored_at);
}
function filteredRows() {
  const f = currentFilters();
  return allRows
    .filter((r) =>
      (f.status === 'all' || r.status === f.status) &&
      (f.resource === 'all' || r.utility_type === f.resource) &&
      (f.city === 'all' || (r.city_id || 'pavlodar') === f.city)
    )
    // "Новая" всегда сверху (свежие жалобы требуют внимания раньше остального),
    // внутри каждой группы (Новая / остальные) — по дате, свежее выше.
    .sort((a, b) => {
      const aNew = a.status === 'NEW' ? 0 : 1, bNew = b.status === 'NEW' ? 0 : 1;
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
    if (inc.status === 'NEW') {
      statusBadge = '<span class="badge b-new">Новая</span>';
      confirmCell = inc.votes + ' ' + (inc.votes === 1 ? 'сообщение' : 'сообщений') + (inc.message ? '<div class="muted">' + esc(inc.message) + '</div>' : '');
      overrideCell = '<span class="muted">Ждёт подтверждения</span>';
      dateVal = inc.latest_report_at;
      actions.push('<button data-act="confirm_pending" data-address="' + escAttr(inc.address) + '" data-utility="' + inc.utility_type + '">Подтвердить</button>');
      actions.push('<button class="ghost" data-act="reject_pending" data-address="' + escAttr(inc.address) + '" data-utility="' + inc.utility_type + '">Отклонить</button>');
    } else {
      statusBadge = inc.status === 'ACTIVE' ? '<span class="badge b-active">Отключено</span>' : '<span class="badge b-restored">Восстановлено</span>';
      confirmCell = CT[inc.confirmation_type] || inc.confirmation_type;
      overrideCell = inc.manual_override !== 'NONE'
        ? '<span class="badge b-manual">' + (OV[inc.manual_override] || inc.manual_override) + '</span>' + (inc.manual_override_reason ? '<div class="muted">' + esc(inc.manual_override_reason) + '</div>' : '')
        : '<span class="muted">Автоматический режим</span>';
      dateVal = inc.status === 'ACTIVE' ? inc.confirmed_at : inc.restored_at;
      if (inc.status === 'ACTIVE') actions.push('<button data-act="force_restored" data-id="' + inc.id + '">Восстановлено</button>');
      else actions.push('<button data-act="force_outage_again" data-address="' + escAttr(inc.address) + '" data-utility="' + inc.utility_type + '">Снова отключить</button>');
      if (inc.manual_override !== 'NONE') actions.push('<button class="ghost" data-act="clear_override" data-id="' + inc.id + '">Снять ручное управление</button>');
      actions.push('<button class="ghost" data-act="delete" data-id="' + inc.id + '" title="Удалить запись совсем">Удалить</button>');
    }
    return '<tr>' +
      '<td>' + esc(cityLabel) + '</td>' +
      '<td>' + esc(inc.address) + '</td>' +
      '<td>' + (UT[inc.utility_type] || inc.utility_type) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + confirmCell + '</td>' +
      '<td>' + overrideCell + '</td>' +
      '<td class="muted">' + fmt(dateVal) + '</td>' +
      '<td class="actions">' + actions.join('') + '</td>' +
      '</tr>';
  }).join('');
}

function csvEscape(s) {
  s = String(s == null ? '' : s);
  return /[",\\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function downloadCsv() {
  const list = filteredRows();
  const head = ['Город', 'Адрес', 'Ресурс', 'Статус', 'Подтверждение', 'Дата'];
  const statusRu = { NEW: 'Новая', ACTIVE: 'Отключено', RESTORED: 'Восстановлено' };
  const lines = [head.map(csvEscape).join(',')];
  list.forEach((inc) => {
    const cityLabel = CITY[inc.city_id || 'pavlodar'] || (inc.city_id || 'Павлодар');
    const confirmTxt = inc.status === 'NEW' ? inc.votes + ' сообщений' : (CT[inc.confirmation_type] || inc.confirmation_type || '');
    const dateVal = inc.status === 'NEW' ? inc.latest_report_at : (inc.status === 'ACTIVE' ? inc.confirmed_at : inc.restored_at);
    lines.push([cityLabel, inc.address, UT[inc.utility_type] || inc.utility_type, statusRu[inc.status] || inc.status, confirmTxt, fmt(dateVal)].map(csvEscape).join(','));
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
    const { incidents, pending } = await api('/api/admin-api');
    const pendingRows = (pending || []).map((p) => Object.assign({ status: 'NEW' }, p));
    allRows = incidents.concat(pendingRows);
    render();
  } catch (e) {
    rows.innerHTML = '<tr><td colspan="8" class="empty">Ошибка загрузки: ' + esc(e.message) + '</td></tr>';
  }
}
document.getElementById('statusFilter').addEventListener('change', render);
document.getElementById('resourceFilter').addEventListener('change', render);
document.getElementById('cityFilter').addEventListener('change', render);
document.getElementById('exportCsv').addEventListener('click', downloadCsv);

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
      body: JSON.stringify({ action: 'force_outage', address: f.get('address'), utility_type: f.get('utility_type'), reason: f.get('reason') }),
    });
    e.target.reset();
    await load();
  } catch (err) { alert('Ошибка: ' + err.message); }
  btn.disabled = false;
});

document.getElementById('rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'delete' && !confirm('Удалить эту запись совсем? Действие необратимо.')) return;
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
      await api('/api/admin-api', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'force_outage', address: btn.dataset.address, utility_type: btn.dataset.utility }),
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
    active: 'incidents', title: 'Отключения',
    sub: 'Ручное управление + автоматические (community/official) incidents. Источник правды для карты.',
    body: BODY, script: SCRIPT,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
