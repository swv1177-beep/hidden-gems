import { useEffect, useRef, useState } from 'react';
import { CITY_POINTS, haversine, sortByDistance } from './utils.js';
import { api } from './api.js';

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
  const userMarkerRef = useRef(null); // "You are here" dot (real GPS fix only)
  const userCircleRef = useRef(null); // GPS accuracy circle
  const nearbyMarkersRef = useRef([]); // KakaoMap nearby-shop markers
  const [nearby, setNearby] = useState([]); // live KakaoMap results (never stored)
  const [nearbyState, setNearbyState] = useState('idle'); // idle | loading | ok | fail | nokey
  const [nearbyMsg, setNearbyMsg] = useState('');
  const [city, setCity] = useState('ALL');
  const [category, setCategory] = useState('ALL');
  const [query, setQuery] = useState('');
  const [neighborhood, setNeighborhood] = useState('ALL');
  const [point, setPoint] = useState(null); // { lat, lng, label }
  const [pointLabel, setPointLabel] = useState('');
  const [accuracy, setAccuracy] = useState(null); // GPS accuracy in meters
  const [locState, setLocState] = useState('idle'); // idle | locating | ok | fail
  const [locMsg, setLocMsg] = useState('');
  const [tileFailed, setTileFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const lastViewTargetRef = useRef(null); // last point/city the map was centered on; user zoom is never reset

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
      // Recenter only when the view target itself changes (an explicit
      // location/city pick). Marker/list updates must not move the map,
      // and the user's zoom is never overridden: keep the current zoom.
      const targetKey = point
        ? `p:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`
        : (city !== 'ALL' && CITY_POINTS[city] ? `c:${city}` : null);
      if (targetKey && targetKey !== lastViewTargetRef.current) {
        lastViewTargetRef.current = targetKey;
        const [tLat, tLng] = point ? [point.lat, point.lng] : [CITY_POINTS[city].lat, CITY_POINTS[city].lng];
        mapObj.current.setView([tLat, tLng], mapObj.current.getZoom());
      }
      // "You are here" dot: only for a real GPS fix, never for a fallback
      // neighborhood/city reference point.
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
      if (userCircleRef.current) { userCircleRef.current.remove(); userCircleRef.current = null; }
      if (point && pointLabel === 'GPS') {
        const dot = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: 'gps-dot-wrap',
            html: '<span class="gps-dot"></span>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          }),
          interactive: false,
          keyboard: false
        }).addTo(mapObj.current);
        userMarkerRef.current = dot;
        if (accuracy != null && accuracy > 0) {
          userCircleRef.current = L.circle([point.lat, point.lng], {
            radius: accuracy,
            color: '#2f7bff',
            weight: 1,
            fillColor: '#2f7bff',
            fillOpacity: 0.12,
            interactive: false
          }).addTo(mapObj.current);
        }
      }
      // Nearby shops from KakaoMap (green dots, distinct from pink product pins).
      nearbyMarkersRef.current.forEach((m) => m.remove());
      nearbyMarkersRef.current = [];
      nearby.forEach((s) => {
        if (s.lat == null || s.lng == null) return;
        const marker = L.marker([s.lat, s.lng], {
          icon: L.divIcon({
            className: 'nearby-pin',
            html: '<span></span>',
            iconSize: [14, 14],
            iconAnchor: [7, 7]
          })
        }).addTo(mapObj.current);
        marker.bindPopup(`<b>${escapeHtml(s.name || '')}</b><br/>${escapeHtml(s.categoryDetail || s.category || '')}${s.distance != null ? ` · ${fmtDist(s.distance)}` : ''}`);
        nearbyMarkersRef.current.push(marker);
      });
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, sorted, point, city, pointLabel, accuracy, nearby]);

  function fmtDist(m) {
    if (m == null) return '';
    return m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
  }

  async function loadNearby(pt) {
    const target = pt || point;
    if (!target) return;
    setNearbyState('loading');
    setNearbyMsg('');
    try {
      const data = await api.nearby(target.lat, target.lng, 1000);
      setNearby(data.shops || []);
      setNearbyState('ok');
      if (!data.shops || !data.shops.length) setNearbyMsg(t('nearbyNone'));
    } catch (e) {
      setNearby([]);
      if (e && e.code === 'kakao_key_missing') {
        setNearbyState('nokey');
        setNearbyMsg(t('nearbyNeedKey'));
      } else {
        setNearbyState('fail');
        setNearbyMsg(t('nearbyFail'));
      }
    }
  }

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
    const onOk = (pos) => {
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPoint(pt);
      setPointLabel('GPS');
      setAccuracy(pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null);
      setLocState('ok');
      setLocMsg('');
      if (mapObj.current) mapObj.current.setView([pt.lat, pt.lng], Math.max(mapObj.current.getZoom(), 14));
      loadNearby(pt);
    };
    const onErr = (err, retried) => {
      if (err.code === 3 && !retried) {
        // Timeout on a cold fix (no cached position): retry once with high
        // accuracy and a longer window before giving up.
        navigator.geolocation.getCurrentPosition(onOk, (e2) => onErr(e2, true),
          { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
        return;
      }
      // Per-cause guidance, then fall back to the selected reference point.
      let msg = t('locateFail');
      if (err.code === 1) msg = t('locateFail') + ' (permission denied)';
      else if (err.code === 2) msg = t('locateFail') + ' (position unavailable)';
      else if (err.code === 3) msg = t('locateFail') + ' (timeout)' + ' ' + t('locateTimeoutHint');
      setLocState('fail');
      setLocMsg(msg + ' ' + t('locateFallbackNote'));
      applyFallbackPoint();
    };
    navigator.geolocation.getCurrentPosition(onOk, (e) => onErr(e, false),
      { enableHighAccuracy: false, maximumAge: 3600000, timeout: 30000 });
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
      if (mapObj.current) mapObj.current.setView([p.lat, p.lng], Math.max(mapObj.current.getZoom(), 14));
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

      <div className="nearby-section">
        <h3>{t('nearbyTitle')}</h3>
        <p className="pin-note">{t('nearbyHint')}</p>
        <button className="btn" onClick={() => loadNearby()} disabled={!point || nearbyState === 'loading'}>
          {nearbyState === 'loading' ? t('nearbyLoading') : t('nearbyBtn')}
        </button>
        {nearbyMsg && <p className="warn">{nearbyMsg}</p>}
        {nearby.length > 0 && (
          <div className="map-list">
            {nearby.map((s) => (
              <div
                key={s.id}
                className="map-row"
                onClick={() => { if (mapObj.current && s.lat != null) mapObj.current.setView([s.lat, s.lng], 16); }}
              >
                <div>
                  <b>{s.name}</b> · {s.categoryDetail || s.category}
                  {s.distance != null && <span> · {fmtDist(s.distance)}</span>}
                  {s.address && <div className="point-label">{s.address}</div>}
                </div>
                <div className="row-actions">
                  {s.placeUrl && (
                    <a className="btn small" target="_blank" rel="noreferrer" href={s.placeUrl}>
                      {t('nearbyViewOnKakao')}
                    </a>
                  )}
                </div>
              </div>
            ))}
            <p className="point-label">{t('nearbySource')}</p>
          </div>
        )}
      </div>

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
