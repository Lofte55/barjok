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

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return res.status(500).json({ ok: false, error: 'not_configured' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (b.website) return res.status(200).json({ ok: true }); // honeypot: боты заполняют — тихо игнорим

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
  // Не критично: если упало/не настроено, жалоба всё равно уйдёт в Telegram.
  const sheetUrl = process.env.SHEET_WEBHOOK_URL;
  if (sheetUrl) {
    const row = {
      ts: new Date().toISOString(),
      kind: isSuggest ? 'suggestion' : 'complaint',
      category: isSuggest ? '' : (b.category || ''),
      address, message, status: 'new', lat: '', lng: '',
    };
    try {
      await fetch(sheetUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(row) });
    } catch (e) { /* таблица недоступна — не блокируем отправку в Telegram */ }
  }

  try {
    const tg = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const j = await tg.json();
    if (!j.ok) return res.status(502).json({ ok: false, error: 'telegram' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'network' });
  }
};
