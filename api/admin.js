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
    <table>
      <thead><tr>
        <th>Адрес</th><th>Ресурс</th><th>Статус</th><th>Подтверждение</th><th>Override</th><th>Обновлено</th><th>Действия</th>
      </tr></thead>
      <tbody id="rows"><tr><td colspan="7" class="empty">Загрузка…</td></tr></tbody>
    </table>
  </div>
`;

const SCRIPT = `
const UT = { hot_water: 'Горячая вода', cold_water: 'Холодная вода', electricity: 'Электричество', heating: 'Отопление', gas: 'Газ' };
const CT = { COMMUNITY: 'Жители (авто)', OFFICIAL: 'Официально', COMMUNITY_AND_OFFICIAL: 'Официально + жители', MANUAL: 'Вручную' };
const fmt = (s) => s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

async function load() {
  const rows = document.getElementById('rows');
  try {
    const { incidents } = await api('/api/admin-data');
    if (!incidents.length) { rows.innerHTML = '<tr><td colspan="7" class="empty">Пока нет ни одного incident</td></tr>'; return; }
    rows.innerHTML = incidents.map((inc) => {
      const statusBadge = inc.status === 'ACTIVE'
        ? '<span class="badge b-active">ACTIVE</span>'
        : '<span class="badge b-restored">RESTORED</span>';
      const override = inc.manual_override !== 'NONE'
        ? '<span class="badge b-manual">' + inc.manual_override + '</span>' + (inc.manual_override_reason ? '<div class="muted">' + esc(inc.manual_override_reason) + '</div>' : '')
        : '<span class="muted">—</span>';
      const actions = [];
      if (inc.status === 'ACTIVE') actions.push('<button data-act="force_restored" data-id="' + inc.id + '">Восстановлено</button>');
      else actions.push('<button data-act="force_outage_again" data-address="' + escAttr(inc.address) + '" data-utility="' + inc.utility_type + '">Снова отключить</button>');
      if (inc.manual_override !== 'NONE') actions.push('<button class="ghost" data-act="clear_override" data-id="' + inc.id + '">Снять override</button>');
      return '<tr>' +
        '<td>' + esc(inc.address) + '</td>' +
        '<td>' + (UT[inc.utility_type] || inc.utility_type) + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td>' + (CT[inc.confirmation_type] || inc.confirmation_type) + '</td>' +
        '<td>' + override + '</td>' +
        '<td class="muted">' + fmt(inc.updated_at) + '</td>' +
        '<td class="actions">' + actions.join('') + '</td>' +
        '</tr>';
    }).join('');
  } catch (e) {
    rows.innerHTML = '<tr><td colspan="7" class="empty">Ошибка загрузки: ' + esc(e.message) + '</td></tr>';
  }
}
function esc(s) { return String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c])); }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

document.getElementById('importForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const feedUrl = f.get('feed_url');
  if (!feedUrl) { alert('Вставьте URL фида'); return; }
  const btn = e.target.querySelector('button');
  btn.disabled = true; btn.textContent = 'Импортирую…';
  try {
    const r = await api('/api/admin-action', {
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
    await api('/api/admin-action', {
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
  btn.disabled = true;
  try {
    const act = btn.dataset.act;
    if (act === 'force_outage_again') {
      await api('/api/admin-action', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'force_outage', address: btn.dataset.address, utility_type: btn.dataset.utility }),
      });
    } else {
      await api('/api/admin-action', {
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
