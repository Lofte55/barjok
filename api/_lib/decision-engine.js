/*
 * BARJOK Decision Engine — MVP-версия правил из документа
 * "BARJOK — автоматическая система подтверждения отключений".
 *
 * Реализовано (раздел документа в скобках):
 *  - user_report сохраняется всегда, с actor_key (§6-8)
 *  - один актёр = один актуальный голос на building+utility (§7)
 *  - 3 уникальных голоса за rolling window = автоподтверждение, в обе стороны (§4)
 *  - окна времени per-utility из CONFIG, не зашиты в логику (§5, §46)
 *  - manual_override блокирует любые автоматические изменения статуса (§31)
 *  - после RESTORED старые голоса не переоткрывают тот же incident — считаются
 *    только голоса после restored_at/confirmed_at (§20, §28)
 *  - STATE_COOLDOWN — после автоизменения статуса короткая защита от дребезга (§29)
 *  - incident_log — полная история (§34)
 *
 * НЕ реализовано в этой версии (сознательно отложено, чтобы не разрастаться):
 *  - official source_event / сопоставление с парсером (§15-18, §41-43)
 *  - периодическая reevaluate_incidents по крону (§47) — только событийно, при report/admin-действии
 *  - confidence % — используются простые пороги, как и просит документ для MVP (§45)
 *
 * area anomalies (§23-25) — РЕАЛИЗОВАНО (см. evaluateAreaCluster ниже): если на
 * одной улице по одному ресурсу набирается ≥3 разных адреса с хотя бы 1 голосом
 * каждый — считаем районной проблемой и подтверждаем весь диапазон домов между
 * ними, а не только те, что реально пожаловались.
 */
const { select, insert, update } = require('./supabase');
// normStreet — ЧИСТАЯ строковая функция (без fs) из parser/lib/buildings.js,
// безопасна в serverless. ⚠️ housesOnStreet()/load() из ТОГО ЖЕ модуля — НЕТ:
// читают parser/buildings.json, которого в Vercel-рантайме не существует (файл
// в .gitignore, живёт только в кэше GitHub Actions при прогоне парсера, см.
// .github/workflows/parser.yml). Поэтому для диапазона домов улицы ниже тянем
// map/addresses.json HTTP-запросом с прод-домена — тот же приём, что уже
// использует api/_lib/city-stats.js для map/data.json.
const { normStreet } = require('../../parser/lib/buildings');

// Единая конфигурация окон — документ явно даёт числа только для горячей воды и
// говорит "позже можно задать свои для остальных" — для MVP применяем те же ко всем.
const CONFIG = {
  outageThreshold: 3,
  outageWindowMin: 360,
  restoreThreshold: 3,
  restoreWindowMin: 120,
};
const STATE_COOLDOWN_MIN = 15;

// Павлодар — UTC+5 круглый год (без перехода на летнее время). ⚠️ Каноническое
// определение — раньше дублировалось в api/admin-api.js, теперь та копия
// импортирует эту (см. require ниже там же), единственное место правки.
const TZ_OFFSET_MS = 5 * 3600 * 1000;
function endOfDayPavlodar() {
  const local = new Date(Date.now() + TZ_OFFSET_MS);
  const nextLocalMidnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + 1, 0, 0, 0);
  return new Date(nextLocalMidnight - TZ_OFFSET_MS).toISOString();
}

const enc = (s) => encodeURIComponent(s);
const minutesAgoISO = (min) => new Date(Date.now() - min * 60000).toISOString();

async function log(incidentId, eventType, detail) {
  if (!incidentId) return;
  try { await insert('incident_log', { incident_id: incidentId, event_type: eventType, detail: detail || null }); }
  catch (e) { console.error('incident_log insert failed:', e.message); }
}

async function getActiveIncident(address, utility_type) {
  const rows = await select('incidents',
    `address=eq.${enc(address)}&utility_type=eq.${utility_type}&status=eq.ACTIVE&limit=1`);
  return rows && rows[0] ? rows[0] : null;
}

