import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { CITY_POINTS, sortByDistance } from '../utils.js';
import { HorizontalCard } from '../components.jsx';

export default function CategoryView({ t, currency, products, category, query, goDetail, goBooking, wishlist, onToggleWishlist }) {
  const [q, setQ] = useState(query);
  const [city, setCity] = useState('ALL');
  const [sort, setSort] = useState('popular');
  const [soldOutOnly, setSoldOutOnly] = useState(false);
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [stayAvail, setStayAvail] = useState({});
  const cat = category || 'ALL';

  // Server search (/api/search), debounced while typing. The catalog is only
  // 38 products, but the list must reflect the server as the source of truth.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearching(true);
      api.search({ q, city: city === 'ALL' ? '' : city, category: cat === 'ALL' ? '' : cat })
        .then((d) => setResults(d.products || []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(id);
  }, [q, city, cat]);

  // Sold-out info is real stay inventory only (other categories have no
  // stock signal). Fetched lazily, only while the toggle is on.
  useEffect(() => {
    if (!soldOutOnly) return;
    const base = results || products;
    base.filter((p) => p.category === 'STAY' && !stayAvail[p.slug]).forEach((p) => {
      api.stayAvailability(p.slug, new Date().toISOString().slice(0, 10), '')
        .then((days) => setStayAvail((m) => ({ ...m, [p.slug]: days })))
        .catch(() => {});
    });
  }, [soldOutOnly, results]);

  const base = results === null ? products : results;
  let list = [...base];
  if (soldOutOnly) {
    list = list.filter((p) => {
      if (p.category !== 'STAY') return true;
      const days = stayAvail[p.slug];
      if (!days) return true; // availability not loaded yet — don't hide
      return days.some((d) => d.remaining > 0);
    });
  }
  if (sort === 'popular') list.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
  if (sort === 'rating') list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  if (sort === 'bookings') list.sort((a, b) => (b.bookingCount || 0) - (a.bookingCount || 0));
  if (sort === 'priceAsc') list.sort((a, b) => a.priceKrw - b.priceKrw);
  if (sort === 'priceDesc') list.sort((a, b) => b.priceKrw - a.priceKrw);
  if (sort === 'distance') {
    const pt = city !== 'ALL' ? CITY_POINTS[city] : null;
    list = sortByDistance(list, pt);
  }

  return (
    <div>
      <h2>{cat === 'ALL' ? t('listTitle') : t('cat' + cat)}</h2>
      <div className="map-controls">
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchPlaceholder')} />
        <label>{t('sortLabel')}:
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="popular">{t('sortPopular')}</option>
            <option value="rating">{t('sortRating')}</option>
            <option value="bookings">{t('sortBookings')}</option>
            <option value="priceAsc">{t('sortPriceAsc')}</option>
            <option value="priceDesc">{t('sortPriceDesc')}</option>
            <option value="distance">{t('sortDistance')}</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={soldOutOnly} onChange={(e) => setSoldOutOnly(e.target.checked)} />
          {t('soldOutOnly')}
        </label>
      </div>
      <div className="chips">
        {['ALL', 'SEOUL', 'BUSAN', 'JEJU'].map((c) => (
          <button key={c} className={city === c ? 'chip active' : 'chip'} onClick={() => setCity(c)}>
            {c === 'ALL' ? t('cityAll') : c === 'SEOUL' ? t('citySeoul') : c === 'BUSAN' ? t('cityBusan') : t('cityJeju')}
          </button>
        ))}
      </div>
      <p className="muted">{t('totalPrefix')}{list.length}{t('totalSuffix')}</p>
      {searching && (
        <div className="list-col">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton-card"><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div>
          ))}
        </div>
      )}
      {!searching && list.length === 0 && <p>{t('noResults')}</p>}
      {!searching && (
        <div className="list-col">
          {list.map((p) => (
            <HorizontalCard key={p.slug} t={t} currency={currency} p={p} goDetail={goDetail} goBooking={goBooking} wishlist={wishlist} onToggleWishlist={onToggleWishlist} />
          ))}
        </div>
      )}
    </div>
  );
}
