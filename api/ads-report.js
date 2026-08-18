/*
 * Публичная read-only страница отчёта для рекламодателя (§57-58, §89-91).
 * Доступ по токену в URL, без admin-auth. НЕ показывает: visitor_id/session_id/IP,
 * точные адреса пользователей, персональные данные — только агрегаты (§91).
 */
const { select } = require('./_lib/supabase');
const { campaignStats } = require('./_lib/ads-analytics');

const esc = (s) => String(s == null ? '' : s).replace(/[<&>]/g, (c) => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('ru-RU'));
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }) : '—');

function page(title, bodyHtml) {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 32px 20px; background: #f4f6fb; color: #1a2233; }
  .wrap { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #667; margin-bottom: 24px; font-size: 14px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }
  .kpi { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .kpi .v { font-size: 22px; font-weight: 800; } .kpi .l { font-size: 12px; color: #667; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.06); margin-bottom: 20px; }
  th, td { text-align: left; padding: 10px 14px; border-bottom: 1px solid #eef0f5; font-size: 13px; }
  th { color: #667; font-weight: 600; background: #fafbfd; }
  .brand { font-weight: 800; color: #2f6bed; }
</style></head><body><div class="wrap">${bodyHtml}</div></body></html>`;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');
  const token = String((req.query || {}).token || '');
  const password = String((req.query || {}).password || '');
  if (!token) return res.status(404).send('Not found');

  try {
    const [report] = await select('ads_reports', `token=eq.${encodeURIComponent(token)}&limit=1`);
    if (!report || report.disabled) return res.status(404).send(page('Отчёт не найден', '<h1>Отчёт не найден или отключён</h1>'));
    if (report.valid_until && new Date(report.valid_until) < new Date()) return res.status(410).send(page('Срок истёк', '<h1>Срок действия ссылки истёк</h1>'));
    if (report.password && report.password !== password) {
      return res.status(200).send(page('Требуется пароль', `
        <h1>Отчёт защищён паролем</h1>
        <form method="GET"><input type="hidden" name="token" value="${esc(token)}">
        <input type="password" name="password" placeholder="Пароль" style="padding:8px;border-radius:8px;border:1px solid #ccc">
        <button type="submit" style="padding:8px 16px;border-radius:8px;background:#2f6bed;color:#fff;border:0">Открыть</button></form>`));
    }

    const stats = await campaignStats(report.campaign_id);
    if (!stats) return res.status(404).send('Not found');
    const { campaign, overview, creativeBreakdown } = stats;
    const [advertiser] = await select('ads_advertisers', `id=eq.${campaign.advertiser_id}&limit=1`);

    const creativeRows = creativeBreakdown.map((c) =>
      `<tr><td>${esc(c.name)}<div style="color:#889">${esc(c.headline)}</div></td><td>${fmt(c.impressions)}</td><td>${fmt(c.clicks)}</td><td>${c.ctr != null ? c.ctr + '%' : '—'}</td></tr>`
    ).join('');

    const financial = report.include_financial && campaign.contract_value
      ? `<div class="kpi"><div class="v">${fmt(campaign.contract_value)} ${esc(campaign.currency)}</div><div class="l">Бюджет</div></div>` : '';

    const body = `
      <div class="brand">BARJOK</div>
      <h1>${esc(campaign.name)}</h1>
      <div class="sub">${esc(advertiser ? advertiser.company_name : '')} · ${fmtDate(campaign.start_at)} — ${fmtDate(campaign.end_at)}</div>
      <div class="kpis">
        <div class="kpi"><div class="v">${fmt(overview.impressions)}</div><div class="l">Показы</div></div>
        <div class="kpi"><div class="v">${fmt(overview.reach)}</div><div class="l">Уникальный охват</div></div>
        <div class="kpi"><div class="v">${fmt(overview.clicks)}</div><div class="l">Клики</div></div>
        <div class="kpi"><div class="v">${overview.ctr != null ? overview.ctr + '%' : '—'}</div><div class="l">CTR</div></div>
        <div class="kpi"><div class="v">${overview.frequency != null ? overview.frequency : '—'}</div><div class="l">Частота показов</div></div>
        ${financial}
      </div>
      <h3>По креативам</h3>
      <table><thead><tr><th>Creative</th><th>Показы</th><th>Клики</th><th>CTR</th></tr></thead><tbody>${creativeRows || '<tr><td colspan="4">Нет данных</td></tr>'}</tbody></table>
      <div class="sub">Отчёт сформирован BARJOK · barjok.kz</div>
    `;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(page(campaign.name + ' — отчёт BARJOK', body));
  } catch (e) {
    console.error('ads-report failed:', e.message);
    res.status(500).send('Ошибка при формировании отчёта');
  }
};
