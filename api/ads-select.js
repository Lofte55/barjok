/*
 * Публичный (без admin-auth) эндпоинт: отдаёт рекламу для одного ad slot на BARJOK.
 * Возвращает готовую ссылку с UTM + bjclid, и IDs кампании/креатива — фронт передаёт
 * их обратно в /api/ads-track при impression/click (фаза tracking).
 *
 * ВАЖНО (§18, §29, §91): принимает только city/utility/outageStatus/placement/device —
 * НИКОГДА точный адрес пользователя.
 */
const crypto = require('crypto');
const { selectAd, buildUtm, appendUtmToUrl } = require('./_lib/ads-engine');
const { originOk, getOrSetVisitorId, getOrSetSessionId } = require('./_lib/ads-tracking');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method' });
  if (!originOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (!process.env.SUPABASE_URL) return res.status(200).json({ ok: true, ad: null });

  const q = req.query || {};
  const placementId = String(q.placement || '');
  if (!placementId) return res.status(400).json({ ok: false, error: 'no_placement' });

  const visitorId = getOrSetVisitorId(req, res);
  getOrSetSessionId(req, res);
  const cityId = String(q.city || 'pavlodar');
  const utilityType = q.utility || undefined;
  const outageStatus = q.outage || undefined;
  const deviceType = q.device === 'mobile' || q.device === 'desktop' ? q.device : undefined;

  try {
    const result = await selectAd({
      placementId, cityId, utilityType, outageStatus, deviceType,
      pageContext: q.page || undefined, visitorId,
    });
    if (!result) return res.status(200).json({ ok: true, ad: null });

    const { campaign, creative } = result;
    const clickId = 'bjc_' + crypto.randomBytes(9).toString('base64url');
    const utm = buildUtm({ campaign, creative, cityId, utilityType, placementId, term: '{city}_{utility}' });
    let destinationUrl = null;
    if (creative.cta_enabled && creative.cta_action_type === 'website' && creative.cta_destination) {
      destinationUrl = appendUtmToUrl(creative.cta_destination, utm, clickId);
    } else if (creative.cta_enabled && creative.cta_action_type === 'phone' && creative.cta_destination) {
      destinationUrl = 'tel:' + creative.cta_destination.replace(/[^\d+]/g, '');
    } else if (creative.cta_enabled && creative.cta_action_type === 'whatsapp' && creative.cta_destination) {
      destinationUrl = 'https://wa.me/' + creative.cta_destination.replace(/[^\d]/g, '');
    } else if (creative.cta_enabled && creative.cta_action_type === 'telegram' && creative.cta_destination) {
      destinationUrl = creative.cta_destination.startsWith('http') ? creative.cta_destination : 'https://t.me/' + creative.cta_destination.replace(/^@/, '');
    }

    res.status(200).json({
      ok: true,
      ad: {
        campaignId: campaign.id,
        creativeId: creative.id,
        campaignKey: campaign.campaign_key,
        placementId, clickId,
        // контекст возвращаем обратно — фронт отправит его же в /api/ads-track без пересчёта
        ctx: { city: cityId, utility: utilityType || null, outage: outageStatus || null, device: deviceType || null },
        label: 'Реклама',
        secondaryLabel: creative.sponsor_label || 'Партнёр BARJOK',
        headline: creative.headline,
        description: creative.description || '',
        brandName: creative.brand_name || '',
        imageUrl: creative.image_url || null,
        imageType: creative.image_type,
        ctaEnabled: !!creative.cta_enabled,
        ctaText: creative.cta_text || 'Узнать подробнее',
        destinationUrl,
      },
    });
  } catch (e) {
    console.error('ads-select failed:', e.message);
    res.status(200).json({ ok: true, ad: null }); // реклама не должна ломать основной UX (§75)
  }
};
