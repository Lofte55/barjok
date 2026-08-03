/*
 * Мини-ридер .docx без внешних зависимостей.
 * .docx = zip; берём word/document.xml через системный `unzip` (macOS/Linux),
 * парсим таблицы: строка <w:tr> → ячейки <w:tc> → текст <w:t>.
 * Пустые «склеенные» ячейки (merge) отфильтровываются вызывающим кодом.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function download(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (BarJoqParser/1.0)' } });
  if (!res.ok) throw new Error(`docx HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function readDocumentXml(buf) {
  const tmp = path.join(os.tmpdir(), `barjoq_${Date.now()}.docx`);
  fs.writeFileSync(tmp, buf);
  try {
    return execFileSync('unzip', ['-p', tmp, 'word/document.xml'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
  }
}

// → массив строк, каждая строка = массив непустых текстов ячеек
function parseTableRows(xml) {
  const rows = xml.split('<w:tr').slice(1);
  return rows.map((row) => {
    const cells = row.split('<w:tc').slice(1);
    return cells.map((c) => {
      const parts = (c.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || []).map((m) => m.replace(/<[^>]+>/g, ''));
      return parts.join('').replace(/\s+/g, ' ').trim();
    }).filter((x) => x.length);
  }).filter((r) => r.length);
}

async function fetchDocxRows(url) {
  const buf = await download(url);
  return parseTableRows(readDocumentXml(buf));
}

module.exports = { fetchDocxRows, download, readDocumentXml, parseTableRows };
