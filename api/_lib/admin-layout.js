/*
 * Общий каркас страниц /admin/* — шапка + боковое меню. Каждая страница передаёт
 * только свой контент и id пункта меню, который подсветить.
 */
const NAV = [
  { id: 'incidents', href: '/admin', label: 'Отключения', icon: '💧' },
  { id: 'settings', href: '/admin/settings', label: 'Настройки', icon: '⚙️' },
  { id: 'ads', href: '/admin/ads', label: 'Реклама', icon: '📣' },
  { id: 'analytics', href: '/admin/analytics', label: 'Аналитика', icon: '📊' },
];

const STYLE = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; background: #0f1115; color: #e7e9ee; display: flex; min-height: 100vh; }
  .side { width: 220px; flex: none; background: #12141a; border-right: 1px solid #232733; padding: 20px 12px; }
  .brand { font-weight: 700; font-size: 16px; padding: 0 10px 18px; color: #e7e9ee; }
  .brand span { color: #6ea8ff; }
  .nav a { display: flex; align-items: center; gap: 10px; padding: 9px 10px; border-radius: 8px; color: #b7bdc9; text-decoration: none; font-size: 14px; margin-bottom: 2px; }
  .nav a:hover { background: #1b1f29; color: #e7e9ee; }
  .nav a.on { background: #1d2b4d; color: #9ec1ff; }
  .nav .ic { width: 18px; text-align: center; }
  main { flex: 1; padding: 24px; min-width: 0; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .sub { color: #9aa2b1; font-size: 13px; margin-bottom: 20px; }
  .card { background: #171a21; border: 1px solid #262b36; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
  form.new { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  input, select { background: #0f1115; border: 1px solid #2c3140; color: #e7e9ee; border-radius: 8px; padding: 8px 10px; font-size: 14px; }
  input[name=address] { flex: 1; min-width: 220px; }
  button { background: #2f6bed; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; font-size: 14px; cursor: pointer; }
  button.ghost { background: transparent; border: 1px solid #2c3140; color: #e7e9ee; }
  button:disabled { opacity: .5; cursor: default; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 6px; border-bottom: 1px solid #232733; vertical-align: top; }
  th { color: #9aa2b1; font-weight: 500; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; }
  .b-active { background: #4a1f1f; color: #ff8a80; }
  .b-restored { background: #16321f; color: #7be08a; }
  .b-manual { background: #3a2f10; color: #ffcf6b; }
  .muted { color: #6b7280; }
  .actions button { margin-right: 6px; margin-bottom: 4px; }
  .empty { color: #6b7280; padding: 20px 0; text-align: center; }
  .soon { text-align: center; padding: 60px 20px; color: #6b7280; }
  .soon b { color: #9aa2b1; display: block; margin-bottom: 6px; font-size: 15px; }
`;

function renderAdminPage({ active, title, sub, body, script }) {
  const navHtml = NAV.map((n) =>
    `<a class="${n.id === active ? 'on' : ''}" href="${n.href}"><span class="ic">${n.icon}</span>${n.label}</a>`
  ).join('');
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>BARJOK · ${title}</title>
<style>${STYLE}</style>
</head>
<body>
  <div class="side">
    <div class="brand">BAR<span>JOK</span> · admin</div>
    <div class="nav">${navHtml}</div>
  </div>
  <main>
    <h1>${title}</h1>
    ${sub ? `<div class="sub">${sub}</div>` : ''}
    ${body}
  </main>
${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}

module.exports = { renderAdminPage };
