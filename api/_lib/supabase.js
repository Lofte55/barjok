/*
 * Тонкий клиент к Supabase REST (PostgREST) через fetch — без зависимости
 * @supabase/supabase-js, чтобы не заводить package.json/сборку (проект и так
 * живёт без bundler'а, все api/*.js — голые Vercel serverless functions).
 * Всегда используем SUPABASE_SECRET_KEY (secret/service_role) — он не должен
 * попадать в браузер, поэтому этот файл импортируется только из api/*.
 */
function supaUrl() {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL not configured');
  return url.replace(/\/+$/, '');
}
function supaKey() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error('SUPABASE_SECRET_KEY not configured');
  return key;
}
function headers(extra) {
  const key = supaKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function supaFetch(path, opts = {}) {
  const r = await fetch(`${supaUrl()}/rest/v1/${path}`, {
    ...opts,
    headers: { ...headers(opts.preferHeaders), ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`supabase ${r.status}: ${text.slice(0, 500)}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

// select: строка query-параметров PostgREST, например 'status=eq.ACTIVE&order=created_at.desc'
async function select(table, query = '') {
  return supaFetch(`${table}${query ? `?${query}` : ''}`, { method: 'GET' });
}

async function insert(table, row) {
  return supaFetch(table, {
    method: 'POST',
    body: JSON.stringify(row),
    headers: { Prefer: 'return=representation' },
  });
}

async function update(table, query, patch) {
  return supaFetch(`${table}?${query}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    headers: { Prefer: 'return=representation' },
  });
}

async function remove(table, query) {
  return supaFetch(`${table}?${query}`, { method: 'DELETE' });
}

module.exports = { select, insert, update, remove };
