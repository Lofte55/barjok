/*
 * Простая Basic Auth для /admin — единственный пользователь (владелец), пароль
 * задаётся в env ADMIN_PASSWORD (Vercel → Settings → Environment Variables).
 * Логин фиксированный ("admin"), т.к. пользователь один. Браузер сам показывает
 * системный диалог входа и запоминает пароль на сессию — без своей формы/куки.
 */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function requireAdmin(req, res) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    res.status(500).json({ ok: false, error: 'admin_not_configured' });
    return false;
  }
  const hdr = req.headers.authorization || '';
  const m = /^Basic\s+(.+)$/.exec(hdr);
  let ok = false;
  if (m) {
    try {
      const decoded = Buffer.from(m[1], 'base64').toString('utf8');
      const idx = decoded.indexOf(':');
      const pass = idx >= 0 ? decoded.slice(idx + 1) : '';
      ok = timingSafeEqual(pass, expected);
    } catch (e) { ok = false; }
  }
  if (!ok) {
    res.setHeader('WWW-Authenticate', 'Basic realm="BARJOK admin"');
    res.status(401).send('Auth required');
    return false;
  }
  return true;
}

module.exports = { requireAdmin };
