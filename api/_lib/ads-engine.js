/*
 * BARJOK ADS — Campaign Engine (фаза 1: только логика выбора рекламы, без рендера,
 * без трекинга-эндпоинтов, без UI создания кампаний — по плану это следующие фазы).
 *
 * selectAd() реализует rotation-порядок из документа §39:
 *   Active → schedule → targeting → exclusions → placement → frequency cap →
 *   impression/click/budget limits → category exclusivity → priority/weight → победитель.
 *
 * ВАЖНО (§18, §29, §91): в этот модуль НИКОГДА не передаётся точный адрес
 * пользователя — только city_id/utility_type/outage_status. UTM/макросы не
 * поддерживают {address}.
 */
const { select } = require('./supabase');

const enc = (s) => encodeURIComponent(s);

async function getActiveCampaignsForPlacement(placementId) {
  const rows = await select('ads_campaigns', `status=eq.active&order=priority.desc`);
  if (!rows || !rows.length) return [];
  const placementLinks = await select('ads_campaign_placements', `placement_id=eq.${enc(placementId)}`);
  const allowedCampaignIds = new Set((placementLinks || []).map((l) => l.campaign_id));
  return rows.filter((c) => allowedCampaignIds.has(c.id));
}

function scheduleOk(c, now) {
  // Auto start/stop (§37): статус кампании — источник правды, но подстраховываемся
  // датами на случай, если фоновая задача auto-start/stop ещё не отработала.
  if (c.start_at && new Date(c.start_at) > now) return false;
  if (c.end_at && new Date(c.end_at) < now) return false;
  if (c.schedule_days && c.schedule_days.length) {
    const isoDay = ((now.getUTCDay() + 6) % 7) + 1; // 1=Mon..7=Sun
    if (!c.schedule_days.includes(isoDay)) return false;
  }
  if (c.schedule_time_start && c.schedule_time_end) {
    const hhmm = now.toISOString().slice(11, 16);
    if (hhmm < c.schedule_time_start.slice(0, 5) || hhmm > c.schedule_time_end.slice(0, 5)) return false;
  }
  return true;
}

function targetingOk(c, ctx) {
  if (!c.all_cities && c.cities.length && !c.cities.includes(ctx.cityId)) return false;
  if (c.utility_types.length && ctx.utilityType && !c.utility_types.includes(ctx.utilityType)) return false;
  if (c.outage_statuses.length && ctx.outageStatus && !c.outage_statuses.includes(ctx.outageStatus)) return false;
  if (c.page_contexts.length && ctx.pageContext && !c.page_contexts.includes(ctx.pageContext)) return false;
  if (c.device_targeting !== 'all' && ctx.deviceType && c.device_targeting !== ctx.deviceType) return false;
  return true;
}

// §17: exclude имеет приоритет над include.
function excludedByRules(c, ctx) {
  const ex = c.exclude_rules || {};
  if (ex.placements && ex.placements.includes(ctx.placementId)) return true;
  if (ex.devices && ctx.deviceType && ex.devices.includes(ctx.deviceType)) return true;
  if (ex.utility_types && ctx.utilityType && ex.utility_types.includes(ctx.utilityType)) return true;
  if (ex.days) {
    const isoDay = ((new Date().getUTCDay() + 6) % 7) + 1;
    if (ex.days.includes(isoDay)) return true;
  }
  return false;
}

async function frequencyOk(c, ctx) {
  if (!c.frequency_cap_count || !c.frequency_cap_window_hours || !ctx.visitorId) return true;
  const since = new Date(Date.now() - c.frequency_cap_window_hours * 3600000).toISOString();
  const rows = await select('ads_events',
    `campaign_id=eq.${c.id}&event_type=eq.ad_impression&visitor_id=eq.${enc(ctx.visitorId)}&created_at=gte.${since}&valid=eq.true&select=id`);
  return (rows || []).length < c.frequency_cap_count;
}

async function limitsOk(c) {
  if (c.max_impressions) {
    const rows = await select('ads_events', `campaign_id=eq.${c.id}&event_type=eq.ad_impression&valid=eq.true&select=id`);
    if ((rows || []).length >= c.max_impressions) return false;
  }
  if (c.max_clicks) {
    const rows = await select('ads_events', `campaign_id=eq.${c.id}&event_type=eq.ad_click&valid=eq.true&select=id`);
    if ((rows || []).length >= c.max_clicks) return false;
  }
  // max_budget (CPM/CPC) — считается в фазе tracking/billing, когда появится цена
  // за событие; для pricing_model=fixed бюджетный лимит не применим (§34-35).
  return true;
}