/*
 * Сколько РАЗНЫХ actor_key засчитываем с одного ip_hash — ТОЛЬКО для голосов «нет ресурса».
 *
 * Зачем: actor_key — это cookie, её очистка делает «нового жителя». Без потолка
 * один человек добирал outageThreshold(3) в одиночку и вешал на публичную карту
 * несуществующее отключение.
 *
 * ⚠️⚠️ ПОЧЕМУ ПОТОЛОК НЕ ПРИМЕНЯЕТСЯ К ВОССТАНОВЛЕНИЮ.
 * Первая версия ограничивала обе стороны — и это был отказ в ОПАСНУЮ сторону.
 * В Павлодаре целый дом обычно сидит за одним CGNAT провайдера: потолок 2 при
 * restoreThreshold=3 означал, что отключение, once поставленное (вручную админом
 * или импортом), НИКОГДА не снимется автоматически — сколько бы жильцов ни нажало
 * «Уже появилось». Карта бессрочно показывала бы «нет воды» там, где вода есть,
 * и сама себя не чинила.
 *
 * Асимметрия сознательная и отражает разную цену ошибки:
 *   - ложное ОТКЛЮЧЕНИЕ — активная ложь на публичной карте, её и защищаем потолком;
 *   - ложное ВОССТАНОВЛЕНИЕ самокорректируется: ресурса нет — жильцы пожалуются снова
 *     и отключение вернётся штатным путём.
 */
const MAX_ACTORS_PER_IP_OUTAGE = 2;

/* Последний голос каждого уникального actor_key за окно, начиная с cutoff (если есть). */
async function currentVotes(address, utility_type, windowMin, cutoffISO) {
  const since = minutesAgoISO(windowMin);
  const rows = await select('user_reports',
    `address=eq.${enc(address)}&utility_type=eq.${utility_type}&status=eq.VALID` +
    `&reported_at=gte.${since}&order=reported_at.desc&select=actor_key,reported_state,reported_at,ip_hash`);
  // rows идут от новых к старым, поэтому первое попадание актёра = его актуальный голос.
  const lastByActor = new Map();
  for (const r of rows || []) {
    if (cutoffISO && r.reported_at <= cutoffISO) continue;
    if (!lastByActor.has(r.actor_key)) lastByActor.set(r.actor_key, { state: r.reported_state, ip: r.ip_hash || null });
  }

  // ⚠️ Считаем ПО НАПРАВЛЕНИЯМ отдельно. Если этого не делать, голоса
  // противоположного направления «съедают» лимит IP и молча режут то направление,
  // которое сейчас и проверяется (у вызывающего свои пороги на каждое).
  let outage = 0, restore = 0;
  const perIpOutage = new Map();
  for (const v of lastByActor.values()) {
    if (v.state === 'OUTAGE') {
      if (v.ip) {
        const used = perIpOutage.get(v.ip) || 0;
        if (used >= MAX_ACTORS_PER_IP_OUTAGE) continue;   // накрутка сменой cookie
        perIpOutage.set(v.ip, used + 1);
      }
      outage++;
    } else if (v.state === 'RESTORED') {
      restore++;                                          // см. комментарий выше: без потолка
    }
    // Любое иное значение (null/мусор из БД) НЕ считаем: раньше `else restore++`
    // трактовал его как голос за закрытие инцидента.
  }
  return { outageVotes: outage, restoreVotes: restore };
}

function inCooldown(incident) {
  if (!incident || !incident.updated_at) return false;
  return Date.now() - new Date(incident.updated_at).getTime() < STATE_COOLDOWN_MIN * 60000;
}

/* «Улица, дом» → { street, house }. Тот же паттерн, что api/_lib/city-stats.js:addrKey(). */
function splitAddress(address) {
  const m = String(address || '').match(/^(.*?),\s*([^,]+)$/);
  return m ? { street: m[1].trim(), house: m[2].trim() } : { street: '', house: '' };
}
// Первое число в номере дома («58/1» → 58, «60а» → 60) — для сортировки/диапазона.
function houseNum(h) { const m = String(h || '').match(/\d+/); return m ? parseInt(m[0], 10) : null; }

const AREA_CLUSTER_MIN_ADDRESSES = 3;   // §23-25: столько РАЗНЫХ адресов на улице запускают кластер
const AREA_CLUSTER_MAX_HOUSES = 60;     // страховка от чрезмерно широкого диапазона
const PROD_ORIGIN = 'https://barjok.kz';

