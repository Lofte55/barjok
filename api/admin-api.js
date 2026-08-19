/*
 * Слияние admin-data.js (GET) + admin-action.js (POST) в один serverless
 * function — Vercel Hobby plan лимит 12 функций на деплой.
 */
const { requireAdmin } = require('./_lib/auth');
const { select, insert, update, remove } = require('./_lib/supabase');
const { evaluate } = require('./_lib/decision-engine');

const UTILITIES = new Set(['hot_water', 'cold_water', 'electricity', 'heating', 'gas']);

async function log(incidentId, eventType, detail) {
  try {
    await insert('incident_log', { incident_id: incidentId, event_type: eventType, detail: detail || null });
  } catch (e) { console.error('incident_log insert failed:', e.message); }
}

const CAT_UTILITIES = {
  hot_water: ['hot_water'], cold_water: ['cold_water'], electricity: ['electricity'],
  heating: ['heating'], gas: ['gas'], water_light: ['cold_water', 'electricity'],
  'нет горячей воды': ['hot_water'], 'нет холодной воды': ['cold_water'],
  'нет электричества': ['electricity'], 'нет тепла': ['heating'], 'нет газа': ['gas'],
  'нет воды и света': ['cold_water', 'electricity'],
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
      const list = resources.length ? resources : ['hot_water', 'cold_water', 'electricity', 'heating', 'gas'];
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

async function handleGet(req, res) {
  const incidents = await select('incidents', 'order=updated_at.desc&limit=200');
  res.status(200).json({ ok: true, incidents });
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

    const existing = await select('incidents',
      `address=eq.${encodeURIComponent(address)}&utility_type=eq.${utility_type}&status=eq.ACTIVE&limit=1`);
    const now = new Date().toISOString();
    let incident;
    if (existing && existing.length) {
      [incident] = await update('incidents', `id=eq.${existing[0].id}`, {
        manual_override: 'FORCE_OUTAGE', manual_override_reason: reason, manual_override_created_at: now, updated_at: now,
      });
    } else {
      [incident] = await insert('incidents', {
        address, utility_type, status: 'ACTIVE', confirmation_type: 'MANUAL',
        manual_override: 'FORCE_OUTAGE', manual_override_reason: reason, manual_override_created_at: now,
        first_reported_at: now, confirmed_at: now,
      });
    }
    await log(incident.id, 'MANUAL_FORCE_OUTAGE', { reason });
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

  if (action === 'import_sheet') {
    const feedUrl = String(b.feed_url || '').trim();
    if (!feedUrl) return res.status(400).json({ ok: false, error: 'bad_input' });
    const result = await importFromSheet(feedUrl);
    return res.status(200).json({ ok: true, ...result });
  }

  // Временный инструмент: генерация иллюстраций через OpenAI Images API
  // (ключ только из env, за admin-авторизацией). Убрать после разовой генерации
  // ассетов для trust-блока — не держим постоянный платный эндпоинт открытым.
  if (action === 'generate_image') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return res.status(500).json({ ok: false, error: 'no_api_key' });
    const prompt = String(b.prompt || '').trim().slice(0, 800);
    if (!prompt) return res.status(400).json({ ok: false, error: 'bad_input' });
    const size = String(b.size || '1024x1024');
    try {
      const r = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt, size, n: 1 }),
      });
      const j = await r.json();
      if (!r.ok) return res.status(502).json({ ok: false, error: j.error?.message || 'openai_error' });
      const b64 = j.data && j.data[0] && j.data[0].b64_json;
      if (!b64) return res.status(502).json({ ok: false, error: 'no_image_returned' });
      return res.status(200).json({ ok: true, b64 });
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message });
    }
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
