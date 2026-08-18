/*
 * Публичный (без admin-auth) эндпоинт: отдаёт рекламу для одного ad slot на BARJOK.
 * Фаза 3 плана (рендер) — импрессии/клики НЕ пишутся в ads_events здесь, это
 * следующая фаза (tracking). Сейчас только выбор + готовая ссылка с UTM.
 *
 * ВАЖНО (§18, §29, §91): принимает только city/utility/outageStatus/placement/device —
 * НИКОГДА точный адрес пользователя. bjclid генерируется здесь (нужен для будущего
 * tracking), но пока никуда не пишется — просто передаётся в ссылке.
 */
const crypto = require('crypto');
const { selectAd, buildUtm, appendUtmToUrl } = require('./_lib/ads-engine');

const ALLOWED = ['https://barjok.kz', 'https://www.barjok.kz', 'https://barjok.vercel.app'];
function originOk(req) {
  const o = req.headers.origin || '';
  if (o) {
    if (ALLOWED.includes(o)) return true;
    try { return /\.vercel\.app$/.test(new URL(o).hostname); } catch (e) { return false; }
  }
  const ref = req.headers.referer || '';
  return ALLOWED.some((a) => ref.startsWith(a)) || /^https:\/\/[^/]+\.vercel\.app\//.test(ref);
}

function getOrSetVisitorId(req, res) {
  const cookies = String(req.headers.cookie || '');
  const m = /(?:^|;\s*)bj_ad_visitor=([a-f0-9-]{36})/.exec(cookies);
  if (m) return m[1];
  const id = crypto.randomUUID();
  res.setHeader('Set-Cookie', `bj_ad_visitor=${id}; Path=/; Max-Age=63072000; SameSite=Lax; Secure; HttpOnly`);
  return id;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method' });
  if (!originOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (!process.env.SUPABASE_URL) return res.status(200).json({ ok: true, ad: null });

  const q = req.query || {};
  const placementId = String(q.placement || '');
  if (!placementId) return res.status(400).json({ ok: false, error: 'no_placement' });

  const visitorId = getOrSetVisitorId(req, res);
  const ctx = {
    placementId,
    cityId: String(q.city || 'pavlodar'),
    utilityType: q.utility || undefined,
    outageStatus: q.outage || undefined,
    deviceType: q.device === 'mobile' || q.device === 'desktop' ? q.device : undefined,
    pageContext: q.page || undefined,
    visitorId,
  };

  try {
    const result = await selectAd(ctx);
    if (!result) return res.status(200).json({ ok: true, ad: null });

    const { campaign, creative } = result;
    const clickId = 'bjc_' + crypto.randomBytes(9).toString('base64url');
    const utm = buildUtm({ campaign, creative, cityId: ctx.cityId, utilityType: ctx.utilityType, placementId, term: '{city}_{utility}' });
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
        campaignKey: campaign.campaign_key,
        clickId,
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