let addrRegistryCache = null, addrRegistryCacheAt = 0;
const ADDR_REGISTRY_TTL_MS = 10 * 60000;
async function loadAddressRegistry() {
  const now = Date.now();
  if (addrRegistryCache && now - addrRegistryCacheAt < ADDR_REGISTRY_TTL_MS) return addrRegistryCache;
  try {
    const r = await fetch(`${PROD_ORIGIN}/map/addresses.json`);
    if (!r.ok) return addrRegistryCache; // временный сбой — отдаём старый кэш, если есть
    addrRegistryCache = await r.json();
    addrRegistryCacheAt = now;
  } catch (e) { console.error('loadAddressRegistry failed:', e.message); }
  return addrRegistryCache;
}

/*
 * §23-25 документа: если на ОДНОЙ УЛИЦЕ по одному ресурсу жалуются ≥3 РАЗНЫХ
 * адреса (хотя бы 1 засчитываемый голос на каждый, в том же окне outageWindowMin,
 * что и обычный порог) — это районная проблема, а не совпадение/спам по одному
 * дому. Подтверждаем ВЕСЬ диапазон домов улицы МЕЖДУ минимальным и максимальным
 * номером среди жаловавшихся (по адресному реестру map/addresses.json — значит,
 * включая и те дома, что сами не жаловались вообще).
 *
 * ⚠️ НЕЗАВИСИМО от обычного per-address порога в evaluate(): конкретный адрес,
 * на который пришёл ЭТОТ report, мог не набрать свои 3 голоса в одиночку — но
 * кластер по улице всё равно сработает, если наберётся 3 РАЗНЫХ адреса.
 */
async function evaluateAreaCluster(address, utility_type) {
  const { street: targetStreet } = splitAddress(address);
  if (!targetStreet) return [];
  const targetKey = normStreet(targetStreet);
  if (!targetKey) return [];

  const since = minutesAgoISO(CONFIG.outageWindowMin);
  let rows;
  try {
    rows = await select('user_reports',
      `utility_type=eq.${utility_type}&status=eq.VALID&reported_state=eq.OUTAGE` +
      `&reported_at=gte.${since}&order=reported_at.desc&limit=2000` +
      '&select=address,actor_key,ip_hash,reported_at');
  } catch (e) { console.error('evaluateAreaCluster select failed:', e.message); return []; }

  // группируем по адресу — тот же анти-накрутка потолок на IP, что в currentVotes()
  const byAddress = new Map();
  for (const r of rows || []) {
    if (!byAddress.has(r.address)) byAddress.set(r.address, new Map());
    const actors = byAddress.get(r.address);
    if (!actors.has(r.actor_key)) actors.set(r.actor_key, r.ip_hash || null);
  }

  const qualifying = [];   // адреса НА ЭТОЙ УЛИЦЕ с ≥1 засчитываемым голосом
  const allActors = new Set();   // ⚠️ см. ниже — против «1 человек, 3 адреса»
  for (const [addr, actors] of byAddress) {
    const { street, house } = splitAddress(addr);
    if (normStreet(street) !== targetKey) continue;
    const perIp = new Map();
    let countable = 0;
    for (const [actorKey, ip] of actors) {
      if (ip) {
        const used = perIp.get(ip) || 0;
        if (used >= MAX_ACTORS_PER_IP_OUTAGE) continue;
        perIp.set(ip, used + 1);
      }
      countable++;
      allActors.add(actorKey);
    }
    if (countable >= 1) qualifying.push({ address: addr, num: houseNum(house) });
  }
  // ⚠️ Порог «≥3 адреса» сам по себе НЕ защищает от одного человека, который
  // разными адресами (не сменой cookie — тем же actor_key) шлёт по 1 жалобе на
  // 3 разных дома и в одиночку запускает подтверждение всего квартала. Требуем
  // ещё и ≥3 РАЗНЫХ actor_key среди голосов, попавших в qualifying, — реальный
  // район с реальной проблемой почти всегда даёт разных людей по разным домам.
  if (qualifying.length < AREA_CLUSTER_MIN_ADDRESSES || allActors.size < AREA_CLUSTER_MIN_ADDRESSES) return [];

  const nums = qualifying.map((q) => q.num).filter((n) => n != null);
  if (!nums.length) return [];
  const minNum = Math.min(...nums), maxNum = Math.max(...nums);

  const registry = await loadAddressRegistry();
  if (!registry) return [];
  let houses = null;
  for (const key of Object.keys(registry)) {
    if (normStreet(key) === targetKey) { houses = registry[key]; break; }
  }
  if (!houses) return [];

  const inRange = houses.filter(([house]) => {
    const n = houseNum(house);
    return n != null && n >= minNum && n <= maxNum;
  });
  if (!inRange.length || inRange.length > AREA_CLUSTER_MAX_HOUSES) return [];

  const now = new Date().toISOString();
  const created = [];
  for (const [house] of inRange) {
    const fullAddress = `${targetStreet}, ${house}`;
    const existingIncident = await getActiveIncident(fullAddress, utility_type);
    if (existingIncident) continue;   // уже активно (в т.ч. вручную) — не трогаем
    let inc;
    try {
      [inc] = await insert('incidents', {
        address: fullAddress, utility_type, status: 'ACTIVE', confirmation_type: 'COMMUNITY',
        first_reported_at: now, confirmed_at: now,
        // «До конца дня» вместо бессрочного «Восстановят —»: автоподтверждение
        // без даты выглядело как гарантия «сломано неизвестно на сколько».
        // Голоса «восстановилось» по-прежнему могут снять раньше (см. evaluate);
        // sweepExpiredOverrides теперь снимает и без manual_override, см. там же.
        manual_override_until: endOfDayPavlodar(),
      });
    } catch (e) { console.error('evaluateAreaCluster insert failed for', fullAddress, ':', e.message); continue; }
    await log(inc.id, 'AUTO_CONFIRM_AREA_CLUSTER', {
      triggerAddresses: qualifying.map((q) => q.address), rangeMin: minNum, rangeMax: maxNum,
    });
    created.push(inc);
  }
  return created;
}

