/*
 * Общий слой защиты публичных эндпоинтов (/api/report, /api/ads-track, /api/ads-select).
 *
 * ЧТО ЭТО НЕ ДЕЛАЕТ (важно понимать границы, чтобы не считать защиту сильнее, чем она есть):
 *   - Origin/Referer — заголовки, которые ОБЯЗАН слать браузер, но любой скрипт
 *     (curl/python) ставит их произвольно. Это защита от чужих ФОРМ на других
 *     сайтах (CSRF-подобное), а НЕ от ботов. От ботов работает rate-limit ниже.
 *   - rate-limit в памяти живёт в пределах одного тёплого инстанса лямбды. Vercel
 *     держит инстансы горячими и переиспользует, поэтому это реальный тормоз для
 *     потока с одного адреса, но НЕ гарантия. Durable-слой (по БД) — только там,
 *     где мы и так пишем в Supabase (см. dbCountRecent).
 */
const crypto = require('crypto');

/* ---------- Origin ---------- */

/*
 * ⚠️ РАНЬШЕ ЗДЕСЬ БЫЛА ДЫРА: разрешался ЛЮБОЙ *.vercel.app. Любой человек
 * деплоит свою страницу на vercel.app и постит к нам с неё — origin-проверка
 * не значила ничего. Теперь список закрытый:
 *   - прод-домены (константа ниже),
 *   - собственный URL текущего деплоя (VERCEL_URL) — чтобы preview-деплои
 *     проекта продолжали работать, но ЧУЖИЕ vercel.app — нет,
 *   - плюс ALLOWED_ORIGINS из env (через запятую), если понадобится вручную.
 */
const PROD_ORIGINS = ['https://barjok.kz', 'https://www.barjok.kz', 'https://barjok.vercel.app'];

