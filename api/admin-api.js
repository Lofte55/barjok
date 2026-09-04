/*
 * Слияние admin-data.js (GET) + admin-action.js (POST) в один serverless
 * function — Vercel Hobby plan лимит 12 функций на деплой.
 */
const { requireAdmin } = require('./_lib/auth');
const { select, insert, update, remove } = require('./_lib/supabase');
// endOfDayPavlodar — каноническое определение теперь в decision-engine.js
// (нужно и там для автоподтверждённых COMMUNITY-инцидентов), сюда просто
// импортируем, чтобы не держать вторую копию.
const { evaluate, sweepExpiredOverrides, endOfDayPavlodar } = require('./_lib/decision-engine');

const UTILITIES = new Set(['hot_water', 'cold_water', 'water', 'electricity', 'heating', 'gas']);

async function log(incidentId, eventType, detail) {
  try {
    await insert('incident_log', { incident_id: incidentId, event_type: eventType, detail: detail || null });
  } catch (e) { console.error('incident_log insert failed:', e.message); }
}

const CAT_UTILITIES = {
  hot_water: ['hot_water'], cold_water: ['cold_water'], electricity: ['electricity'],
  heating: ['heating'], gas: ['gas'], water_light: ['cold_water', 'electricity'],
  water: ['water'],
  'нет горячей воды': ['hot_water'], 'нет холодной воды': ['cold_water'],
  'нет электричества': ['electricity'], 'нет тепла': ['heating'], 'нет газа': ['gas'],
  'нет воды и света': ['cold_water', 'electricity'], 'нет воды': ['water'],
};
const KEYWORDS = [
  [/гор[яа]ч/i, 'hot_water'], [/холод/i, 'cold_water'],
  [/электр|свет/i, 'electricity'], [/тепл|отоплен/i, 'heating'], [/газ/i, 'gas'],
];
const clean = (s, max = 200) => String(s || '').replace(/<[^>]*>/g, ' ').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);