/* Пересчитывает статус incident'а по текущим голосам. Вызывается и после нового
   report, и после снятия manual_override администратором (§32). */
async function evaluate(address, utility_type) {
  const incident = await getActiveIncident(address, utility_type);

  if (incident && incident.manual_override !== 'NONE') return incident; // §31: override абсолютен

  if (incident) {
    if (inCooldown(incident)) return incident;
    const { restoreVotes } = await currentVotes(address, utility_type, CONFIG.restoreWindowMin, incident.confirmed_at);
    if (restoreVotes >= CONFIG.restoreThreshold) {
      const now = new Date().toISOString();
      const [updated] = await update('incidents', `id=eq.${incident.id}`, {
        status: 'RESTORED', restored_at: now, updated_at: now,
      });
      await log(incident.id, 'AUTO_CONFIRM_RESTORED', { restoreVotes });
      return updated;
    }
    return incident;
  }

  // Нет активного incident'а — проверяем, не набрался ли новый OUTAGE.
  // Если по этому адресу+ресурсу уже был RESTORED incident, учитываем только
  // голоса после его restored_at (§20).
  const [lastRestored] = (await select('incidents',
    `address=eq.${enc(address)}&utility_type=eq.${utility_type}&status=eq.RESTORED&order=restored_at.desc&limit=1`)) || [];
  const cutoff = lastRestored ? lastRestored.restored_at : null;
  const { outageVotes } = await currentVotes(address, utility_type, CONFIG.outageWindowMin, cutoff);
  if (outageVotes >= CONFIG.outageThreshold) {
    const now = new Date().toISOString();
    const [created] = await insert('incidents', {
      address, utility_type, status: 'ACTIVE', confirmation_type: 'COMMUNITY',
      first_reported_at: now, confirmed_at: now,
      // «До конца дня» вместо бессрочного «Восстановят —» — см. комментарий у
      // того же поля в evaluateAreaCluster() выше, причина та же.
      manual_override_until: endOfDayPavlodar(),
    });
    await log(created.id, 'AUTO_CONFIRM_OUTAGE', { outageVotes });
    return created;
  }

  // Порог по ОДНОМУ адресу не набрался — проверяем районный кластер (§23-25):
  // если жалуются ≥3 разных адреса на этой улице, подтверждаем весь диапазон
  // домов между ними, даже если конкретно этот адрес получил всего 1 голос.
  try {
    const clustered = await evaluateAreaCluster(address, utility_type);
    const own = clustered.find((c) => c.address === address);
    if (own) return own;
  } catch (e) { console.error('evaluateAreaCluster failed:', e.message); }

  return null;
}

