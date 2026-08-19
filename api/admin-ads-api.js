/*
 * Слияние admin-ads-data.js (GET) + admin-ads-action.js (POST) в один
 * serverless function — Vercel Hobby plan лимит 12 функций на деплой.
 */
const { requireAdmin } = require('./_lib/auth');
const crypto = require('crypto');
const { select, insert, update, remove } = require('./_lib/supabase');
const { campaignStats, dashboardStats } = require('./_lib/ads-analytics');

async function audit(entity_type, entity_id, action, before, after) {
  try { await insert('ads_audit_log', { entity_type, entity_id, action, before: before || null, after: after || null, actor: 'admin' }); }
  catch (e) { console.error('ads_audit_log insert failed:', e.message); }
}

function nextCampaignKey() {
  return 'cmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// §45: Pre-publish validation.
function validateCampaign(campaign, creatives, placementIds) {
  const errors = [];
  const warnings = [];
  if (!campaign.advertiser_id) errors.push('Не выбран рекламодатель');
  if (!campaign.name) errors.push('Не заполнено название кампании');
  if (!campaign.start_at) errors.push('Не задана дата начала');
  if (campaign.end_at && campaign.start_at && new Date(campaign.end_at) <= new Date(campaign.start_at)) errors.push('Дата окончания раньше даты начала');
  if (!placementIds || !placementIds.length) errors.push('Не выбран ни один Placement');
  if (!creatives || !creatives.length) errors.push('Нет ни одного creative');
  else {
    creatives.forEach((cr, i) => {
      if (!cr.headline) errors.push(`Creative #${i + 1}: нет заголовка`);
      if (cr.headline && cr.headline.length > 60) warnings.push(`Creative #${i + 1}: заголовок длиннее 60 символов`);
      if (cr.description && cr.description.length > 120) warnings.push(`Creative #${i + 1}: описание длиннее 120 символов`);
      if (cr.cta_enabled && !cr.cta_destination) errors.push(`Creative #${i + 1}: включён CTA, но не указан destination`);
      if (cr.cta_destination && cr.cta_action_type === 'website') {
        try { const u = new URL(cr.cta_destination); if (u.protocol !== 'https:') errors.push(`Creative #${i + 1}: destination должен быть https://`); }
        catch (e) { errors.push(`Creative #${i + 1}: некорректный destination URL`); }
      }
      if (!cr.image_url && cr.image_type !== 'logo_only') warnings.push(`Creative #${i + 1}: нет изображения`);
    });
  }
  if (!campaign.utility_types || !campaign.utility_types.length) warnings.push('Не выбран utility targeting — реклама будет показываться при любом типе отключения');
  if (!campaign.cities || !campaign.cities.length) { if (!campaign.all_cities) warnings.push('Не выбраны города и не включено "все города"'); }
  return { errors, warnings, valid: errors.length === 0 };
}

async function handleGet(req, res) {
  const { resource, id } = req.query;
  if (resource === 'advertisers') {
    const rows = await select('ads_advertisers', 'archived_at=is.null&order=company_name.asc');
    return res.status(200).json({ ok: true, advertisers: rows });
  }
  if (resource === 'campaigns') {
    const rows = await select('ads_campaigns', 'archived_at=is.null&order=updated_at.desc');
    return res.status(200).json({ ok: true, campaigns: rows });
  }
  if (resource === 'campaign' && id) {
    const [campaign] = await select('ads_campaigns', `id=eq.${Number(id)}&limit=1`);
    if (!campaign) return res.status(404).json({ ok: false, error: 'not_found' });
    const creatives = await select('ads_creatives', `campaign_id=eq.${Number(id)}&order=created_at.asc`);
    const placementLinks = await select('ads_campaign_placements', `campaign_id=eq.${Number(id)}`);
    return res.status(200).json({ ok: true, campaign, creatives, placementIds: (placementLinks || []).map((l) => l.placement_id) });
  }
  if (resource === 'categories') {
    const rows = await select('ads_categories', 'status=eq.active&order=name.asc');
    return res.status(200).json({ ok: true, categories: rows });
  }
  if (resource === 'placements') {
    const rows = await select('ads_placements', 'status=eq.active&order=id.asc');
    return res.status(200).json({ ok: true, placements: rows });
  }
  if (resource === 'dashboard') {
    const stats = await dashboardStats();
    return res.status(200).json({ ok: true, ...stats });
  }
  if (resource === 'campaign-analytics' && id) {
    const stats = await campaignStats(Number(id));
    if (!stats) return res.status(404).json({ ok: false, error: 'not_found' });
    return res.status(200).json({ ok: true, ...stats });
  }
  if (resource === 'reports' && id) {
    const rows = await select('ads_reports', `campaign_id=eq.${Number(id)}&order=created_at.desc`);
    return res.status(200).json({ ok: true, reports: rows });
  }
  return res.status(400).json({ ok: false, error: 'unknown_resource' });
}

async function handlePost(req, res) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const action = String(b.action || '');

  // ---------- Advertisers ----------
  if (action === 'save_advertiser') {
    const fields = ['company_name', 'brand_name', 'category', 'website', 'status',
      'contact_person', 'contact_position', 'contact_phone', 'contact_whatsapp', 'contact_email', 'contact_telegram',
      'logo_url', 'default_ad_image_url', 'account_manager', 'notes'];
    const patch = {};
    fields.forEach((f) => { if (b[f] !== undefined) patch[f] = b[f] || null; });
    if (!patch.company_name) return res.status(400).json({ ok: false, error: 'no_company_name' });
    let row;
    if (b.id) {
      patch.updated_at = new Date().toISOString();
      [row] = await update('ads_advertisers', `id=eq.${Number(b.id)}`, patch);
      await audit('advertiser', row.id, 'updated', null, patch);
    } else {
      [row] = await insert('ads_advertisers', patch);
      await audit('advertiser', row.id, 'created', null, patch);
    }
    return res.status(200).json({ ok: true, advertiser: row });
  }

  // ---------- Campaigns ----------
  if (action === 'save_campaign') {
    const fields = ['name', 'advertiser_id', 'category', 'campaign_type',
      'cities', 'all_cities', 'auto_include_future_cities', 'utility_types', 'outage_statuses',
      'page_contexts', 'device_targeting', 'priority', 'weight', 'category_exclusive',
      'pricing_model', 'contract_value', 'currency', 'discount_pct',
      'max_impressions', 'max_clicks', 'max_budget', 'frequency_cap_count', 'frequency_cap_window_hours',
      'start_at', 'end_at', 'timezone', 'notes'];
    const patch = {};
    fields.forEach((f) => { if (b[f] !== undefined) patch[f] = b[f] === '' ? null : b[f]; });
    if (!patch.advertiser_id) return res.status(400).json({ ok: false, error: 'no_advertiser' });
    let row;
    if (b.id) {
      patch.updated_at = new Date().toISOString();
      const [before] = await select('ads_campaigns', `id=eq.${Number(b.id)}&limit=1`);
      [row] = await update('ads_campaigns', `id=eq.${Number(b.id)}`, patch);
      await audit('campaign', row.id, 'updated', before, patch);
    } else {
      patch.campaign_key = nextCampaignKey();
      patch.status = 'draft';
      [row] = await insert('ads_campaigns', patch);
      await audit('campaign', row.id, 'created', null, patch);
    }
    if (Array.isArray(b.placement_ids)) {
      await remove('ads_campaign_placements', `campaign_id=eq.${row.id}`);
      for (const pid of b.placement_ids) await insert('ads_campaign_placements', { campaign_id: row.id, placement_id: pid });
    }
    return res.status(200).json({ ok: true, campaign: row });
  }

  if (action === 'pause_campaign' || action === 'resume_campaign' || action === 'archive_campaign') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    const [before] = await select('ads_campaigns', `id=eq.${id}&limit=1`);
    const now = new Date().toISOString();
    let patch;
    if (action === 'pause_campaign') patch = { status: 'paused', status_reason: `Paused manually by admin`, paused_by: 'admin', updated_at: now };
    else if (action === 'resume_campaign') {
      const status = before.start_at && new Date(before.start_at) > new Date() ? 'scheduled' : 'active';
      patch = { status, status_reason: null, updated_at: now };
    } else patch = { status: 'archived', archived_at: now, updated_at: now };
    const [row] = await update('ads_campaigns', `id=eq.${id}`, patch);
    await audit('campaign', id, action, before, patch);
    return res.status(200).json({ ok: true, campaign: row });
  }

  if (action === 'duplicate_campaign') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    const [src] = await select('ads_campaigns', `id=eq.${id}&limit=1`);
    if (!src) return res.status(404).json({ ok: false, error: 'not_found' });
    const copy = { ...src };
    delete copy.id; delete copy.created_at; delete copy.updated_at; delete copy.archived_at;
    copy.campaign_key = nextCampaignKey();
    copy.name = src.name + ' (copy)';
    copy.status = 'draft'; copy.status_reason = null;
    copy.start_at = null; copy.end_at = null; // §67: даты не копируются автоматически
    const [row] = await insert('ads_campaigns', copy);
    const links = await select('ads_campaign_placements', `campaign_id=eq.${id}`);
    for (const l of links || []) await insert('ads_campaign_placements', { campaign_id: row.id, placement_id: l.placement_id });
    const creatives = await select('ads_creatives', `campaign_id=eq.${id}`);
    for (const cr of creatives || []) {
      const crCopy = { ...cr };
      delete crCopy.id; delete crCopy.created_at; delete crCopy.updated_at;
      crCopy.campaign_id = row.id;
      await insert('ads_creatives', crCopy);
    }
    await audit('campaign', row.id, 'duplicated_from_' + id, null, { from: id });
    return res.status(200).json({ ok: true, campaign: row });
  }

  if (action === 'validate_campaign' || action === 'publish_campaign') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    const [campaign] = await select('ads_campaigns', `id=eq.${id}&limit=1`);
    if (!campaign) return res.status(404).json({ ok: false, error: 'not_found' });
    const creatives = await select('ads_creatives', `campaign_id=eq.${id}`);
    const links = await select('ads_campaign_placements', `campaign_id=eq.${id}`);
    const result = validateCampaign(campaign, creatives, (links || []).map((l) => l.placement_id));

    if (action === 'validate_campaign') return res.status(200).json({ ok: true, ...result });

    if (!result.valid) return res.status(400).json({ ok: false, error: 'validation_failed', ...result });
    const now = new Date();
    const status = campaign.start_at && new Date(campaign.start_at) > now ? 'scheduled' : 'active';
    const patch = { status, status_reason: null, published_by: 'admin', updated_at: now.toISOString() };
    const [row] = await update('ads_campaigns', `id=eq.${id}`, patch);
    await audit('campaign', id, 'published', campaign, patch);
    return res.status(200).json({ ok: true, campaign: row, ...result });
  }

  // ---------- Creatives ----------
  if (action === 'save_creative') {
    const fields = ['internal_name', 'slug', 'headline', 'description', 'brand_name', 'sponsor_label',
      'image_url', 'image_type', 'cta_enabled', 'cta_text', 'cta_action_type', 'cta_destination', 'weight', 'status'];
    const patch = {};
    fields.forEach((f) => { if (b[f] !== undefined) patch[f] = b[f] === '' ? null : b[f]; });
    if (!b.campaign_id) return res.status(400).json({ ok: false, error: 'no_campaign' });
    let row;
    if (b.id) {
      patch.updated_at = new Date().toISOString();
      [row] = await update('ads_creatives', `id=eq.${Number(b.id)}`, patch);
    } else {
      patch.campaign_id = Number(b.campaign_id);
      if (!patch.slug) patch.slug = 'creative_' + Date.now().toString(36);
      [row] = await insert('ads_creatives', patch);
    }
    return res.status(200).json({ ok: true, creative: row });
  }

  if (action === 'delete_creative') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    await remove('ads_creatives', `id=eq.${id}`);
    return res.status(200).json({ ok: true });
  }

  // ---------- Reports (§57-58) ----------
  if (action === 'create_report') {
    const campaignId = Number(b.campaign_id);
    if (!campaignId) return res.status(400).json({ ok: false, error: 'bad_input' });
    const validDays = Number(b.valid_days) || 30;
    const [row] = await insert('ads_reports', {
      token: crypto.randomBytes(18).toString('base64url'),
      campaign_id: campaignId,
      valid_until: new Date(Date.now() + validDays * 86400000).toISOString(),
      password: b.password || null,
      include_financial: !!b.include_financial,
    });
    return res.status(200).json({ ok: true, report: row });
  }
  if (action === 'disable_report') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    const [row] = await update('ads_reports', `id=eq.${id}`, { disabled: true });
    return res.status(200).json({ ok: true, report: row });
  }

  return res.status(400).json({ ok: false, error: 'unknown_action' });
}

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ ok: false, error: 'method' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
