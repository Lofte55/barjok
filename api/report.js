/*
 * Приём жалоб/предложений с карты → Telegram.
 * Токен и чат берутся ТОЛЬКО из env-переменных Vercel (в репозиторий не коммитим):
 *   TELEGRAM_BOT_TOKEN — токен бота (@BotFather)
 *   TELEGRAM_CHAT_ID   — id чата/канала/пользователя, куда слать (бот должен иметь доступ)
 * Задать: Vercel → Project → Settings → Environment Variables → Redeploy.
 */
const crypto = require('crypto');
const { submitReport } = require('./_lib/decision-engine');
const { originOk, ipHash, rateLimit, tooMany } = require('./_lib/security');
const { select } = require('./_lib/supabase');

const CATS = {
  hot_water: 'Нет горячей воды',
  cold_water: 'Нет холодной воды',
  water: 'Нет воды',
  electricity: 'Нет электричества',
  water_light: 'Нет воды и света',
  heating: 'Нет тепла',
  gas: 'Нет газа',
};
// water_light/water одной жалобой закрывают сразу несколько ресурсов — для
// Decision Engine это отдельный user_report на каждый utility_type.
const CAT_UTILITIES = {
  hot_water: ['hot_water'], cold_water: ['cold_water'], electricity: ['electricity'],
  heating: ['heating'], gas: ['gas'], water_light: ['cold_water', 'electricity'],
  water: ['cold_water', 'hot_water'],
};
const esc = (s) => String(s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));

// Постоянный device_id в cookie — actor_key для Decision Engine (§6 документа).
// Не auth, но лучшее, что есть без логина: переживает визиты, не переживает смену
// браузера/устройства — ровно то, что документ называет persistent_device_id.
function getOrSetDeviceId(req, res) {
  const cookies = String(req.headers.cookie || '');
  const m = /(?:^|;\s*)bj_device=([a-f0-9-]{36})/.exec(cookies);
  if (m) return m[1];
  const id = crypto.randomUUID();
  res.setHeader('Set-Cookie', `bj_device=${id}; Path=/; Max-Age=63072000; SameSite=Lax; Secure; HttpOnly`);
  return id;
}
/*
 * Лимиты на приём жалоб. Живой человек с карты шлёт одну-две жалобы за визит;
 * всё, что выше — автоматизация. Два окна: короткое ловит всплеск, часовое —
 * «капающий» спам, который в короткое окно не попадает.
 */
const REPORT_LIMITS = [
  { max: 5, windowMs: 10 * 60 * 1000 },
  { max: 20, windowMs: 60 * 60 * 1000 },
];
// Durable-потолок за сутки: память лямбды не переживает холодный старт, а
// user_reports мы и так пишем — считаем по ним, без отдельной таблицы.
const DAILY_DB_CAP = 40;

