/*
 * Геометрия для «в границах улиц».
 *
 * Источники (особенно ПТС) пишут: «приостановлено ГВС в домах в границах улиц:
 * ул. Камзина; ул. Естая; ул. Астана; …». Это описание ОБЛАСТИ, а не списка улиц:
 * затронуты все дома ВНУТРИ контура, включая те, что не названы (напр. Сатпаева).
 * Строим выпуклую оболочку по точкам граничных улиц и берём дома внутри неё.
 */

// Выпуклая оболочка (monotone chain). Точки — [lat, lng].
function convexHull(points) {
  const pts = points.filter(Boolean).map((p) => [p[0], p[1]])
    .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}

// Точка внутри полигона (ray casting). point/polygon — [lat, lng].
function pointInPolygon(point, polygon) {
  const [y, x] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i], [yj, xj] = polygon[j];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// Небольшое расширение контура от центра — чтобы дома на самих граничных улицах попали внутрь.
function expandPolygon(poly, factor = 1.06) {
  if (poly.length < 3) return poly;
  const cy = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cx = poly.reduce((s, p) => s + p[1], 0) / poly.length;
  return poly.map(([y, x]) => [cy + (y - cy) * factor, cx + (x - cx) * factor]);
}

// Площадь полигона в кв. км (грубо, для защиты от абсурдно больших областей)
function areaKm2(poly) {
  if (poly.length < 3) return 0;
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    a += (poly[j][1] * poly[i][0]) - (poly[i][1] * poly[j][0]);
  }
  a = Math.abs(a / 2);
  return a * 111 * 111 * Math.cos(poly[0][0] * Math.PI / 180);
}

module.exports = { convexHull, pointInPolygon, expandPolygon, areaKm2 };
