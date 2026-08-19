#!/usr/bin/env node
/*
 * IndexNow — уведомляет Bing/Яндекс/etc. о том, что данные отключений
 * реально изменились, вместо ожидания планового краула. Вызывается из
 * run.sh ПОСЛЕ успешной (не откаченной) записи map/data.json.
 *
 * Ключ должен совпадать с файлом /<KEY>.txt, раздаваемым статически с корня
 * сайта (Vercel отдаёт его как обычный статический файл — see barjok.kz/<KEY>.txt).
 */
const HOST = 'barjok.kz';
const KEY = 'c4e1fbafe0a0c2cb34600c249247743e';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const { SERVICES } = require('../api/_lib/seo-cities');

// Список city slug'ов с status:'active' — держим отдельно от api/_lib/seo-cities.js,
// чтобы этот скрипт не тянул серверные зависимости (тот же require работает,
// т.к. seo-cities.js — чистый CommonJS без Vercel-специфики).
const { allCities } = require('../api/_lib/seo-cities');

function canonicalUrls() {
  const urls = [`https://${HOST}/`, `https://${HOST}/map/`];
  for (const city of allCities().filter((c) => c.status === 'active')) {
    urls.push(`https://${HOST}/${city.slug}/`);
    urls.push(`https://${HOST}/map/${city.slug}/`);
    for (const service of SERVICES) urls.push(`https://${HOST}/${city.slug}/${service.slug}/`);
  }
  return urls;
}

async function pingIndexNow(urlList) {
  const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList });
  try {
    const r = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body,
    });
    // IndexNow отвечает 200/202 при успехе, тело обычно пустое — не парсим JSON.
    console.log(`[indexnow] ${r.status} — отправлено ${urlList.length} URL`);
    return r.ok || r.status === 202;
  } catch (e) {
    console.warn('[indexnow] ошибка отправки:', e.message);
    return false;
  }
}

if (require.main === module) {
  pingIndexNow(canonicalUrls()).then((ok) => process.exit(ok ? 0 : 1));
}

module.exports = { pingIndexNow, canonicalUrls };
