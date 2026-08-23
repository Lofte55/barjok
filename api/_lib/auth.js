/*
 * Basic Auth для /admin — единственный пользователь (владелец), пароль в env
 * ADMIN_PASSWORD (Vercel → Settings → Environment Variables). Логин фиксированный
 * ("admin"), т.к. пользователь один. Браузер сам показывает системный диалог входа
 * и помнит пароль на сессию — без своей формы/куки.
 */
const crypto = require('crypto');
const { ipHash, rateLimit } = require('./security');

/*
 * Сравнение пароля.
 * ⚠️ Было самописное посимвольное сравнение с ранним `return false` при разной
 * длине — оно (а) утекало длину пароля по времени ответа, (б) в JS всё равно не
 * константное. Хэшируем оба значения в SHA-256 (всегда 32 байта) и сравниваем
 * настоящим crypto.timingSafeEqual: длина больше не наблюдаема в принципе.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/*
 * Тормоз для перебора пароля. Basic Auth сам по себе ничем не ограничен —
 * без этого пароль подбирается скриптом со скоростью сети.
 * Считаем ТОЛЬКО неудачные попытки: у владельца браузер шлёт корректный
 * заголовок на каждый запрос админки, и общий счётчик запирал бы его самого.
 */
const FAIL_LIMITS = [
  { max: 10, windowMs: 5 * 60 * 1000 },
  { max: 40, windowMs: 60 * 60 * 1000 },
];

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
      ok = safeEqual(pass, expected);
    } catch (e) { ok = false; }
  }

  if (!ok) {
    // Штрафуем только промах — успешные запросы счётчик не трогают.
    const rl = rateLimit('admin-fail', ipHash(req), FAIL_LIMITS);
    // ⚠️ WWW-Authenticate ставим ВСЕГДА, даже на 429. Без него браузер не покажет
    // диалог входа — а первый запрос сессии всегда идёт БЕЗ заголовка и потому
    // считается промахом. Владелец, пришедший с общего IP (офис/коворкинг), где
    // кто-то уже сжёг лимит, не увидел бы ни формы, ни способа ввести пароль.
    res.setHeader('WWW-Authenticate', 'Basic realm="BARJOK admin"');
    if (!rl.ok) {
      res.setHeader('Retry-After', String(rl.retryAfterSec || 300));
      res.status(429).send('Too many attempts');
      return false;
    }
    res.status(401).send('Auth required');
    return false;
  }
  return true;
}

module.exports = { requireAdmin };
