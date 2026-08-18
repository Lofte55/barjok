const { requireAdmin } = require('./_lib/auth');

const HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>BARJOK · Админка</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; background: #0f1115; color: #e7e9ee; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #9aa2b1; font-size: 13px; margin-bottom: 20px; }
  .card { background: #171a21; border: 1px solid #262b36; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  form.new { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  input, select { background: #0f1115; border: 1px solid #2c3140; color: #e7e9ee; border-radius: 8px; padding: 8px 10px; font-size: 14px; }
  input[name=address] { flex: 1; min-width: 220px; }
  button { background: #2f6bed; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-size: 14px; cursor: pointer; }
  button.danger { background: #c0392b; }
  button.ghost { background: transparent; border: 1px solid #2c3140; color: #e7e9ee; }
  button:disabled { opacity: .5; cursor: default; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #232733; vertical-align: top; }
  th { color: #9aa2b1; font-weight: 500; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
  .b-active { background: #4a1f1f; color: #ff8a80; }
  .b-restored { background: #16321f; color: #7be08a; }
  .b-manual { background: #3a2f10; color: #ffcf6b; }
  .muted { color: #6b7280; }
  .actions button { margin-right: 6px; margin-bottom: 4px; }
  .empty { color: #6b7280; padding: 20px 0; text-align: center; }
</style>
</head>
<body>
  <h1>BARJOK · Админка</h1>
  <div class="sub">Ручное управление отключениями (форсированный статус). Фаза 1 — без автоматики.</div>

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
        <th>Адрес</th><th>Ресурс</th><th>Статус</th><th>Override</th><th>Обновлено</th><th>Действия</th>
      </tr></thead>
      <tbody id="rows"><tr><td colspan="6" class="empty">Загрузка…</td></tr></tbody>
    </table>
  </div>

<script>
const UT = { hot_water: 'Горячая вода', cold_water: 'Холодная вода', electricity: 'Электричество', heating: 'Отопление', gas: 'Газ' };
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
    if (!incidents.length) { rows.innerHTML = '<tr><td colspan="6" class="empty">Пока нет ни одного incident</td></tr>'; return; }
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
        '<td>' + override + '</td>' +
        '<td class="muted">' + fmt(inc.updated_at) + '</td>' +
        '<td class="actions">' + actions.join('') + '</td>' +
        '</tr>';
    }).join('');
  } catch (e) {
    rows.innerHTML = '<tr><td colspan="6" class="empty">Ошибка загрузки: ' + esc(e.message) + '</td></tr>';
  }
}
function esc(s) { return String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c])); }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }

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
</script>
</body>
</html>`;

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(HTML);
};
