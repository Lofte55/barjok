const { requireAdmin } = require('./_lib/auth');
const { renderAdminPage } = require('./_lib/admin-layout');

module.exports = async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const html = renderAdminPage({
    active: 'settings', title: 'Настройки',
    body: '<div class="card"><div class="soon"><b>Пока пусто</b>Пороги Decision Engine, окна времени, города — появится здесь.</div></div>',
  });
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(html);
};
