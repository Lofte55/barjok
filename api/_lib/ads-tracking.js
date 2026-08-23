/*
 * Общие хелперы для ads-select.js и ads-track.js — visitor/session cookie,
 * origin-check, простой bot-filter (§48, §50 документа).
 */
const crypto = require('crypto');
// originOk живёт в _lib/security.js — раньше он был скопирован сюда и в report.js,
// и в обеих копиях был один и тот же баг (разрешался любой чужой *.vercel.app).
const { originOk } = require('./security');

function readCookie(req, name) {
  const cookies = String(req.headers.cookie || '');
  const m = new RegExp(`(?:^|;\\s*)${name}=([a-f0-9-]{36})`).exec(cookies);
  return m ? m[1] : null;
}

// Постоянный anonymous visitor_id (§48) — НЕ email/телефон, переживает визиты.
function getOrSetVisitorId(req, res) {
  const existing = readCookie(req, 'bj_ad_visitor');
  if (existing) return existing;
  const id = crypto.randomUUID();
  res.setHeader('Set-Cookie', [
    `bj_ad_visitor=${id}; Path=/; Max-Age=63072000; SameSite=Lax; Secure; HttpOnly`,
  ]);
  return id;
}

// session_id — сессионная кука (без Max-Age = живёт до закрытия вкладки браузером).
function getOrSetSessionId(req, res) {
  const existing = readCookie(req, 'bj_ad_session');
  if (existing) return existing;
  const id = crypto.randomUUID();
  const prev = res.getHeader('Set-Cookie');
  const cookieStr = `bj_ad_session=${id}; Path=/; SameSite=Lax; Secure; HttpOnly`;
  res.setHeader('Set-Cookie', prev ? [].concat(prev, cookieStr) : cookieStr);
  return id;
}

// §50: минимальный bot-filter по User-Agent — известные краулеры/боты.
const BOT_UA = /bot|crawl|spider|slurp|headless|phantom|curl|wget|python-requests|scrapy/i;
function looksLikeBot(req) {
  const ua = String(req.headers['user-agent'] || '');
  if (!ua) return true; // нет UA вообще — подозрительно
  return BOT_UA.test(ua);
}

module.exports = { originOk, readCookie, getOrSetVisitorId, getOrSetSessionId, looksLikeBot };
