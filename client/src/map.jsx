import { useEffect, useRef, useState } from 'react';
import { CITY_POINTS, haversine, sortByDistance } from './utils.js';

// Map tab: Leaflet + OpenStreetMap tiles, with a full list fallback.
// - All catalog products get a neighborhood-level pin (catalog lat/lng).
// - Tile failure hides the map container but the list, filters and booking
//   links keep working.
// - Geolocation: cache-first (maximumAge large, timeout 10s), per-cause
//   messages, and a neighborhood-chip reference-point fallback (the embedded
//   panel iframe blocks geolocation, so the fallback is mandatory).
export default function MapTab({ products, t, goDetail, goBooking }) {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const markersRef = useRef([]);
  const [city, setCity] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [query, setQuery] = useState('');
  const [neighborhood, setNeighborhood] = useState('ALL');
  const [point, setPoint] = useState(null); // { lat, lng, label }
  const [pointLabel, setPointLabel] = useState('');
  const [locState, setLocState] = useState('idle'); // idle | locating | ok | fail
  const [locMsg, setLocMsg] = useState('');
  const [tileFailed, setTileFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const neighborhoods = [...new Set(products.map((p) => p.areaKo).filter(Boolean))].sort();

  const filtered = products.filter((p) => {
    if (city !== 'ALL' && p.city !== city) return false;
    if (category !== 'ALL' && p.category !== category) return false;
    if (neighborhood !== 'ALL' && p.areaKo !== neighborhood) return false;
    if (query) {
      const q = query.toLowerCase();
      if (
        !(p.nameKo || '').toLowerCase().includes(q) &&
        !(p.nameEn || '').toLowerCase().includes(q) &&
        !(p.areaKo || '').toLowerCase().includes(q) &&
        !(p.areaEn || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });
  const sorted = sortByDistance(filtered, point);

  // Init Leaflet once (dynamic import so a Leaflet failure never breaks the page).
  useEffect(() => {
    let cancelled = false;
    import('leaflet').then((L) => {
      if (cancelled || !mapRef.current) return;
      try {
        const map = L.map(mapRef.current).setView([37.57202217, 126.97683236], 12);
        const layer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '&copy; OpenStreetMap contributors'
        });
        layer.on('tileerror', () => setTileFailed(true));
        layer.addTo(map);
        mapObj.current = map;
        setMapReady(true);
      } catch (e) {
        setTileFailed(true);
      }
    }).catch(() => setTileFailed(true));
    return () => { cancelled = true; };
  }, []);

  // Markers follow the filtered list.
  useEffect(() => {
    if (!mapReady || !mapObj.current) return;
    import('leaflet').then((L) => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      sorted.forEach((p) => {
        if (p.lat == null || p.lng == null) return;
        const icon = L.divIcon({
          className: 'kfair-pin',
          html: '<span></span>',
          iconSize: [18, 18],
          iconAnchor: [9, 9]
        });
        const marker = L.marker([p.lat, p.lng], { icon }).addTo(mapObj.current);
        marker.bindPopup(`<b>${escapeHtml(p.nameEn || p.nameKo || '')}</b><br/>${escapeHtml(p.areaEn || p.areaKo || '')}`);
        markersRef.current.push(marker);
      });
      if (point) mapObj.current.setView([point.lat, point.lng], 13);
      else if (city !== 'ALL' && CITY_POINTS[city]) {
        const cp = CITY_POINTS[city];
        mapObj.current.setView([cp.lat, cp.lng], 12);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, sorted, point, city]);

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function findMyLocation() {
    if (!navigator.geolocation) {
      setLocState('fail');
      setLocMsg(t('locateFail'));
      return;
    }
    setLocState('locating');
    setLocMsg('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setPoint(pt);
        setPointLabel('GPS');
        setLocState('ok');
        setLocMsg('');
        if (mapObj.current) mapObj.current.setView([pt.lat, pt.lng], 14);
      },
      (err) => {
        // Per-cause guidance, then fall back to the selected reference point.
        let msg = t('locateFail');
        if (err.code === 1) msg = t('locateFail') + ' (permission denied)';
        else if (err.code === 2) msg = t('locateFail') + ' (position unavailable)';
        else if (err.code === 3) msg = t('locateFail') + ' (timeout)';
        setLocState('fail');
        setLocMsg(msg + ' ' + t('locateFallbackNote'));
        applyFallbackPoint();
      },
      { enableHighAccuracy: false, maximumAge: 3600000, timeout: 10000 }
    );
  }

  function applyFallbackPoint() {
    // Neighborhood chip first, then city chip, then Seoul center.
    if (neighborhood !== 'ALL') {
      const p = products.find((x) => x.areaKo === neighborhood);
      if (p && p.lat != null) {
        setPoint({ lat: p.lat, lng: p.lng });
        setPointLabel(p.areaKo);
        return;
      }
    }
    if (city !== 'ALL' && CITY_POINTS[city]) {
      setPoint(CITY_POINTS[city]);
      setPointLabel(city);
      return;
    }
    setPoint(CITY_POINTS.SEOUL);
    setPointLabel('SEOUL');
  }

  function useNeighborhoodPoint(area) {
    if (area === 'ALL') return;
    const p = products.find((x) => x.areaKo === area);
    if (p && p.lat != null) {
      setPoint({ lat: p.lat, lng: p.lng });
      setPointLabel(area);
      if (mapObj.current) mapObj.current.setView([p.lat, p.lng], 14);
    }
  }

  return (
    <div className="map-tab">
      <h2>{t('mapTitle')}</h2>
      <p className="pin-note">📍 {t('mapPinNote')}</p>

      <div className="map-controls">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('mapSearch')}
          className="input"
        />
        <button className="btn" onClick={findMyLocation} disabled={locState === 'locating'}>
          {locState === 'locating' ? t('locating') : '◎ ' + t('locateBtn')}
        </button>
        {point && <span className="point-label">{pointLabel} · {point.lat.toFixed(4)}, {point.lng.toFixed(4)}</span>}
      </div>
      {locMsg && <p className="warn">{locMsg}</p>}

      <div className="chips">
        {['ALL', 'SEOUL', 'BUSAN', 'JEJU'].map((c) => (
          <button
            key={c}
            className={city === c ? 'chip active' : 'chip'}
            onClick={() => { setCity(c); if (c !== 'ALL') { setPoint(CITY_POINTS[c]); setPointLabel(c); } }}
          >
            {c === 'ALL' ? t('cityAll') : c === 'SEOUL' ? t('citySeoul') : c === 'BUSAN' ? t('cityBusan') : t('cityJeju')}
          </button>
        ))}
      </div>

      <div className="chips">
        <button className={category === 'ALL' ? 'chip active' : 'chip'} onClick={() => setCategory('ALL')}>{t('cityAll')}</button>
        {['DAILY', 'FOOD', 'PUB', 'KBEAUTY', 'STAY', 'SIGHTSEEING', 'DELIVERY', 'RIDE', 'EYEWEAR', 'KPOP', 'KDRAMA', 'JOBS'].map((c) => (
          <button key={c} className={category === c ? 'chip active' : 'chip'} onClick={() => setCategory(c)}>
            {t('cat' + c)}
          </button>
        ))}
      </div>

      <div className="chips">
        <label>{t('neighborhoodLabel')}:</label>
        <button className={neighborhood === 'ALL' ? 'chip active' : 'chip'} onClick={() => setNeighborhood('ALL')}>{t('allNeighborhoods')}</button>
        {neighborhoods.map((n) => (
          <button
            key={n}
            className={neighborhood === n ? 'chip active' : 'chip'}
            onClick={() => { setNeighborhood(n); useNeighborhoodPoint(n); }}
          >
            {n}
          </button>
        ))}
      </div>

      {!tileFailed ? (
        <div ref={mapRef} className="leaflet-map" />
      ) : (
        <p className="warn">{t('tileFailNote')}</p>
      )}

      <div className="map-list">
        {sorted.length === 0 && <p>{t('noResults')}</p>}
        {sorted.map((p) => (
          <div key={p.slug} className="map-row">
            <div>
              <b>{p.nameEn || p.nameKo}</b> · {p.areaEn || p.areaKo}
              {point && p._dist != null && (
                <span> · {p._dist.toFixed(1)} {t('distanceKm')}</span>
              )}
            </div>
            <div className="row-actions">
              <a
                className="btn small"
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
              >
                {t('directionsBtn')}
              </a>
              <button className="btn small" onClick={() => goDetail(p.slug)}>{t('viewDetails')}</button>
              <button className="btn small primary" onClick={() => goBooking(p.slug)}>{t('bookNow')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Re-exported for the node haversine test (same logic as utils).
export { haversine };