async function overDailyCap(hash) {
  if (!hash || !process.env.SUPABASE_URL) return false;
  try {
    const since = new Date(Date.now() - 86400000).toISOString();
    const rows = await select('user_reports',
      `ip_hash=eq.${hash}&reported_at=gte.${since}&select=id&limit=${DAILY_DB_CAP + 1}`);
    return (rows || []).length > DAILY_DB_CAP;
  } catch (e) {
    console.error('rate-limit db check failed:', e.message);
    return false;   // БД недоступна — не запираем живых людей
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
  // Отсекает чужие формы на других сайтах. ⚠️ НЕ защита от ботов — Origin
  // подделывается любым скриптом; от потока защищает rate-limit ниже.
  if (!originOk(req)) return res.status(403).json({ ok: false, error: 'forbidden' });

  // Лимит ДО любой работы: чтобы флуд не жёг ни Telegram, ни квоту Supabase.
  const hash = ipHash(req);
  const rl = rateLimit('report', hash, REPORT_LIMITS);
  if (!rl.ok) return tooMany(res, rl.retryAfterSec);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return res.status(500).json({ ok: false, error: 'not_configured' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (b.website) return res.status(200).json({ ok: true }); // honeypot: боты заполняют — тихо игнорим
  // жёсткий лимит размера полей — защита от гигантских payload'ов
  if (JSON.stringify(b).length > 8000) return res.status(413).json({ ok: false, error: 'too_large' });

  const isPartner = b.kind === 'partner';
  const isSuggest = b.kind === 'suggestion';
  const kind = isPartner ? 'Заявка партнёра' : (isSuggest ? 'Предложение' : 'Жалоба');
  const message = String(b.message || '').trim().slice(0, 1500);
  const address = String(b.address || '').trim().slice(0, 200);
  const category = (isSuggest || isPartner) ? '' : (CATS[b.category] || '');

  // Заявка с /partners/ — свои поля и своя валидация (см. api/_lib/partners-page.js),
  // без Decision Engine/адресной привязки: это B2B-заявка на подключение, а не
  // жалоба по конкретному дому.
  const partnerOrg = isPartner ? String(b.org || '').trim().slice(0, 200) : '';
  const partnerCity = isPartner ? String(b.city || '').trim().slice(0, 100) : '';
  const partnerName = isPartner ? String(b.name || '').trim().slice(0, 150) : '';
  const partnerPosition = isPartner ? String(b.position || '').trim().slice(0, 150) : '';
  const partnerPhone = isPartner ? String(b.phone || '').trim().slice(0, 60) : '';
  const partnerContact = isPartner ? String(b.contact || '').trim().slice(0, 150) : '';
  if (isPartner && (!partnerOrg || !partnerCity || !partnerName || !partnerPhone)) {
    return res.status(400).json({ ok: false, error: 'missing_fields' });
  }

  // минимальная валидация: жалоба требует категорию, предложение — текст
  if (!isSuggest && !isPartner && !category) return res.status(400).json({ ok: false, error: 'no_category' });
  if (isSuggest && !message) return res.status(400).json({ ok: false, error: 'no_message' });

  // Суточный durable-потолок (память лямбды не переживает холодный старт).
  if (await overDailyCap(hash)) return tooMany(res, 3600);

  // Decision Engine (только для жалоб с адресом — «предложение» не про конкретный
  // дом/ресурс). Best-effort: если Supabase не настроен или упал — жалоба всё равно
  // уходит в Telegram/таблицу ниже, пользователь не должен из-за этого получить ошибку.
  if (!isSuggest && address && process.env.SUPABASE_URL) {
    const actorKey = getOrSetDeviceId(req, res);
    const reportedState = b.state === 'restored' ? 'RESTORED' : 'OUTAGE';
    const utilities = CAT_UTILITIES[b.category] || [];
    // await, но через allSettled — сбой Decision Engine не должен ронять весь запрос
    // (лямбда может быть заморожена сразу после ответа, поэтому не fire-and-forget).
    await Promise.allSettled(utilities.map((utility_type) =>
      submitReport({ address, utility_type, reported_state: reportedState, actor_key: actorKey, ip_hash: hash, message })
    )).then((results) => results.forEach((r) => { if (r.status === 'rejected') console.error('decision-engine submitReport failed:', r.reason?.message); }));
  }

  const lines = isPartner ? [
    `<b>${kind}</b> · Бар Жоқ`,
    `Организация: <b>${esc(partnerOrg)}</b>`,
    `Город: ${esc(partnerCity)}`,
    `Контакт: ${esc(partnerName)}${partnerPosition ? ` (${esc(partnerPosition)})` : ''}`,
    `Телефон: ${esc(partnerPhone)}`,
    partnerContact ? `Email/WhatsApp: ${esc(partnerContact)}` : '',
    message ? `\n${esc(message)}` : '',
  ].filter(Boolean) : [
    `<b>${kind}</b> · Бар Жоқ`,
    category ? `Проблема: <b>${esc(category)}</b>` : '',
    address ? `Адрес: ${esc(address)}` : '',
    message ? `\n${esc(message)}` : '',
  ].filter(Boolean);

  // Дописываем строку в Google-таблицу (Apps Script webhook) — модерация + слой на карте.
  // Не критично для пользователя: если упало, жалоба всё равно уйдёт в Telegram —
  // но ошибку ЛОГИРУЕМ (видно в Vercel → Deployments → Functions → Logs), иначе
  // проблема невидима месяцами (именно так таблица не наполнялась).
  // Партнёрские заявки не пишем в таблицу модерации жалоб — это B2B-лид, а не
  // жалоба/предложение по дому, структура таблицы для него не подходит.
  const sheetUrl = isPartner ? null : process.env.SHEET_WEBHOOK_URL;
  if (sheetUrl) {
    const row = {
      ts: new Date().toISOString(),
      kind: isSuggest ? 'suggestion' : 'complaint',
      // В таблицу пишем русский текст («Нет горячей воды»), а не код (hot_water) —
      // владельцу так понятнее при модерации. citizen.js при чтении понимает оба
      // варианта (и старый код, и текст), чтобы уже одобренные строки не сломались.
      category: isSuggest ? '' : category,
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
