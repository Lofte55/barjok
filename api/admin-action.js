/*
 * Ручные действия админки над incidents. Пока (фаза 1, без Decision Engine)
 * это единственный способ менять статус — поэтому "снять override" здесь не
 * запускает переоценку (нечем), а просто убирает флаг ручного режима.
 */
const { requireAdmin } = require('./_lib/auth');
const { select, insert, update } = require('./_lib/supabase');

const UTILITIES = new Set(['hot_water', 'cold_water', 'electricity', 'heating', 'gas']);

async function log(incidentId, eventType, detail) {
  try {
    await insert('incident_log', { incident_id: incidentId, event_type: eventType, detail: detail || null });
  } catch (e) { console.error('incident_log insert failed:', e.message); }
}

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  const action = String(b.action || '');

  try {
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
          manual_override: 'FORCE_OUTAGE',
          manual_override_reason: reason,
          manual_override_created_at: now,
          updated_at: now,
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
        status: 'RESTORED', manual_override: 'FORCE_RESTORED',
        manual_override_created_at: now, restored_at: now, updated_at: now,
      });
      await log(id, 'MANUAL_FORCE_RESTORED', {});
      return res.status(200).json({ ok: true, incident });
    }

    if (action === 'clear_override') {
      const id = Number(b.id);
      if (!id) return res.status(400).json({ ok: false, error: 'bad_input' });
      const now = new Date().toISOString();
      const [incident] = await update('incidents', `id=eq.${id}`, {
        manual_override: 'NONE', manual_override_reason: null,
        manual_override_until: null, updated_at: now,
      });
      await log(id, 'MANUAL_OVERRIDE_CLEARED', {});
      return res.status(200).json({ ok: true, incident });
    }

    return res.status(400).json({ ok: false, error: 'unknown_action' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
