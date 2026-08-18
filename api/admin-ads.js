const { requireAdmin } = require('./_lib/auth');
const { renderAdminPage } = require('./_lib/admin-layout');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const html = renderAdminPage({
    active: 'ads', title: 'Реклама',
    body: '<div class="card"><div class="soon"><b>Пока пусто</b>Монетизацию ещё не продумали — сюда лягут рекламные слоты/партнёрки, когда решим модель.</div></div>',
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
