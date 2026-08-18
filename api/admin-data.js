const { requireAdmin } = require('./_lib/auth');
const { select } = require('./_lib/supabase');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method' });
  try {
    const incidents = await select('incidents', 'order=updated_at.desc&limit=200');
    res.status(200).json({ ok: true, incidents });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
