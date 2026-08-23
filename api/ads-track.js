/*
 * Публичный (без admin-auth) эндпоинт: пишет ad_impression/ad_click/ad_rendered/
 * ad_dismiss в ads_events (§46). visitor_id/session_id берутся из cookie на
 * сервере — клиенту не доверяем эти значения (§48: только first-party anonymous,
 * сервер их и выдал через /api/ads-select).
 *
 * §75: трекинг не должен ронять основной UX — любая ошибка тут просто теряет
 * событие аналитики, но никогда не возвращает ошибку, которая сломала бы страницу.
 */
const { insert } = require('./_lib/supabase');
const { originOk, readCookie, looksLikeBot } = require('./_lib/ads-tracking');
const { ipHash, rateLimit } = require('./_lib/security');

const ALLOWED_EVENTS = new Set(['ad_eligible', 'ad_rendered', 'ad_impression', 'ad_click', 'ad_dismiss']);

// Трекинг по природе частый (рендер+показ+клик на каждую карточку), поэтому окно
// щедрое — задача не «резать живых», а не дать накрутить показы/клики скриптом:
// от этих чисел зависят frequency cap, лимиты кампании и отчёт рекламодателю.
const TRACK_LIMITS = [
  { max: 60, windowMs: 60 * 1000 },
  { max: 600, windowMs: 60 * 60 * 1000 },
];

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  if (!originOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
  if (!process.env.SUPABASE_URL) return res.status(200).json({ ok: true });

  // Превышение НЕ отдаём ошибкой (§75: трекинг не должен ломать UX) — просто
  // молча не пишем событие, как и при любом другом сбое трекинга.
  if (!rateLimit('ads-track', ipHash(req), TRACK_LIMITS).ok) return res.status(200).json({ ok: true });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};

  const eventType = String(b.event_type || '');
  if (!ALLOWED_EVENTS.has(eventType)) return res.status(400).json({ ok: false, error: 'bad_event_type' });
  if (!b.campaignId) return res.status(400).json({ ok: false, error: 'no_campaign' });

  const visitorId = readCookie(req, 'bj_ad_visitor');
  const sessionId = readCookie(req, 'bj_ad_session');
  // Нет visitor cookie — значит запрос пришёл не после /api/ads-select (не должно
  // случаться при нормальном использовании фронта); тихо принимаем, но помечаем
  // невалидным, чтобы не портить frequency cap/limits реальными данными.
  const valid = !!visitorId && !looksLikeBot(req);

  try {
    await insert('ads_events', {
      event_type: eventType,
      campaign_id: Number(b.campaignId),
      creative_id: b.creativeId ? Number(b.creativeId) : null,
      placement_id: b.placementId || null,
      city_id: b.city || null,
      utility_type: b.utility || null,
      outage_context: b.outage || null,
      device_type: b.device || null,
      visitor_id: visitorId,
      session_id: sessionId,
      click_id: eventType === 'ad_click' ? (b.clickId || null) : null,
      valid,
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('ads-track insert failed:', e.message);
    res.status(200).json({ ok: true }); // трекинг не критичен — не показываем ошибку фронту
  }
};
