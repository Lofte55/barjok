const { requireAdmin } = require('./_lib/auth');
const { select } = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method' });
  const { resource, id } = req.query;

  try {
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
    return res.status(400).json({ ok: false, error: 'unknown_resource' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
