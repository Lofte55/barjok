/*
 * Приём жалоб/предложений с карты → Telegram.
 * Токен и чат берутся ТОЛЬКО из env-переменных Vercel (в репозиторий не коммитим):
 *   TELEGRAM_BOT_TOKEN — токен бота (@BotFather)
 *   TELEGRAM_CHAT_ID   — id чата/канала/пользователя, куда слать (бот должен иметь доступ)
 * Задать: Vercel → Project → Settings → Environment Variables → Redeploy.
 */
const CATS = {
  hot_water: 'Нет горячей воды',
  cold_water: 'Нет холодной воды',
  electricity: 'Нет электричества',
  water_light: 'Нет воды и света',
  heating: 'Нет тепла',
  gas: 'Нет газа',
};
const esc = (s) => String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));

// Разрешённые источники запроса — только наш сайт (защита от чужих форм/спама).
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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  // отсекаем запросы не с нашего сайта (curl/боты без Origin тоже отсекаются)
  if (!originOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return res.status(500).json({ ok: false, error: 'not_configured' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (b.website) return res.status(200).json({ ok: true }); // honeypot: боты заполняют — тихо игнорим
  // жёсткий лимит размера полей — защита от гигантских payload'ов
  if (JSON.stringify(b).length > 8000) return res.status(413).json({ ok: false, error: 'too_large' });

  const isSuggest = b.kind === 'suggestion';
  const kind = isSuggest ? 'Предложение' : 'Жалоба';
  const message = String(b.message || '').trim().slice(0, 1500);
  const address = String(b.address || '').trim().slice(0, 200);
  const category = isSuggest ? '' : (CATS[b.category] || '');

  // минимальная валидация: жалоба требует категорию, предложение — текст
  if (!isSuggest && !category) return res.status(400).json({ ok: false, error: 'no_category' });
  if (isSuggest && !message) return res.status(400).json({ ok: false, error: 'no_message' });

  const lines = [
    `<b>${kind}</b> · Бар Жоқ`,
    category ? `Проблема: <b>${esc(category)}</b>` : '',
    address ? `Адрес: ${esc(address)}` : '',
    message ? `\n${esc(message)}` : '',
  ].filter(Boolean);

  // Дописываем строку в Google-таблицу (Apps Script webhook) — модерация + слой на карте.
  // Не критично для пользователя: если упало, жалоба всё равно уйдёт в Telegram —
  // но ошибку ЛОГИРУЕМ (видно в Vercel → Deployments → Functions → Logs), иначе
  // проблема невидима месяцами (именно так таблица не наполнялась).
  const sheetUrl = process.env.SHEET_WEBHOOK_URL;
  if (sheetUrl) {
    const row = {
      ts: new Date().toISOString(),
      kind: isSuggest ? 'suggestion' : 'complaint',
      category: isSuggest ? '' : (b.category || ''),
      address, message, status: 'new', lat: '', lng: '',
    };
    try {
      const body = JSON.stringify(row);
      const headers = { 'content-type': 'application/json' };
      // ⚠️ Apps Script Web App отвечает на POST 302-редиректом на script.googleusercontent.com.
      // fetch может конвертировать POST→GET на 301/302 и ТЕРЯЕТ тело запроса — doPost() у Apps
      // Script тогда не получает данных и строка в таблицу не пишется, хотя запрос "успешен".
      // Обрабатываем редирект вручную, повторяя POST на конечный URL.
      let r = await fetch(sheetUrl, { method: 'POST', headers, body, redirect: 'manual' });
      if (r.status >= 300 && r.status < 400) {
        const loc = r.headers.get('location');
        if (loc) r = await fetch(loc, { method: 'POST', headers, body, redirect: 'follow' });
      }
      const text = await r.text().catch(() => '');
      if (!r.ok) console.error('sheet webhook non-2xx:', r.status, text.slice(0, 300));
      else console.log('sheet webhook ok:', text.slice(0, 200));
    } catch (e) { console.error('sheet webhook failed:', e.message); }
  }

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const j = await tg.json();
    if (!j.ok) return res.status(502).json({ ok: false, error: 'telegram', detail: j.description || null });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'network' });
  }
};