async function importFromSheet(feedUrl) {
  const r = await fetch(feedUrl, { headers: { 'User-Agent': 'BarJoqAdmin/1.0' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = JSON.parse((await r.text()).trim());
  const rows = Array.isArray(j) ? j : (j.rows || []);

  let createdActive = 0, createdRestored = 0, skipped = 0;
  for (const o of rows) {
    if (String(o.status || '').trim().toLowerCase() !== 'approved') { skipped++; continue; }
    const address = clean(o.address, 200);
    const ts = Date.parse(o.ts) || undefined;
    const isSuggestion = String(o.kind || '').trim() === 'suggestion';

    if (isSuggestion) {
      if (!address) { skipped++; continue; }
      const resources = KEYWORDS.filter(([re]) => re.test(o.message || '')).map(([, res]) => res);
      const list = resources.length ? resources : ['hot_water', 'cold_water', 'water', 'electricity', 'heating', 'gas'];
      for (const utility_type of list) {
        const existing = await select('incidents',
          `address=eq.${encodeURIComponent(address)}&utility_type=eq.${utility_type}&status=eq.ACTIVE&limit=1`);
        const now = (ts ? new Date(ts) : new Date()).toISOString();
        if (existing && existing.length) {
          await update('incidents', `id=eq.${existing[0].id}`, { status: 'RESTORED', restored_at: now, updated_at: now });
          await log(existing[0].id, 'IMPORTED_RESTORED', { source: 'sheet' });
        } else {
          const [created] = await insert('incidents', {
            address, utility_type, status: 'RESTORED', confirmation_type: 'MANUAL',
            restored_at: now, created_at: now, updated_at: now,
          });
          await log(created.id, 'IMPORTED_RESTORED', { source: 'sheet' });
        }
        createdRestored++;
      }
      continue;
    }

    const utilities = CAT_UTILITIES[String(o.category || '').trim().toLowerCase()];
    if (!utilities || !address) { skipped++; continue; }
    for (const utility_type of utilities) {
      const existing = await select('incidents',
        `address=eq.${encodeURIComponent(address)}&utility_type=eq.${utility_type}&status=eq.ACTIVE&limit=1`);
      if (existing && existing.length) { skipped++; continue; }
      const now = (ts ? new Date(ts) : new Date()).toISOString();
      const [created] = await insert('incidents', {
        address, utility_type, status: 'ACTIVE', confirmation_type: 'MANUAL',
        manual_override_reason: clean(o.message, 200) || null,
        first_reported_at: now, confirmed_at: now, created_at: now, updated_at: now,
      });
      await log(created.id, 'IMPORTED_ACTIVE', { source: 'sheet' });
      createdActive++;
    }
  }
  return { createdActive, createdRestored, skipped, total: rows.length };
}

/*
 * "Новые" — жалобы жителей (user_reports), которые ЕЩЁ не набрали порог
 * автоподтверждения Decision Engine (CONFIG.outageThreshold = 3 уникальных
 * голоса, см. decision-engine.js) и поэтому НИКОГДА не попадали в incidents —
 * раньше админка их вообще не видела (баг "новые жалобы не показываются":
 * не баг отображения, а полное отсутствие источника данных в GET-ответе).
 * Группируем по address+utility_type, считаем уникальных actor_key, и
 * исключаем те, что уже стали ACTIVE incident (иначе дублировались бы со
 * строкой ниже).
 */
const PENDING_WINDOW_DAYS = 14;
const pendingSince = () => new Date(Date.now() - PENDING_WINDOW_DAYS * 86400000).toISOString();

/* Фильтр «одна строка pending-списка» — ОДИН источник правды для чтения (loadPendingReports)
 * и для отклонения (reject_pending). Держать их синхронными обязательно: если отклонение
 * бьёт шире, чем показ, админ гасит голоса, которых не видел (в т.ч. RESTORED — а их
 * считает decision-engine.js:currentVotes, чтобы снять отключение). */
const pendingFilter = (address, utility_type) =>
  `address=eq.${encodeURIComponent(address)}&utility_type=eq.${utility_type}` +
  `&status=eq.VALID&reported_state=eq.OUTAGE&reported_at=gte.${pendingSince()}`;

/*
 * Голоса, которые РЕАЛЬНО зачтёт Decision Engine.
 * ⚠️ Должно совпадать с MAX_ACTORS_PER_IP_OUTAGE в decision-engine.js: раньше админка
 * считала сырые actor_key и показывала «3 голоса» там, где движок видел 2 — владелец
 * ждал автоподтверждения, которое не могло наступить. Рядом отдаём raw_votes, чтобы
 * расхождение было видно, а не выглядело ошибкой счёта.
 */
const MAX_ACTORS_PER_IP_OUTAGE = 2;
function countableVotes(actors) {
  const perIp = new Map();
  let n = 0;
  for (const ip of actors.values()) {
    if (ip) {
      const used = perIp.get(ip) || 0;
      if (used >= MAX_ACTORS_PER_IP_OUTAGE) continue;
      perIp.set(ip, used + 1);
    }
    n++;
  }
  return n;
}

/*
 * ⚠️⚠️ БАГ (найден на живом кейсе): «Подтвердить» → «Восстановлено» → тут же
 * снова всплывает «Новая» заявка по ТОМУ ЖЕ адресу — хотя ничего нового не
 * происходило. Причина: раньше suppression строился только по ACTIVE-инцидентам
 * (`activeKeys`), а RESTORED вообще не учитывался — как только incident переходил
 * в RESTORED, старые жалобы (те же самые, из-за которых incident и подтверждали),
 * которые всё ещё лежат в user_reports как VALID/OUTAGE в пределах 14-дневного
 * окна, тут же «воскресали» в списке «Новая», хотя администратор их уже обработал.
 *
 * Фикс — та же cutoff-логика, что decision-engine.js:evaluate() уже применяет для
 * автоподтверждения (§20 документа: «после RESTORED считаются только голоса ПОСЛЕ
 * restored_at»): для каждого address+utility_type берём САМЫЙ СВЕЖИЙ incident
 * (любого статуса, не только ACTIVE) и режем по нему —
 *   ACTIVE   → подавляем ВСЕ жалобы по ключу (уже подтверждено, нечего утверждать);
 *   RESTORED → подавляем жалобы СТАРШЕ restored_at (уже учтены), но НЕ подавляем
 *              жалобы, пришедшие ПОСЛЕ восстановления — это законно новая проблема.
 */
async function loadPendingReports(incidents) {
  const latestByKey = new Map();
  for (const inc of incidents || []) {
    const key = inc.address + '|' + inc.utility_type;
    const cur = latestByKey.get(key);
    if (!cur || new Date(inc.updated_at) > new Date(cur.updated_at)) latestByKey.set(key, inc);
  }
  const reports = await select('user_reports',
    `status=eq.VALID&reported_state=eq.OUTAGE&reported_at=gte.${pendingSince()}&order=reported_at.desc&limit=1000` +
    '&select=address,utility_type,actor_key,ip_hash,reported_at,message');
  const groups = new Map();   // «Новая» — подтверждать нечего, incident'а ещё нет
  const fresh = new Map();    // ⚠️ жалобы ПОСЛЕ подтверждения — см. ниже
  const bump = (map, key, r) => {
    if (!map.has(key)) map.set(key, { address: r.address, utility_type: r.utility_type, actors: new Map(), latest: r.reported_at, message: null });
    const g = map.get(key);
    if (!g.actors.has(r.actor_key)) g.actors.set(r.actor_key, r.ip_hash || null);
    if (r.reported_at > g.latest) g.latest = r.reported_at;
    if (!g.message && r.message) g.message = r.message;
  };
  for (const r of reports || []) {
    const key = r.address + '|' + r.utility_type;
    const inc = latestByKey.get(key);
    if (inc) {
      // ⚠️ РАНЬШЕ здесь стоял `if (inc.status === 'ACTIVE') continue;` — и все
      // повторные жалобы по уже подтверждённому адресу пропадали из админки
      // бесследно. Живой кейс владельца: отключение подтверждено вчера, сегодня
      // люди жалуются снова (не починили), а в списке пусто — строка висит внизу
      // со вчерашней датой подтверждения, как будто ничего не происходит.
      // Теперь такие жалобы НЕ выбрасываем, а собираем отдельно: админка
      // покажет их на строке инцидента и поднимет её наверх (см. api/admin.js).
      if (inc.status === 'ACTIVE') {
        const since = inc.confirmed_at || inc.created_at;
        if (!since || r.reported_at > since) bump(fresh, key, r);
        continue;
      }
      if (inc.status === 'RESTORED' && r.reported_at <= inc.restored_at) continue; // уже учтено при восстановлении
    }
    bump(groups, key, r);
  }
  const shape = (g) => ({
    address: g.address,
    utility_type: g.utility_type,
    votes: countableVotes(g.actors),
    raw_votes: g.actors.size,
    latest_report_at: g.latest,
    message: g.message,
  });
  const byLatest = (a, b) => (a.latest_report_at < b.latest_report_at ? 1 : -1);
  return {
    pending: Array.from(groups.values()).map(shape).sort(byLatest),
    fresh: Array.from(fresh.values()).map(shape).sort(byLatest),
  };
}

async function handleGet(req, res) {
  // Автовосстановление по сроку — админка тоже должна видеть свежий статус
  // (не только карта/лендинг через live-incidents.js), иначе строка висела бы
  // "Отключено" ещё до минуты на следующий автообновляемый load().
  try { await sweepExpiredOverrides(); } catch (e) { console.error('sweepExpiredOverrides failed:', e.message); }
  const incidents = await select('incidents', 'order=updated_at.desc&limit=200');
  // pending — жалобы, которые ещё нечего подтверждать; fresh — жалобы, пришедшие
  // ПОСЛЕ подтверждения (значит, не починили) — админка вешает их на строку
  // инцидента и поднимает её наверх.
  const { pending, fresh } = await loadPendingReports(incidents);
  // Предложения (вкладка "Предложение" формы "Уведомление BARJOK") — раньше
  // уходили только в Telegram, теперь видны и здесь. NEW+DONE вместе (DONE —
  // для истории, как ACTIVE/RESTORED у incidents), таблицы suggestions может
  // не быть на старых деплоях без миграции — best-effort, не роняем страницу.
  let suggestions = [];
  try { suggestions = await select('suggestions', 'order=created_at.desc&limit=200'); }
  catch (e) { console.error('suggestions select failed:', e.message); }
  res.status(200).json({ ok: true, incidents, pending, fresh, suggestions });
}

async function handlePost(req, res) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const action = String(b.action || '');

  if (action === 'force_outage') {
    const address = String(b.address || '').trim().slice(0, 200);
    const utility_type = String(b.utility_type || '');
    const reason = String(b.reason || '').trim().slice(0, 300) || null;
    if (!address || !UTILITIES.has(utility_type)) return res.status(400).json({ ok: false, error: 'bad_input' });
    // Срок автовосстановления: "без даты" (0/отсутствует) — висит, пока админ не
    // снимет вручную (старое поведение); "eod" — до 00:00 по Павлодару (см.
    // endOfDayPavlodar); 1 или 5 — через столько дней; "custom" — своё число часов/
    // дней (админ точно знает срок, напр. "на 8 часов отключили свет"). В любом
    // случае sweepExpiredOverrides() (decision-engine.js, вызывается на каждый
    // живой запрос) сам переведёт в RESTORED и вернёт адрес под автоматику.
    const rawDuration = String(b.duration_days || '0');
    const isEndOfDay = rawDuration === 'eod';
    const isCustom = rawDuration === 'custom';
    const durationDays = !isEndOfDay && !isCustom && [1, 5].includes(Number(rawDuration)) ? Number(rawDuration) : 0;
    // ⚠️ Своё значение — единственное место здесь, где число реально приходит от
    // клиента, а не выбирается из фиксированного списка кнопок. Валидируем: целое,
    // положительное, единица measure — только hours/days (иначе часы по умолчанию),
    // и жёсткий потолок 90 дней — страховка от опечатки/абсурдного ввода, который
    // повесил бы "отключение" на публичной карте на годы вперёд.
    const customUnit = b.duration_custom_unit === 'days' ? 'days' : 'hours';
    const customValRaw = Math.floor(Number(b.duration_custom_value));
    const customHours = isCustom && Number.isFinite(customValRaw) && customValRaw > 0
      ? Math.min(customUnit === 'days' ? customValRaw * 24 : customValRaw, 90 * 24)
      : 0;
    const now = new Date().toISOString();
    const manualOverrideUntil = isEndOfDay ? endOfDayPavlodar()
      : isCustom ? (customHours ? new Date(Date.now() + customHours * 3600000).toISOString() : null)
      : durationDays ? new Date(Date.now() + durationDays * 86400000).toISOString() : null;

    // ⚠️ Если подтверждают cold_water/hot_water, а ПРОТИВОПОЛОЖНЫЙ ресурс уже
    // активен по тому же адресу — воды нет вообще, а не «только холодная/только
    // горячая». Та же логика, что в parser/index.js:mergeWaterOutages и
    // map/app.js:applyLiveLayer (там — только отображение; здесь — по-настоящему
    // сливаем записи в БД, иначе в админке висели бы два отдельных активных
    // инцидента вместо одного water). Обе старые записи переводим в RESTORED
    // ("замещены") и пишем/обновляем единый water.
    let effectiveUtility = utility_type;
    const supersededIds = [];
    if (utility_type === 'cold_water' || utility_type === 'hot_water') {
      const opposite = utility_type === 'cold_water' ? 'hot_water' : 'cold_water';
      const oppositeActive = await select('incidents',
        `address=eq.${encodeURIComponent(address)}&utility_type=eq.${opposite}&status=eq.ACTIVE&limit=1`);
      if (oppositeActive && oppositeActive.length) {
        effectiveUtility = 'water';
        supersededIds.push(oppositeActive[0].id);
        const sameActive = await select('incidents',
          `address=eq.${encodeURIComponent(address)}&utility_type=eq.${utility_type}&status=eq.ACTIVE&limit=1`);
        if (sameActive && sameActive.length) supersededIds.push(sameActive[0].id);
      }
    }

    const existing = await select('incidents',
      `address=eq.${encodeURIComponent(address)}&utility_type=eq.${effectiveUtility}&status=eq.ACTIVE&limit=1`);
    let incident;
    if (existing && existing.length) {
      [incident] = await update('incidents', `id=eq.${existing[0].id}`, {
        manual_override: 'FORCE_OUTAGE', manual_override_reason: reason, manual_override_created_at: now,
        manual_override_until: manualOverrideUntil, updated_at: now,
      });
    } else {
      [incident] = await insert('incidents', {
        address, utility_type: effectiveUtility, status: 'ACTIVE', confirmation_type: 'MANUAL',
        manual_override: 'FORCE_OUTAGE', manual_override_reason: reason, manual_override_created_at: now,
        manual_override_until: manualOverrideUntil,
        first_reported_at: now, confirmed_at: now,
      });
    }
    for (const supId of supersededIds) {
      await update('incidents', `id=eq.${supId}`, { status: 'RESTORED', restored_at: now, updated_at: now });
      await log(supId, 'MERGED_INTO_WATER', { merged_into: incident.id });
    }
    await log(incident.id, 'MANUAL_FORCE_OUTAGE', {
      reason,
      duration_days: isEndOfDay ? 'eod' : isCustom ? `custom:${customValRaw}${customUnit}` : (durationDays || null),
      merged_from: supersededIds.length ? supersededIds : null,
    });
    return res.status(200).json({ ok: true, incident });
  }

  if (action === 'force_restored') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    const now = new Date().toISOString();
    const [incident] = await update('incidents', `id=eq.${id}`, {
      status: 'RESTORED', manual_override: 'FORCE_RESTORED', manual_override_created_at: now, restored_at: now, updated_at: now,
    });
    await log(id, 'MANUAL_FORCE_RESTORED', {});
    return res.status(200).json({ ok: true, incident });
  }

  if (action === 'clear_override') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    const now = new Date().toISOString();
    const [before] = await select('incidents', `id=eq.${id}&limit=1`);
    await update('incidents', `id=eq.${id}`, { manual_override: 'NONE', manual_override_reason: null, manual_override_until: null, updated_at: now });
    await log(id, 'MANUAL_OVERRIDE_CLEARED', {});
    const incident = before ? await evaluate(before.address, before.utility_type) : null;
    return res.status(200).json({ ok: true, incident });
  }

  if (action === 'delete') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    await remove('incidents', `id=eq.${id}`);
    return res.status(200).json({ ok: true });
  }

  if (action === 'done_suggestion') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    await update('suggestions', `id=eq.${id}`, { status: 'DONE' });
    return res.status(200).json({ ok: true });
  }

  if (action === 'delete_suggestion') {
    const id = Number(b.id);
    if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
    await remove('suggestions', `id=eq.${id}`);
    return res.status(200).json({ ok: true });
  }

  if (action === 'reject_pending') {
    const address = String(b.address || '').trim().slice(0, 200);
    const utility_type = String(b.utility_type || '');
    if (!address || !UTILITIES.has(utility_type)) return res.status(400).json({ ok: false, error: 'bad_input' });
    // ⚠️ Только то, что реально показано в pending-строке (см. pendingFilter):
    // без reported_state/окна отклонение задело бы и голоса «Уже появилось» (RESTORED),
    // и жалобы старше окна — админ бы погасил то, чего не видел.
    await update('user_reports', pendingFilter(address, utility_type), { status: 'REJECTED' });
    return res.status(200).json({ ok: true });
  }

  if (action === 'import_sheet') {
    const feedUrl = String(b.feed_url || '').trim();
    if (!feedUrl) return res.status(400).json({ ok: false, error: 'bad_input' });
    const result = await importFromSheet(feedUrl);
    return res.status(200).json({ ok: true, ...result });
  }

  return res.status(400).json({ ok: false, error: 'unknown_action' });
}

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === 'GET') return await handleGet(req, res);
    if (req.method === 'POST') return await handlePost(req, res);
    return res.status(405).json({ ok: false, error: 'method' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
