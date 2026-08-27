/*
 * Живой слой incidents из Supabase — ОДИН источник для ДВУХ потребителей:
 *   1. api/pages.js:renderLive — HTTP-эндпоинт, который карта дёргает при
 *      каждой загрузке (map/app.js:applyLiveLayer), чтобы подтверждённое в
 *      админке было видно сразу, не дожидаясь часового прогона парсера.
 *   2. api/_lib/city-stats.js — цифры на лендинге ("N без горячей воды" и т.п.).
 *
 * ⚠️⚠️ БЫЛО РАЗДЕЛЕНО, И ЭТО БЫЛ БАГ: раньше только renderLive знал про Supabase
 * incidents, а city-stats.js читал ТОЛЬКО статический map/data.json (который
 * подтягивает incidents лишь раз в час, через parser/adapters/incidents.js).
 * Найдено на живом кейсе: 16+ отключений ГВС подтверждены вручную в админке,
 * видны на карте (через живой слой), но лендинг честно писал "0 горячей воды" —
 * цифра была верна ТОЛЬКО для устаревшего среза данных, не для того, что
 * реально видит пользователь на карте секундой позже. Теперь оба потребителя
 * зовут ЭТУ функцию — расхождению просто неоткуда взяться.
 */
const { select } = require('./supabase');
const { sweepExpiredOverrides } = require('./decision-engine');

async function fetchLiveIncidents() {
  if (!process.env.SUPABASE_URL) return { active: [], restored: [] };

  // Автовосстановление по сроку (админ поставил "1 день"/"5 дней" вместо
  // "без даты") — событийный sweep на каждый живой запрос, см. decision-engine.js.
  // Best-effort: карта не должна падать из-за сбоя этого шага.
  try { await sweepExpiredOverrides(); } catch (e) { console.error('sweepExpiredOverrides failed:', e.message); }

  let rows;
  try {
    rows = await select('incidents', 'order=updated_at.desc&limit=1000');
  } catch (e) {
    // Карта и лендинг обязаны работать и без БД — пустой слой, а не ошибка/500.
    console.error('live incidents failed:', e.message);
    return { active: [], restored: [] };
  }

  // На пару адрес+ресурс может быть несколько incident'ов (старый RESTORED и новый
  // ACTIVE) — берём самый свежий, иначе устаревший RESTORED глушил бы актуальный ACTIVE.
  const latest = new Map();
  for (const inc of rows || []) {
    const key = `${inc.address}|${inc.utility_type}`;
    const cur = latest.get(key);
    if (!cur || new Date(inc.updated_at) > new Date(cur.updated_at)) latest.set(key, inc);
  }

  const active = [], restored = [];
  for (const inc of latest.values()) {
    const item = { address: inc.address, utility_type: inc.utility_type };
    if (inc.status === 'RESTORED') { restored.push(item); continue; }
    if (inc.status !== 'ACTIVE') continue;
    active.push({
      ...item,
      reason: inc.manual_override_reason || 'Подтверждено через BARJOK',
      confirmation_type: inc.confirmation_type,
      manual: inc.manual_override === 'FORCE_OUTAGE' || inc.confirmation_type === 'MANUAL',
      start: inc.confirmed_at || inc.created_at || null,
    });
  }
  return { active, restored };
}

module.exports = { fetchLiveIncidents };
