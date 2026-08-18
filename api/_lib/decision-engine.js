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
 *  - area anomalies / кластеры по нескольким домам (§23-25)
 *  - периодическая reevaluate_incidents по крону (§47) — только событийно, при report/admin-действии
 *  - confidence % — используются простые пороги, как и просит документ для MVP (§45)
 */
const { select, insert, update } = require('./supabase');

// Единая конфигурация окон — документ явно даёт числа только для горячей воды и
// говорит "позже можно задать свои для остальных" — для MVP применяем те же ко всем.
const CONFIG = {
  outageThreshold: 3,
  outageWindowMin: 360,
  restoreThreshold: 3,
  restoreWindowMin: 120,
};
const STATE_COOLDOWN_MIN = 15;

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

/* Последний голос каждого уникального actor_key за окно, начиная с cutoff (если есть). */
async function currentVotes(address, utility_type, windowMin, cutoffISO) {
  const since = minutesAgoISO(windowMin);
  const rows = await select('user_reports',
    `address=eq.${enc(address)}&utility_type=eq.${utility_type}&status=eq.VALID` +
    `&reported_at=gte.${since}&order=reported_at.desc&select=actor_key,reported_state,reported_at`);
  const lastByActor = new Map();
  for (const r of rows || []) {
    if (cutoffISO && r.reported_at <= cutoffISO) continue;
    if (!lastByActor.has(r.actor_key)) lastByActor.set(r.actor_key, r.reported_state);
  }
  let outage = 0, restore = 0;
  for (const state of lastByActor.values()) { if (state === 'OUTAGE') outage++; else restore++; }
  return { outageVotes: outage, restoreVotes: restore, uniqueActors: lastByActor.size };
}

function inCooldown(incident) {
  if (!incident || !incident.updated_at) return false;
  return Date.now() - new Date(incident.updated_at).getTime() < STATE_COOLDOWN_MIN * 60000;
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
    });
    await log(created.id, 'AUTO_CONFIRM_OUTAGE', { outageVotes });
    return created;
  }
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

module.exports = { submitReport, evaluate, CONFIG };
