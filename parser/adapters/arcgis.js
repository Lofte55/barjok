/*
 * Обобщённый адаптер под ArcGIS REST FeatureLayer «Отключения».
 * Проверен на портале Новосибирска; переиспользуется для любого ArcGIS-источника
 * с полями address/district/type/dates/system_id (в т.ч. будущих казахстанских).
 *
 * Возвращает «сырые» записи: { address, district, lat, lng, resource, type, status, start, end, reason }.
 */

const TYPE_MAP = { 'Аварийное': 'emergency', 'Плановое': 'planned' };
const TIME_MAP = { 1: 'past', 2: 'current', 3: 'future' };
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; BarJoqParser/1.0)' };
const PAGE = 1000, MAX = 2500, REASON_MAX = 240;

function q(params) { return Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'); }
function iso(ms) { return (ms || ms === 0) ? new Date(ms).toISOString() : null; }
function cleanAddr(a) { return (a || '').replace(/\s*\([^)]*район[^)]*\)\s*$/i, '').trim(); }
function trimReason(r) {
  r = (r || '').replace(/\s+/g, ' ').trim();
  return r.length > REASON_MAX ? r.slice(0, REASON_MAX).replace(/[\s,;.]+\S*$/, '') + '…' : r;
}

function arcgisAdapter({ base, systemMap }) {
  return async function fetchArcgis() {
    const records = [];
    for (let offset = 0; offset < MAX; offset += PAGE) {
      const url = `${base}/query?` + q({
        where: 'time_category IN (2,3)',
        outFields: 'address,geocoded_address,district_name,type_id,start_date,end_date,description,system_id,time_category',
        orderByFields: 'time_category', returnGeometry: true, outSR: 4326,
        resultOffset: offset, resultRecordCount: PAGE, f: 'json',
      });
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`ArcGIS HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error('ArcGIS: ' + JSON.stringify(data.error));
      const feats = data.features || [];
      for (const f of feats) {
        const a = f.attributes, g = f.geometry;
        const resource = systemMap[a.system_id];
        if (!resource || !g || typeof g.x !== 'number') continue;
        records.push({
          address: cleanAddr(a.geocoded_address || a.address),
          district: (a.district_name || '').trim(),
          lat: +g.y.toFixed(5), lng: +g.x.toFixed(5),
          resource,
          type: TYPE_MAP[a.type_id] || 'planned',
          status: TIME_MAP[a.time_category] || 'current',
          start: iso(a.start_date), end: iso(a.end_date),
          reason: trimReason(a.description),
        });
      }
      if (feats.length < PAGE) break;
    }
    return { records };
  };
}

module.exports = { arcgisAdapter };
