const { requireAdmin } = require('./_lib/auth');
const { renderAdminPage } = require('./_lib/admin-layout');

const BODY = `
  <div id="tabs" style="margin-bottom:16px">
    <button class="ghost" data-tab="campaigns">Кампании</button>
    <button class="ghost" data-tab="advertisers">Рекламодатели</button>
    <button class="ghost" data-tab="dashboard">Dashboard</button>
  </div>
  <div id="view"></div>
`;

const SCRIPT = `
const UTILITIES = [['electricity','Электричество'],['cold_water','Холодная вода'],['hot_water','Горячая вода'],['water','Нет воды (совсем)'],['heating','Отопление'],['gas','Газ'],['other','Другое']];
const OUTAGE_STATUSES = [['planned','Плановое'],['active','Активное'],['emergency','Аварийное'],['restored','Восстановлено'],['unknown','Неизвестно']];
const PAGE_CONTEXTS = [['home','Главная'],['search_result','Результат поиска'],['address_result','Результат по адресу'],['outage_detail','Карточка отключения'],['map','Карта'],['city_page','Страница города']];
const CAMPAIGN_TYPES = [['local','Локальная'],['context','Контекстная'],['category_exclusive','Эксклюзив категории'],['sponsor','Спонсорство'],['house_ad','Реклама BARJOK']];
const STATUS_LABEL = { draft:'Черновик', scheduled:'Запланирована', active:'Активна', paused:'На паузе', completed:'Завершена', archived:'В архиве', error:'Ошибка' };
const STATUS_CLASS = { draft:'b-manual', scheduled:'b-manual', active:'b-restored', paused:'b-manual', completed:'b-restored', archived:'b-manual', error:'b-active' };

let CATEGORIES = [], PLACEMENTS = [], ADVERTISERS = [];

async function api(path, opts) {
  const r = await fetch(path, opts);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.ok === false) { const err = new Error(j.error || ('HTTP ' + r.status)); err.data = j; throw err; }
  return j;
}
function esc(s) { return String(s == null ? '' : s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c])); }
function escAttr(s) { return esc(s).replace(/"/g, '&quot;'); }
function fmtMoney(n, cur) { return n == null ? '—' : Number(n).toLocaleString('ru-RU') + ' ' + (cur || 'KZT'); }
function fmtDate(s) { return s ? new Date(s).toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }) : '—'; }
function toInputDatetime(s) { if (!s) return ''; const d = new Date(s); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0,16); }

async function loadRefs() {
  if (!CATEGORIES.length) CATEGORIES = (await api('/api/admin-ads-api?resource=categories')).categories;
  if (!PLACEMENTS.length) PLACEMENTS = (await api('/api/admin-ads-api?resource=placements')).placements;
}

function setTab(tab) {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  location.hash = '#' + tab;
}
document.getElementById('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) route(b.dataset.tab);
});

// ---------------- ROUTER ----------------
function route(forced) {
  const hash = forced ? '#' + forced : (location.hash || '#campaigns');
  const [tab, arg] = hash.slice(1).split('/');
  setTab(tab === 'campaign-edit' ? 'campaigns' : tab);
  if (tab === 'advertisers') return renderAdvertisers();
  if (tab === 'dashboard') return renderDashboard();
  if (tab === 'campaign-edit') return renderCampaignEdit(arg === 'new' ? null : Number(arg));
  return renderCampaigns();
}
addEventListener('hashchange', () => route());

// ---------------- DASHBOARD ----------------
async function renderDashboard() {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">Загрузка…</div>';
  try {
    const d = await api('/api/admin-ads-api?resource=dashboard');
    const kpi = (v, l) => '<div class="card" style="text-align:center;padding:18px 8px"><div style="font-size:26px;font-weight:800">' + esc(v) + '</div><div class="muted" style="margin-top:4px">' + l + '</div></div>';
    const alerts = [];
    d.alerts.endingSoon.forEach((c) => alerts.push('⚠ Кампания «' + esc(c.name) + '» заканчивается скоро — <a href="#campaign-edit/' + c.id + '" style="color:#9ec1ff">открыть</a>'));
    d.alerts.noActiveCreative.forEach((c) => alerts.push('⚠ У кампании «' + esc(c.name) + '» нет активного creative — <a href="#campaign-edit/' + c.id + '" style="color:#9ec1ff">открыть</a>'));
    view.innerHTML =
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px">' +
        kpi(d.activeCampaigns, 'Активных кампаний') + kpi(d.scheduledCampaigns, 'Запланировано') +
        kpi(d.totals.impressions || 0, 'Показов (всего)') + kpi(d.totals.clicks || 0, 'Кликов (всего)') +
        kpi(d.totals.ctr != null ? d.totals.ctr + '%' : '—', 'CTR') +
      '</div>' +
      (alerts.length ? '<div class="card"><h3 style="margin-top:0">Требует внимания</h3>' + alerts.map((a) => '<div style="padding:6px 0;border-bottom:1px solid #232733;font-size:13px">' + a + '</div>').join('') + '</div>' : '<div class="card muted">Всё спокойно — предупреждений нет.</div>');
  } catch (e) { view.innerHTML = '<div class="card">Ошибка: ' + esc(e.message) + '</div>'; }
}

// ---------------- CAMPAIGNS LIST ----------------
async function renderCampaigns() {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card"><button id="newCampaignBtn">+ Новая кампания</button></div><div class="card"><table><thead><tr><th>Кампания</th><th>Рекламодатель</th><th>Тип</th><th>Статус</th><th>Период</th><th>Действия</th></tr></thead><tbody id="campRows"><tr><td colspan="6" class="empty">Загрузка…</td></tr></tbody></table></div>';
  document.getElementById('newCampaignBtn').onclick = () => { location.hash = '#campaign-edit/new'; };
  try {
    await loadRefs();
    const { campaigns } = await api('/api/admin-ads-api?resource=campaigns');
    const { advertisers } = await api('/api/admin-ads-api?resource=advertisers');
    ADVERTISERS = advertisers;
    const advName = (id) => { const a = advertisers.find((x) => x.id === id); return a ? esc(a.company_name) : '—'; };
    const rows = document.getElementById('campRows');
    if (!campaigns.length) { rows.innerHTML = '<tr><td colspan="6" class="empty">Пока нет ни одной кампании</td></tr>'; return; }
    rows.innerHTML = campaigns.map((c) => {
      const actions = [];
      actions.push('<button class="ghost" data-edit="' + c.id + '">Изменить</button>');
      if (c.status === 'active' || c.status === 'scheduled') actions.push('<button class="ghost" data-act="pause_campaign" data-id="' + c.id + '">Пауза</button>');
      if (c.status === 'paused') actions.push('<button class="ghost" data-act="resume_campaign" data-id="' + c.id + '">Возобновить</button>');
      actions.push('<button class="ghost" data-act="duplicate_campaign" data-id="' + c.id + '">Дублировать</button>');
      if (c.status !== 'archived') actions.push('<button class="ghost" data-act="archive_campaign" data-id="' + c.id + '">В архив</button>');
      return '<tr>' +
        '<td>' + esc(c.name) + '<div class="muted">' + esc(c.campaign_key) + '</div></td>' +
        '<td>' + advName(c.advertiser_id) + '</td>' +
        '<td>' + esc(c.campaign_type) + '</td>' +
        '<td><span class="badge ' + (STATUS_CLASS[c.status]||'') + '">' + (STATUS_LABEL[c.status]||c.status) + '</span>' + (c.status_reason ? '<div class="muted">' + esc(c.status_reason) + '</div>' : '') + '</td>' +
        '<td class="muted">' + fmtDate(c.start_at) + ' — ' + fmtDate(c.end_at) + '</td>' +
        '<td class="actions">' + actions.join('') + '</td>' +
      '</tr>';
    }).join('');
    rows.addEventListener('click', async (e) => {
      const edit = e.target.closest('button[data-edit]');
      if (edit) { location.hash = '#campaign-edit/' + edit.dataset.edit; return; }
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      if (btn.dataset.act === 'archive_campaign' && !confirm('Архивировать кампанию?')) return;
      btn.disabled = true;
      try { await api('/api/admin-ads-api', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action: btn.dataset.act, id: Number(btn.dataset.id) }) }); await renderCampaigns(); }
      catch (err) { alert('Ошибка: ' + err.message); btn.disabled = false; }
    }, { once: true });
  } catch (e) { document.getElementById('campRows').innerHTML = '<tr><td colspan="6" class="empty">Ошибка: ' + esc(e.message) + '</td></tr>'; }
}

// ---------------- ADVERTISERS ----------------
async function renderAdvertisers() {
  const view = document.getElementById('view');
  view.innerHTML =
    '<div class="card"><h3 style="margin-top:0">Новый рекламодатель</h3>' +
    '<form id="advForm" class="new" style="flex-direction:column;align-items:stretch;gap:10px">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<input name="company_name" placeholder="Название компании *" required style="flex:1;min-width:200px">' +
        '<input name="brand_name" placeholder="Название бренда" style="flex:1;min-width:160px">' +
        '<input name="category" placeholder="Категория (напр. water_delivery)" style="flex:1;min-width:200px">' +
        '<input name="website" placeholder="Сайт" style="flex:1;min-width:180px">' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<input name="contact_person" placeholder="Контактное лицо" style="flex:1;min-width:160px">' +
        '<input name="contact_phone" placeholder="Телефон" style="flex:1;min-width:140px">' +
        '<input name="contact_email" placeholder="Email" style="flex:1;min-width:160px">' +
        '<select name="status"><option value="prospect">Потенциальный</option><option value="active" selected>Активный</option><option value="paused">На паузе</option></select>' +
      '</div>' +
      '<button type="submit" style="align-self:flex-start">Создать</button>' +
    '</form></div>' +
    '<div class="card"><table><thead><tr><th>Компания</th><th>Категория</th><th>Статус</th><th>Контакт</th><th>Кампаний</th></tr></thead><tbody id="advRows"><tr><td colspan="5" class="empty">Загрузка…</td></tr></tbody></table></div>';

  document.getElementById('advForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = Object.fromEntries(f.entries());
    try { await api('/api/admin-ads-api', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action: 'save_advertiser', ...body }) }); e.target.reset(); await renderAdvertisers(); }
    catch (err) { alert('Ошибка: ' + err.message); }
  });

  try {
    const { advertisers } = await api('/api/admin-ads-api?resource=advertisers');
    const { campaigns } = await api('/api/admin-ads-api?resource=campaigns');
    const rows = document.getElementById('advRows');
    if (!advertisers.length) { rows.innerHTML = '<tr><td colspan="5" class="empty">Пока нет рекламодателей</td></tr>'; return; }
    rows.innerHTML = advertisers.map((a) => {
      const cnt = campaigns.filter((c) => c.advertiser_id === a.id).length;
      return '<tr><td>' + esc(a.company_name) + (a.brand_name ? '<div class="muted">' + esc(a.brand_name) + '</div>' : '') + '</td>' +
        '<td>' + esc(a.category || '—') + '</td>' +
        '<td>' + esc(a.status) + '</td>' +
        '<td class="muted">' + esc(a.contact_person || '') + (a.contact_phone ? ' · ' + esc(a.contact_phone) : '') + '</td>' +
        '<td>' + cnt + '</td></tr>';
    }).join('');
  } catch (e) { document.getElementById('advRows').innerHTML = '<tr><td colspan="5" class="empty">Ошибка: ' + esc(e.message) + '</td></tr>'; }
}

// ---------------- CAMPAIGN EDITOR ----------------
function checkboxGroup(name, options, selected) {
  return options.map(([val, label]) =>
    '<label style="margin-right:14px;font-size:13px;color:#c7cbd4"><input type="checkbox" name="' + name + '" value="' + val + '" ' + (selected.includes(val) ? 'checked' : '') + '> ' + label + '</label>'
  ).join('');
}

async function renderCampaignEdit(id) {
  const view = document.getElementById('view');
  view.innerHTML = '<div class="card">Загрузка…</div>';
  await loadRefs();
  if (!ADVERTISERS.length) ADVERTISERS = (await api('/api/admin-ads-api?resource=advertisers')).advertisers;

  let campaign = { name:'', advertiser_id:'', category:'', campaign_type:'local', cities:['pavlodar'], all_cities:false,
    utility_types:[], outage_statuses:[], page_contexts:[], device_targeting:'all', priority:50, weight:100,
    category_exclusive:false, pricing_model:'fixed', contract_value:'', currency:'KZT', discount_pct:0,
    max_impressions:'', max_clicks:'', max_budget:'', frequency_cap_count:'', frequency_cap_window_hours:'',
    start_at:'', end_at:'', notes:'' };
  let creatives = [];
  let placementIds = [];
  if (id) {
    const data = await api('/api/admin-ads-api?resource=campaign&id=' + id);
    campaign = data.campaign; creatives = data.creatives; placementIds = data.placementIds;
  }

  const advOptions = ADVERTISERS.map((a) => '<option value="' + a.id + '" ' + (campaign.advertiser_id === a.id ? 'selected' : '') + '>' + esc(a.company_name) + '</option>').join('');
  const catOptions = ['<option value="">—</option>'].concat(CATEGORIES.map((c) => '<option value="' + c.slug + '" ' + (campaign.category === c.slug ? 'selected' : '') + '>' + esc(c.name) + '</option>')).join('');
  const typeOptions = CAMPAIGN_TYPES.map(([v,l]) => '<option value="' + v + '" ' + (campaign.campaign_type === v ? 'selected' : '') + '>' + l + '</option>').join('');

  view.innerHTML =
    '<div class="card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<h2 style="margin:0">' + (id ? 'Редактирование: ' + esc(campaign.name) : 'Новая кампания') + '</h2>' +
        (id ? '<span class="badge ' + (STATUS_CLASS[campaign.status]||'') + '">' + (STATUS_LABEL[campaign.status]||campaign.status) + '</span>' : '') +
      '</div>' +
    '</div>' +

    '<div class="card"><h3 style="margin-top:0">Основные настройки</h3>' +
    '<form id="basicForm" style="display:flex;flex-direction:column;gap:10px">' +
      '<input type="hidden" name="id" value="' + (id||'') + '">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<input name="name" placeholder="Название кампании *" value="' + escAttr(campaign.name) + '" required style="flex:2;min-width:240px">' +
        '<select name="advertiser_id" required style="flex:1;min-width:180px"><option value="">Рекламодатель…</option>' + advOptions + '</select>' +
        '<select name="category" style="flex:1;min-width:160px">' + catOptions + '</select>' +
        '<select name="campaign_type" style="flex:1;min-width:140px">' + typeOptions + '</select>' +
      '</div>' +

      '<h4 style="margin:6px 0 0">Таргетинг</h4>' +
      '<div><label><input type="checkbox" name="all_cities" ' + (campaign.all_cities?'checked':'') + '> Все текущие города</label> ' +
        '<span class="muted">(иначе — только Pavlodar, других городов пока нет)</span></div>' +
      '<div><b class="muted" style="font-size:12px">Типы услуг:</b><br>' + checkboxGroup('utility_types', UTILITIES, campaign.utility_types||[]) + '</div>' +
      '<div><b class="muted" style="font-size:12px">Статус отключения:</b><br>' + checkboxGroup('outage_statuses', OUTAGE_STATUSES, campaign.outage_statuses||[]) + '</div>' +
      '<div><b class="muted" style="font-size:12px">Где на сайте:</b><br>' + checkboxGroup('page_contexts', PAGE_CONTEXTS, campaign.page_contexts||[]) + '</div>' +
      '<div><b class="muted" style="font-size:12px">Места размещения:</b><br>' + checkboxGroup('placement_ids', PLACEMENTS.map(p=>[p.id,p.name]), placementIds) + '</div>' +
      '<div><b class="muted" style="font-size:12px">Устройство:</b> <select name="device_targeting"><option value="all"' + (campaign.device_targeting==='all'?' selected':'') + '>Все</option><option value="mobile"' + (campaign.device_targeting==='mobile'?' selected':'') + '>Mobile</option><option value="desktop"' + (campaign.device_targeting==='desktop'?' selected':'') + '>Desktop</option></select></div>' +

      '<h4 style="margin:6px 0 0">Расписание</h4>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<label class="muted" style="font-size:12px">Начало<br><input type="datetime-local" name="start_at" value="' + toInputDatetime(campaign.start_at) + '"></label>' +
        '<label class="muted" style="font-size:12px">Окончание<br><input type="datetime-local" name="end_at" value="' + toInputDatetime(campaign.end_at) + '"></label>' +
      '</div>' +

      '<h4 style="margin:6px 0 0">Бюджет и лимиты</h4>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<select name="pricing_model"><option value="fixed"' + (campaign.pricing_model==='fixed'?' selected':'') + '>Фиксированная</option><option value="cpm"' + (campaign.pricing_model==='cpm'?' selected':'') + '>CPM</option><option value="cpc"' + (campaign.pricing_model==='cpc'?' selected':'') + '>CPC</option><option value="house"' + (campaign.pricing_model==='house'?' selected':'') + '>Своя реклама</option></select>' +
        '<input name="contract_value" type="number" placeholder="Сумма контракта" value="' + escAttr(campaign.contract_value) + '" style="width:160px">' +
        '<input name="max_impressions" type="number" placeholder="Макс. показов" value="' + escAttr(campaign.max_impressions) + '" style="width:150px">' +
        '<input name="max_clicks" type="number" placeholder="Макс. кликов" value="' + escAttr(campaign.max_clicks) + '" style="width:130px">' +
        '<input name="frequency_cap_count" type="number" placeholder="Freq cap: показов" value="' + escAttr(campaign.frequency_cap_count) + '" style="width:160px">' +
        '<input name="frequency_cap_window_hours" type="number" placeholder="за N часов" value="' + escAttr(campaign.frequency_cap_window_hours) + '" style="width:130px">' +
        '<input name="priority" type="number" placeholder="Приоритет (1-100)" value="' + escAttr(campaign.priority) + '" style="width:150px">' +
        '<label><input type="checkbox" name="category_exclusive" ' + (campaign.category_exclusive?'checked':'') + '> Эксклюзив категории</label>' +
      '</div>' +
      '<textarea name="notes" placeholder="Внутренние заметки (рекламодателю не видны)" rows="2">' + esc(campaign.notes||'') + '</textarea>' +
      '<button type="submit" style="align-self:flex-start">' + (id ? 'Сохранить' : 'Создать (черновик)') + '</button>' +
    '</form></div>' +

    (id ? creativesSectionHtml(creatives) : '<div class="card"><i class="muted">Сначала сохраните кампанию — потом можно будет добавить креативы.</i></div>') +
    (id ? '<div class="card"><h3 style="margin-top:0">Предпросмотр UTM</h3><div id="utmPreview" class="muted">Выберите/сохраните creative выше, чтобы увидеть ссылку.</div></div>' : '') +
    (id ? validationAndPublishHtml(campaign) : '') +
    (id ? '<div class="card"><h3 style="margin-top:0">Аналитика</h3><div id="analyticsBox" class="muted">Загрузка…</div></div>' : '') +
    (id ? reportsSectionHtml() : '');

  document.getElementById('basicForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { action: 'save_campaign' };
    if (f.get('id')) body.id = Number(f.get('id'));
    body.name = f.get('name');
    body.advertiser_id = Number(f.get('advertiser_id'));
    body.category = f.get('category') || null;
    body.campaign_type = f.get('campaign_type');
    body.all_cities = f.has('all_cities');
    body.cities = body.all_cities ? [] : ['pavlodar'];
    body.utility_types = f.getAll('utility_types');
    body.outage_statuses = f.getAll('outage_statuses');
    body.page_contexts = f.getAll('page_contexts');
    body.placement_ids = f.getAll('placement_ids');
    body.device_targeting = f.get('device_targeting');
    body.start_at = f.get('start_at') ? new Date(f.get('start_at')).toISOString() : null;
    body.end_at = f.get('end_at') ? new Date(f.get('end_at')).toISOString() : null;
    body.pricing_model = f.get('pricing_model');
    body.contract_value = f.get('contract_value') || null;
    body.max_impressions = f.get('max_impressions') || null;
    body.max_clicks = f.get('max_clicks') || null;
    body.frequency_cap_count = f.get('frequency_cap_count') || null;
    body.frequency_cap_window_hours = f.get('frequency_cap_window_hours') || null;
    body.priority = f.get('priority') || 50;
    body.category_exclusive = f.has('category_exclusive');
    body.notes = f.get('notes') || null;
    try {
      const r = await api('/api/admin-ads-api', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) });
      location.hash = '#campaign-edit/' + r.campaign.id;
      if (id) route();
    } catch (err) { alert('Ошибка: ' + err.message); }
  });

  if (id) wireCreativesAndPublish(id, campaign);
  if (id) { loadAnalytics(id); wireReports(id); }
}

function creativesSectionHtml(creatives) {
  const rows = creatives.map((cr) =>
    '<tr data-cr-id="' + cr.id + '">' +
      '<td>' + esc(cr.internal_name) + '<div class="muted">' + esc(cr.slug) + '</div></td>' +
      '<td>' + esc(cr.headline) + '</td>' +
      '<td>' + esc(cr.cta_text) + '</td>' +
      '<td>' + esc(cr.status) + '</td>' +
      '<td class="actions"><button class="ghost" data-select-cr="' + cr.id + '">UTM</button> <button class="ghost" data-del-cr="' + cr.id + '">Удалить</button></td>' +
    '</tr>').join('');
  return '<div class="card"><h3 style="margin-top:0">Креативы</h3>' +
    '<table><thead><tr><th>Название</th><th>Заголовок</th><th>CTA</th><th>Статус</th><th>Действия</th></tr></thead><tbody id="crRows">' +
    (rows || '<tr><td colspan="5" class="empty">Нет creatives</td></tr>') + '</tbody></table>' +
    '<h4>Добавить creative</h4>' +
    '<form id="crForm" style="display:flex;flex-direction:column;gap:8px;max-width:640px">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<input name="internal_name" placeholder="Внутреннее название *" required style="flex:1;min-width:180px">' +
        '<input name="slug" placeholder="slug (напр. headline_a)" style="flex:1;min-width:160px">' +
      '</div>' +
      '<input name="headline" placeholder="Заголовок * (до 60 симв.)" maxlength="60" required>' +
      '<input name="description" placeholder="Описание (до 120 симв.)" maxlength="120">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
        '<input name="brand_name" placeholder="Название бренда" style="flex:1;min-width:140px">' +
        '<input name="image_url" placeholder="URL картинки" style="flex:2;min-width:220px">' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
        '<label><input type="checkbox" name="cta_enabled" checked> Кнопка CTA</label>' +
        '<input name="cta_text" placeholder="Текст кнопки" value="Узнать подробнее" style="flex:1;min-width:140px">' +
        '<select name="cta_action_type"><option value="website">Сайт</option><option value="phone">Телефон</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option></select>' +
        '<input name="cta_destination" placeholder="https://... или телефон" style="flex:2;min-width:220px">' +
      '</div>' +
      '<button type="submit" style="align-self:flex-start">Добавить creative</button>' +
    '</form></div>';
}

function validationAndPublishHtml(campaign) {
  return '<div class="card">' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button id="validateBtn" class="ghost">Проверить кампанию</button>' +
      '<button id="publishBtn">Опубликовать кампанию</button>' +
    '</div>' +
    '<div id="validationResult" style="margin-top:10px"></div>' +
  '</div>';
}

function wireCreativesAndPublish(id, campaign) {
  const crForm = document.getElementById('crForm');
  if (crForm) crForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const body = { action: 'save_creative', campaign_id: id, cta_enabled: f.has('cta_enabled') };
    ['internal_name','slug','headline','description','brand_name','image_url','cta_text','cta_action_type','cta_destination'].forEach((k) => { body[k] = f.get(k) || null; });
    try { await api('/api/admin-ads-api', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) }); await renderCampaignEdit(id); }
    catch (err) { alert('Ошибка: ' + err.message); }
  });
  const crRows = document.getElementById('crRows');
  if (crRows) crRows.addEventListener('click', async (e) => {
    const del = e.target.closest('button[data-del-cr]');
    if (del) {
      if (!confirm('Удалить creative?')) return;
      await api('/api/admin-ads-api', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action: 'delete_creative', id: Number(del.dataset.delCr) }) });
      return renderCampaignEdit(id);
    }
    const sel = e.target.closest('button[data-select-cr]');
    if (sel) {
      const box = document.getElementById('utmPreview');
      box.innerHTML = 'Считаю…';
      const data = await api('/api/admin-ads-api?resource=campaign&id=' + id);
      const cr = data.creatives.find((c) => c.id === Number(sel.dataset.selectCr));
      const utm = 'utm_source=barjok&utm_medium=' + (campaign.campaign_type === 'context' ? 'context' : 'ads') + '&utm_campaign=' + campaign.campaign_key + '&utm_content=' + cr.slug;
      const dest = cr.cta_destination || 'https://advertiser.example.kz/';
      let finalUrl = dest;
      try { const u = new URL(dest); u.searchParams.set('utm_source','barjok'); u.searchParams.set('utm_medium', campaign.campaign_type === 'context' ? 'context' : 'ads'); u.searchParams.set('utm_campaign', campaign.campaign_key); u.searchParams.set('utm_content', cr.slug); u.searchParams.set('bjclid','(генерируется при клике)'); finalUrl = u.toString(); } catch(e) {}
      box.innerHTML = '<div style="word-break:break-all;font-family:monospace;font-size:12px;background:#0f1115;padding:10px;border-radius:8px">' + esc(finalUrl) + '</div>';
    }
  });
  const validateBtn = document.getElementById('validateBtn');
  const publishBtn = document.getElementById('publishBtn');
  const showResult = (r) => {
    const box = document.getElementById('validationResult');
    let html = '';
    if (r.errors && r.errors.length) html += '<div style="color:#ff8a80"><b>Ошибки:</b><ul>' + r.errors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul></div>';
    if (r.warnings && r.warnings.length) html += '<div style="color:#ffcf6b"><b>Предупреждения:</b><ul>' + r.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul></div>';
    if (!html) html = '<div style="color:#7be08a">Всё в порядке.</div>';
    box.innerHTML = html;
  };
  if (validateBtn) validateBtn.onclick = async () => {
    try { const r = await api('/api/admin-ads-api', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action: 'validate_campaign', id }) }); showResult(r); }
    catch (err) { alert('Ошибка: ' + err.message); }
  };
  if (publishBtn) publishBtn.onclick = async () => {
    if (!confirm('Опубликовать кампанию? Если дата начала уже наступила — реклама станет активной сразу.')) return;
    try {
      const r = await api('/api/admin-ads-api', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action: 'publish_campaign', id }) });
      showResult(r);
      await renderCampaignEdit(id);
    } catch (err) {
      if (err.data && (err.data.errors || err.data.warnings)) showResult(err.data);
      else alert('Ошибка: ' + err.message);
    }
  };
}

// ---------------- ANALYTICS (§51-56) ----------------
async function loadAnalytics(id) {
  const box = document.getElementById('analyticsBox');
  if (!box) return;
  try {
    const d = await api('/api/admin-ads-api?resource=campaign-analytics&id=' + id);
    const o = d.overview;
    const kpi = (v, l) => '<div style="display:inline-block;min-width:110px;margin:0 14px 10px 0"><div style="font-size:20px;font-weight:800">' + esc(v) + '</div><div class="muted" style="font-size:12px">' + l + '</div></div>';
    let html = kpi(o.impressions, 'Показы') + kpi(o.reach, 'Уникальный охват') + kpi(o.clicks, 'Клики') +
      kpi(o.uniqueClicks, 'Уник. клики') + kpi(o.ctr != null ? o.ctr + '%' : '—', 'CTR') +
      kpi(o.frequency != null ? o.frequency : '—', 'Frequency') +
      kpi(o.cpm != null ? o.cpm : '—', 'CPM') + kpi(o.cpc != null ? o.cpc : '—', 'CPC');
    if (d.delivery) {
      const st = { on_track: 'В графике', under: '⚠ Отстаёт', over: 'Опережает', completed: 'Завершена' }[d.delivery.status] || d.delivery.status;
      html += '<div class="muted" style="margin-top:8px;font-size:13px">Delivery: период пройден ' + (d.delivery.periodCompleted ?? '—') + '%, ожидалось ~' + (d.delivery.expected ?? '—') + ' показов, факт ' + d.delivery.actual + ' (' + (d.delivery.deliveryPct ?? '—') + '%) — ' + st + '</div>';
    }
    if (d.creativeBreakdown && d.creativeBreakdown.length) {
      html += '<table style="margin-top:12px"><thead><tr><th>Creative</th><th>Показы</th><th>Клики</th><th>CTR</th></tr></thead><tbody>' +
        d.creativeBreakdown.map((c) => '<tr><td>' + esc(c.name) + '</td><td>' + c.impressions + '</td><td>' + c.clicks + '</td><td>' + (c.ctr != null ? c.ctr + '%' : '—') + '</td></tr>').join('') +
        '</tbody></table>';
    }
    box.innerHTML = html;
  } catch (e) { box.innerHTML = 'Ошибка: ' + esc(e.message); }
}

// ---------------- REPORTS (§57-58) ----------------
function reportsSectionHtml() {
  return '<div class="card"><h3 style="margin-top:0">Отчёт для рекламодателя</h3>' +
    '<form id="reportForm" class="new"><input name="valid_days" type="number" value="30" placeholder="Дней действия" style="width:140px">' +
    '<label><input type="checkbox" name="include_financial"> Включить бюджет</label>' +
    '<button type="submit">Создать ссылку на отчёт</button></form>' +
    '<div id="reportsList" style="margin-top:10px"></div></div>';
}
async function wireReports(id) {
  const list = document.getElementById('reportsList');
  const form = document.getElementById('reportForm');
  async function reload() {
    const { reports } = await api('/api/admin-ads-api?resource=reports&id=' + id);
    if (!reports.length) { list.innerHTML = '<span class="muted">Ссылок ещё нет</span>'; return; }
    list.innerHTML = reports.map((r) => {
      const url = location.origin + '/report/' + r.token + '/';
      const status = r.disabled ? 'отключена' : (r.valid_until && new Date(r.valid_until) < new Date() ? 'истекла' : 'активна');
      return '<div style="padding:8px 0;border-bottom:1px solid #232733;font-size:13px">' +
        '<a href="' + url + '" target="_blank" style="color:#9ec1ff;word-break:break-all">' + url + '</a>' +
        ' <span class="muted">(' + status + (r.valid_until ? ', до ' + fmtDate(r.valid_until) : '') + ')</span> ' +
        (!r.disabled ? '<button class="ghost" data-disable="' + r.id + '" style="margin-left:8px">Отключить</button>' : '') +
        '</div>';
    }).join('');
    list.querySelectorAll('button[data-disable]').forEach((b) => b.onclick = async () => {
      await api('/api/admin-ads-api', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action: 'disable_report', id: Number(b.dataset.disable) }) });
      reload();
    });
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      await api('/api/admin-ads-api', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action: 'create_report', campaign_id: id, valid_days: f.get('valid_days'), include_financial: f.has('include_financial') }) });
      e.target.reset();
      await reload();
    } catch (err) { alert('Ошибка: ' + err.message); }
  });
  await reload();
}

route();
`;

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const html = renderAdminPage({
    active: 'ads', title: 'ADS',
    sub: 'Рекламодатели, кампании, креативы, UTM. Рендер/трекинг/аналитика — следующие фазы.',
    body: BODY, script: SCRIPT,
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
