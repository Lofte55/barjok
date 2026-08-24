/*
 * РУЧНЫЕ жалобы (Telegram → таблица не работала, см. HANDOFF/barjok.md) — временный слой,
 * пока не почини'на автоматическую запись в Google-таблицу (см. api/report.js).
 * Источник — parser/manual-reports.json, собранный build-manual-reports.js: владелец
 * сервиса вручную подтвердил каждую жалобу, это и есть модерация (аналог status=approved).
 * Визуально те же пины «сообщение жителя» (citizen:true), что и обычный слой citizen.js.
 * TTL 5 дней — не забыть удалить/обновить файл, когда официальные источники нагонят.
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'manual-reports.json');
const NOW = process.env.BARJOQ_NOW ? Date.parse(process.env.BARJOQ_NOW) : Date.now();
const TTL = 5 * 86400000;

async function fetchManualReports() {
  let rows;
  try { rows = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { records: [] }; }
  const records = [];
  for (const r of rows) {
    const ts = Date.parse(r.ts) || NOW;
    if (ts + TTL < NOW) continue;
    const start = new Date(ts).toISOString();
    const end = new Date(ts + TTL).toISOString();
    records.push({
      address: `${r.street}, ${r.house}`,
      district: 'Сообщение жителя',
      lat: r.lat, lng: r.lng,
      resource: r.resource, type: 'emergency', status: 'current',
      start, end, reason: r.reason,
      provider: 'Житель · подтверждено вручную (Telegram)',
      citizen: true, streetWide: false,
      precision: 'community', sourceTrust: 'community',
    });
  }
  if (records.length) console.log(`  ручные жалобы (Telegram): ${records.length}`);
  return { records, source: 'Жалобы жителей (Telegram, ручное подтверждение)' };
}

module.exports = { fetch: fetchManualReports };