function allowedOrigins() {
  const list = [...PROD_ORIGINS];
  if (process.env.VERCEL_URL) list.push(`https://${process.env.VERCEL_URL}`);
  const extra = String(process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return list.concat(extra);
}

function originOk(req) {
  const allow = allowedOrigins();
  const h = req.headers || {};

  /*
   * Sec-Fetch-Site проверяем ПЕРВЫМ. Это «запрещённое имя заголовка»: его ставит сам
   * браузер, и никакой fetch()/XHR его подделать не может — сигнал строже, чем Referer.
   *
   * ⚠️ Зачем это нужно: у GET-запросов браузер НЕ шлёт Origin (только для не-GET/HEAD).
   * Поэтому проверка GET-эндпоинта (/api/ads-select) падала на Referer, а его вырезают
   * Brave, uBlock и режимы приватности — такие пользователи получали 403 на ровном месте,
   * при том что от реального бота Referer не защищает (это один флаг curl).
   */
  const sfs = String(h['sec-fetch-site'] || '');
  if (sfs) return sfs === 'same-origin' || sfs === 'same-site';

  const o = h.origin || '';
  if (o) return allow.includes(o);
  // Origin шлют не все клиенты (например, form-post из старых браузеров) — тогда Referer.
  const ref = h.referer || '';
  if (!ref) return false;
  try {
    const u = new URL(ref);
    return allow.includes(`${u.protocol}//${u.host}`);
  } catch (e) { return false; }
}

/* ---------- IP ---------- */

/*
 * Определение IP клиента.
 *
 * ⚠️⚠️ КРИТИЧНО, ПОЧЕМУ НЕ `x-forwarded-for[0]`: XFF — это ЦЕПОЧКА, куда прокси
 * ДОПИСЫВАЮТ адреса. Если клиент сам пришлёт `X-Forwarded-For: 1.2.3.4`, а edge
 * допишет реальный адрес в конец, то первый элемент — ЗНАЧЕНИЕ, ВЫБРАННОЕ АТАКУЮЩИМ.
 * На этом ключе построены и rate-limit, и потолок голосов на IP: подставляя каждый
 * раз новый «IP», атакующий обходил бы и то, и другое полностью.
 *
 * Поэтому порядок такой:
 *   1) x-vercel-forwarded-for / x-real-ip — их проставляет инфраструктура Vercel,
 *      клиентские одноимённые заголовки она перезаписывает;
 *   2) ПОСЛЕДНИЙ элемент XFF — ближайший к нашему прокси, т.е. тот, что дописал он,
 *      а не тот, что придумал клиент;
 *   3) адрес сокета.
 */
function clientIp(req) {
  const h = req.headers || {};
  const direct = String(h['x-vercel-forwarded-for'] || h['x-real-ip'] || '').trim();
  if (direct) return direct.split(',').pop().trim();
  const xff = String(h['x-forwarded-for'] || '').trim();
  if (xff) return xff.split(',').pop().trim();
  return req.socket?.remoteAddress || '';
}

// Хэш IP — сам IP нигде не храним и не логируем (персональные данные).
// Соль из env: без неё хэш от узкого множества IPv4 обратим перебором.
function ipHash(req) {
  const ip = clientIp(req);
  if (!ip) return null;
  return crypto.createHash('sha256')
    .update(ip + (process.env.IP_HASH_SALT || 'barjok'))
    .digest('hex').slice(0, 32);
}

/* ---------- Rate limit (in-memory, per-instance) ---------- */

const buckets = new Map();        // key -> number[] (таймстемпы)
const MAX_KEYS = 5000;            // потолок против роста памяти на длинной лямбде

/*
 * ⚠️ Вытесняем САМЫЕ СТАРЫЕ ключи, а не чистим всю карту.
 * `buckets.clear()` был бы дырой: атакующий намеренно переполняет карту мусорными
 * ключами и этим ОБНУЛЯЕТ счётчик самому себе (и всем остальным). Map хранит порядок
 * вставки, поэтому первые ключи — самые давно не обновлявшиеся.
 */
function evictIfNeeded() {
  if (buckets.size <= MAX_KEYS) return;
  const drop = buckets.size - MAX_KEYS;
  let n = 0;
  for (const k of buckets.keys()) { buckets.delete(k); if (++n >= drop) break; }
}

function hit(key, max, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  buckets.delete(key);            // delete+set = ключ уезжает в конец очереди вытеснения

  // ⚠️ Уже за лимитом — НЕ дописываем метку. Иначе массированный флуд рос бы в памяти
  // без предела (окно час × сотни rps = миллионы чисел в одном ключе) и каждый запрос
  // фильтровал бы этот массив — лимитер жёг бы ресурсы ровно на том трафике,
  // ради которого он и стоит.
  if (arr.length >= max) {
    buckets.set(key, arr);
    evictIfNeeded();
    // Ждать нужно до истечения САМОЙ СТАРОЙ метки в окне, а не целое окно.
    const waitMs = Math.max(0, windowMs - (now - arr[0]));
    return { ok: false, count: arr.length, retryAfterSec: Math.max(1, Math.ceil(waitMs / 1000)) };
  }

  arr.push(now);
  buckets.set(key, arr);
  evictIfNeeded();
  return { ok: true, count: arr.length, retryAfterSec: 0 };
}

/*
 * Проверяет несколько окон сразу: [{max, windowMs}, ...].
 * Короткое окно ловит всплеск, длинное — «капающий» спам.
 *
 * ⚠️ `name` ОБЯЗАТЕЛЕН и разделяет эндпоинты. Без него /api/report и /api/ads-track
 * делили одно ведро (у обоих есть окно 3600000, ключ строился только из IP+окна):
 * ~25 событий трекинга рекламы за визит съедали часовую квоту жалоб, и живой человек
 * получал 429 на ПЕРВОЙ же жалобе об отключении — то есть ломалась главная функция сервиса.
 *
 * ⚠️ Пустой key НЕ означает «пропустить»: не опознали клиента — считаем по общему
 * ведру `anon`, иначе достаточно было прийти без опознаваемого IP, чтобы лимит не применялся.
 */
function rateLimit(name, key, windows) {
  const k = `${name}|${key || 'anon'}`;
  for (const w of windows) {
    const r = hit(`${k}|${w.windowMs}`, w.max, w.windowMs);
    if (!r.ok) return { ok: false, retryAfterSec: r.retryAfterSec };
  }
  return { ok: true };
}

function tooMany(res, retryAfterSec) {
  res.setHeader('Retry-After', String(retryAfterSec || 60));
  return res.status(429).json({ ok: false, error: 'rate_limited' });
}

module.exports = { originOk, ipHash, rateLimit, tooMany };