// §42: Category Exclusive — если хоть одна из подходящих кампаний в этой категории
// эксклюзивна, оставляем только эксклюзивные кампании этой категории (конфликт
// разных эксклюзивных рекламодателей одной категории — ответственность §45 validation
// при публикации, engine на выборе просто не должен смешивать exclusive с не-exclusive).
function applyCategoryExclusivity(candidates) {
  const exclusiveCategories = new Set(candidates.filter((c) => c.category_exclusive).map((c) => c.category));
  if (!exclusiveCategories.size) return candidates;
  return candidates.filter((c) => !exclusiveCategories.has(c.category) || c.category_exclusive);
}

// §40-41: priority определяет пул (берём кампании с максимальным priority среди
// прошедших фильтры), внутри пула — weighted random по weight.
function pickWinner(candidates) {
  if (!candidates.length) return null;
  const maxPriority = Math.max(...candidates.map((c) => c.priority));
  const pool = candidates.filter((c) => c.priority === maxPriority);
  const totalWeight = pool.reduce((s, c) => s + Math.max(c.weight, 1), 0);
  let r = Math.random() * totalWeight;
  for (const c of pool) {
    r -= Math.max(c.weight, 1);
    if (r <= 0) return c;
  }
  return pool[0];
}

// §43: внутри выигравшей кампании — manual weights между creatives.
function pickCreative(creatives) {
  const active = creatives.filter((cr) => cr.status === 'active');
  if (!active.length) return null;
  const totalWeight = active.reduce((s, cr) => s + Math.max(cr.weight, 1), 0);
  let r = Math.random() * totalWeight;
  for (const cr of active) {
    r -= Math.max(cr.weight, 1);
    if (r <= 0) return cr;
  }
  return active[0];
}

/*
 * ctx: { placementId, cityId, utilityType, outageStatus, deviceType, pageContext, visitorId }
 * НЕ передавать address — engine его не принимает и не должен.
 */
async function selectAd(ctx) {
  const now = new Date();
  let candidates = await getActiveCampaignsForPlacement(ctx.placementId);
  candidates = candidates.filter((c) => scheduleOk(c, now));
  candidates = candidates.filter((c) => targetingOk(c, ctx));
  candidates = candidates.filter((c) => !excludedByRules(c, ctx));
  candidates = applyCategoryExclusivity(candidates);

  const survivors = [];
  for (const c of candidates) {
    if (!(await frequencyOk(c, ctx))) continue;
    if (!(await limitsOk(c))) continue;
    survivors.push(c);
  }

  const winner = pickWinner(survivors);
  if (!winner) return null;

  const creatives = await select('ads_creatives', `campaign_id=eq.${winner.id}`);
  const creative = pickCreative(creatives || []);
  if (!creative) return null;

  return { campaign: winner, creative };
}

/*
 * UTM Builder (§28-31). Макросы: {city} {utility} {placement} {campaign_id}
 * {creative_id} — НЕ {address} (§29, приватность). Добавляет к существующим
 * query-параметрам корректно (§31), не ломая URL.
 */
const MEDIUM_BY_TYPE = { context: 'context', category_exclusive: 'ads', sponsor: 'sponsor', local: 'ads', house_ad: 'house' };

function expandMacros(tpl, ctx) {
  return String(tpl || '')
    .replace(/\{city\}/g, ctx.cityId || '')
    .replace(/\{utility\}/g, ctx.utilityType || '')
    .replace(/\{placement\}/g, ctx.placementId || '')
    .replace(/\{campaign_id\}/g, ctx.campaign.campaign_key)
    .replace(/\{creative_id\}/g, ctx.creative.slug);
}

function buildUtm({ campaign, creative, cityId, utilityType, placementId, term }) {
  const params = {
    utm_source: 'barjok',
    utm_medium: MEDIUM_BY_TYPE[campaign.campaign_type] || 'ads',
    utm_campaign: campaign.campaign_key,
    utm_content: creative.slug,
  };
  if (term) params.utm_term = expandMacros(term, { campaign, creative, cityId, utilityType, placementId });
  return params;
}

function appendUtmToUrl(baseUrl, utmParams, clickId) {
  let url;
  try { url = new URL(baseUrl); } catch (e) { return null; } // §27: только валидные https:// URL
  if (url.protocol !== 'https:') return null;
  Object.entries(utmParams).forEach(([k, v]) => url.searchParams.set(k, v));
  if (clickId) url.searchParams.set('bjclid', clickId);
  return url.toString();
}

module.exports = { selectAd, buildUtm, appendUtmToUrl };