/* Точка входа для нового пользовательского сообщения. */
async function submitReport({ address, utility_type, reported_state, actor_key, ip_hash, message }) {
  const row = await insert('user_reports', {
    address, utility_type, reported_state, actor_key,
    ip_hash: ip_hash || null, message: message ? String(message).slice(0, 300) : null,
  });
  const incidentGuess = await getActiveIncident(address, utility_type);
  await log(incidentGuess ? incidentGuess.id : null, 'USER_REPORT', { reported_state, actor_key });
  const incident = await evaluate(address, utility_type);
  return { report: row[0], incident };
}

/*
 * Автовосстановление по сроку — ДВА источника manual_override_until:
 *  1) админ выбрал "Подтвердить" → 1 день / 5 дней вместо "без даты"
 *     (api/admin-api.js:force_outage), manual_override='FORCE_OUTAGE';
 *  2) Decision Engine сам автоподтвердил (COMMUNITY, обычный порог ИЛИ
 *     районный кластер §23-25, см. evaluate()/evaluateAreaCluster() выше) —
 *     manual_override остаётся 'NONE', срок всегда "до конца дня" (не
 *     оставляем "Восстановят —" бессрочно висеть на публичной карте).
 * ⚠️ Фильтр НЕ проверяет manual_override — раньше проверял только
 * FORCE_OUTAGE, из-за чего community-инциденты с истёкшим сроком (2) никогда
 * бы не снимались автоматически. Голоса "восстановилось" по community-
 * инцидентам (manual_override=NONE) всё ещё могут снять их РАНЬШЕ через
 * обычный evaluate() — sweep здесь только верхняя граница на случай, если
 * голосов не набралось.
 *
 * НЕ periodic-крон (§47 документа сознательно не реализован, см. шапку файла) —
 * событийный sweep, вызывается на каждый живой запрос к incidents (карта,
 * лендинг-статистика, админка), т.е. срабатывает практически сразу после
 * истечения срока, без отдельной cron-инфраструктуры (лимит 12 функций Vercel
 * Hobby). Возвращает control автоматике (manual_override → NONE), а не просто
 * "гасит на экране" — иначе Decision Engine навсегда игнорировал бы адрес
 * (§31: override абсолютен, пока не снят явно).
 */
async function sweepExpiredOverrides() {
  const now = new Date().toISOString();
  let expired;
  try {
    expired = await select('incidents',
      `status=eq.ACTIVE&manual_override_until=not.is.null&manual_override_until=lte.${now}&limit=200`);
  } catch (e) {
    console.error('sweepExpiredOverrides select failed:', e.message);
    return [];
  }
  const restored = [];
  for (const inc of expired || []) {
    try {
      const [updated] = await update('incidents', `id=eq.${inc.id}`, {
        status: 'RESTORED', restored_at: inc.manual_override_until, updated_at: now,
        manual_override: 'NONE', manual_override_reason: null,
        manual_override_created_at: null, manual_override_until: null,
      });
      await log(inc.id, 'AUTO_RESTORE_DURATION', { was_until: inc.manual_override_until });
      restored.push(updated);
    } catch (e) {
      console.error('sweepExpiredOverrides update failed for', inc.id, ':', e.message);
    }
  }

  // Самоисцеление: COMMUNITY-инциденты, подтверждённые ДО того, как этот срок
  // стал ставиться при создании (см. evaluate()/evaluateAreaCluster()), висят
  // ACTIVE без manual_override_until вообще — бессрочно, что мы и чиним. Ставим
  // "до конца дня" ПРЯМО СЕЙЧАС (не задним числом), следующий sweep их снимет.
  try {
    const unbounded = await select('incidents',
      `status=eq.ACTIVE&manual_override=eq.NONE&confirmation_type=eq.COMMUNITY&manual_override_until=is.null&limit=200`);
    for (const inc of unbounded || []) {
      try {
        await update('incidents', `id=eq.${inc.id}`, { manual_override_until: endOfDayPavlodar(), updated_at: now });
        await log(inc.id, 'BACKFILL_END_OF_DAY', {});
      } catch (e) { console.error('sweepExpiredOverrides backfill failed for', inc.id, ':', e.message); }
    }
  } catch (e) { console.error('sweepExpiredOverrides backfill select failed:', e.message); }

  return restored;
}

module.exports = { submitReport, evaluate, sweepExpiredOverrides, endOfDayPavlodar, CONFIG };
