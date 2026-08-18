/*
 * BARJOK ADS — аналитика (фаза 5). Считаем прямо по ads_events (сырые события,
 * §74 — на текущем объёме данных агрегация "на лету" достаточно быстрая; когда
 * объём вырастет, сюда добавится daily/hourly aggregate таблица без смены API).
 */
const { select } = require('./supabase');

const enc = (s) => encodeURIComponent(s);
const pct = (a, b) => (b > 0 ? +(a / b * 100).toFixed(2) : null);
const div = (a, b) => (b > 0 ? +(a / b).toFixed(2) : null);

function summarize(events) {
  const impressions = events.filter((e) => e.event_type === 'ad_impression');
  const clicks = events.filter((e) => e.event_type === 'ad_click');
  const reach = new Set(impressions.map((e) => e.visitor_id)).size;
  const uniqueClicks = new Set(clicks.map((e) => e.visitor_id)).size;
  return {
    impressions: impressions.length,
    reach,
    clicks: clicks.length,
    uniqueClicks,
    ctr: pct(clicks.length, impressions.length),
    frequency: div(impressions.length, reach),
  };
}

async function campaignStats(campaignId) {
  const [campaign] = await select('ads_campaigns', `id=eq.${campaignId}&limit=1`);
  if (!campaign) return null;
  const events = await select('ads_events', `campaign_id=eq.${campaignId}&valid=eq.true&select=event_type,creative_id,visitor_id,created_at`);
  const overview = summarize(events || []);
  const cost = campaign.contract_value ? Number(campaign.contract_value) : null;
  overview.cpm = cost != null ? div(cost, overview.impressions / 1000) : null;
  overview.cpc = cost != null ? div(cost, overview.clicks) : null;

  const creatives = await select('ads_creatives', `campaign_id=eq.${campaignId}&select=id,internal_name,headline`);
  const byCreative = {};
  (creatives || []).forEach((cr) => { byCreative[cr.id] = { creative: cr, events: [] }; });
  (events || []).forEach((e) => { if (e.creative_id && byCreative[e.creative_id]) byCreative[e.creative_id].events.push(e); });
  const creativeBreakdown = Object.values(byCreative).map(({ creative, events: ev }) => ({
    creativeId: creative.id, name: creative.internal_name, headline: creative.headline,
    ...summarize(ev),
  }));

  // Delivery/pacing (§56) — только если есть даты и max_impressions.
  let delivery = null;
  if (campaign.start_at && campaign.end_at && campaign.max_impressions) {
    const now = Date.now();
    const start = new Date(campaign.start_at).getTime();
    const end = new Date(campaign.end_at).getTime();
    const periodCompleted = end > start ? Math.min(100, Math.max(0, +((now - start) / (end - start) * 100).toFixed(1))) : null;
    const expected = periodCompleted != null ? Math.round(campaign.max_impressions * periodCompleted / 100) : null;
    const deliveryPct = expected ? +((overview.impressions / expected) * 100).toFixed(1) : null;
    let status = 'on_track';
    if (now > end) status = 'completed';
    else if (deliveryPct != null) { if (deliveryPct < 80) status = 'under'; else if (deliveryPct > 120) status = 'over'; }
    delivery = { periodCompleted, expected, actual: overview.impressions, deliveryPct, status };
  }

  return { campaign, overview, creativeBreakdown, delivery };
}

async function dashboardStats() {
  const campaigns = await select('ads_campaigns', 'archived_at=is.null');
  const byStatus = {};
  (campaigns || []).forEach((c) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });

  const now = Date.now();
  const endingSoon = (campaigns || []).filter((c) => c.status === 'active' && c.end_at &&
    new Date(c.end_at).getTime() - now < 3 * 86400000 && new Date(c.end_at).getTime() > now);
  const noCreative = [];
  for (const c of (campaigns || []).filter((x) => x.status === 'scheduled' || x.status === 'active')) {
    const cr = await select('ads_creatives', `campaign_id=eq.${c.id}&status=eq.active&select=id&limit=1`);
    if (!cr || !cr.length) noCreative.push(c);
  }

  const activeIds = (campaigns || []).filter((c) => ['active', 'scheduled', 'completed'].includes(c.status)).map((c) => c.id);
  let totals = { impressions: 0, clicks: 0, reach: 0 };
  if (activeIds.length) {
    const events = await select('ads_events', `campaign_id=in.(${activeIds.join(',')})&valid=eq.true&select=event_type,visitor_id`);
    const s = summarize(events || []);
    totals = { impressions: s.impressions, clicks: s.clicks, reach: s.reach, ctr: s.ctr };
  }

  return {
    activeCampaigns: byStatus.active || 0,
    scheduledCampaigns: byStatus.scheduled || 0,
    totalCampaigns: (campaigns || []).length,
    totals,
    alerts: {
      endingSoon: endingSoon.map((c) => ({ id: c.id, name: c.name, end_at: c.end_at })),
      noActiveCreative: noCreative.map((c) => ({ id: c.id, name: c.name })),
    },
  };
}

module.exports = { campaignStats, dashboardStats };
