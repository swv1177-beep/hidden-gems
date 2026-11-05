// Pure helpers shared by the UI. No JSX here so this module can also be
// executed directly with node for logic tests (haversine sorting).

export const KRW_PER_USD = 1350;

export const CATEGORIES = [
  'DAILY', 'FOOD', 'PUB', 'KBEAUTY', 'STAY', 'SIGHTSEEING',
  'DELIVERY', 'RIDE', 'EYEWEAR', 'KPOP', 'KDRAMA', 'JOBS'
];

export const CITY_POINTS = {
  SEOUL: { lat: 37.57202217, lng: 126.97683236 },
  BUSAN: { lat: 35.15779726, lng: 129.05989495 },
  JEJU: { lat: 33.4997202, lng: 126.5312573 }
};

// Haversine distance in kilometres.
export function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function sortByDistance(products, point) {
  if (!point) return [...products];
  return [...products]
    .map((p) => ({ ...p, _dist: haversine(point.lat, point.lng, p.lat, p.lng) }))
    .sort((a, b) => a._dist - b._dist);
}

export function formatMoney(krw, currency) {
  if (currency === 'USD') return '$' + (krw / KRW_PER_USD).toFixed(2);
  return '₩' + Number(krw).toLocaleString('en-US');
}

export function unitLabel(unit, t) {
  if (unit === 'SONG') return t('perSong');
  if (unit === 'NIGHT') return t('perNight');
  if (unit === 'RIDE') return t('perRide');
  return t('perPerson');
}

// Unsplash direct CDN images, one per category (SPEC list). If any URL fails,
// ImgWithFallback in App.jsx swaps it for a gradient.
const U = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=80`;
export const CATEGORY_IMAGES = {
  HERO: U('photo-1517154421773-0529f29ea451'),
  DAILY: U('photo-1521017432531-fbd92d768814'),
  FOOD: U('photo-1504674900247-0877df9cc836'),
  PUB: U('photo-1514933651103-005eec06c04b'),
  KBEAUTY: U('photo-1560066984-138dadb4c035'),
  STAY: U('photo-1566073771259-6a8506099945'),
  SIGHTSEEING: U('photo-1506905925346-21bda4d32df4'),
  DELIVERY: U('photo-1565299624946-b28f40a0ae38'),
  RIDE: U('photo-1449824913935-59a10b8d2000'),
  EYEWEAR: U('photo-1572635196237-14b3f281503f'),
  KPOP: U('photo-1470229722913-7c0e2dbbafd3'),
  KDRAMA: U('photo-1493976040374-85c8e12f0c0e'),
  JOBS: U('photo-1521791136064-7986c2920216')
};

export function productName(p, lang) {
  if (!p) return '';
  if (lang === 'ko') return p.nameKo || p.nameEn || '';
  return p.nameEn || p.nameKo || '';
}

export function productArea(p, lang) {
  if (!p) return '';
  if (lang === 'ko') return p.areaKo || p.areaEn || '';
  return p.areaEn || p.areaKo || '';
}

export function productSupplier(p, lang) {
  if (!p) return '';
  if (lang === 'ko') return p.supplierNameKo || p.supplierNameEn || '';
  return p.supplierNameEn || p.supplierNameKo || '';
}

export function productReview(p, lang) {
  if (!p) return '';
  if (lang === 'ko') return p.reviewKo || p.reviewEn || '';
  return p.reviewEn || p.reviewKo || '';
}
