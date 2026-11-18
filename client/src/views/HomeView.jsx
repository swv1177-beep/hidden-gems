import { useEffect, useState } from 'react';
import { CATEGORIES, CATEGORY_IMAGES } from '../utils.js';
import { HorizontalCard, Img } from '../components.jsx';

const SEARCH_PH = ['searchPh1', 'searchPh2', 'searchPh3', 'searchPh4'];

export default function HomeView({ t, currency, products, picks, wishlist, onToggleWishlist, tags, homeQuery, setHomeQuery, go, goDetail, goBooking }) {
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhIdx((i) => (i + 1) % SEARCH_PH.length), 4000);
    return () => clearInterval(id);
  }, []);

  const deals = [...products]
    .filter((p) => p.onsitePriceKrw > p.priceKrw)
    .sort((a, b) => (1 - b.priceKrw / b.onsitePriceKrw) - (1 - a.priceKrw / a.onsitePriceKrw))
    .slice(0, 6);
  const wished = wishlist.length ? products.filter((p) => wishlist.includes(p.slug)) : [];

  return (
    <div>
      <section className="hero">
        <Img src={CATEGORY_IMAGES.HERO} alt="Seoul" className="hero-img" />
        <div className="hero-text">
          <h1>{t('heroTitle')}</h1>
          <p>{t('heroSub')}</p>
          <div className="search-row">
            <input
              className="input"
              value={homeQuery}
              onChange={(e) => setHomeQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') go('category', { category: 'ALL', query: homeQuery }); }}
              placeholder={t(SEARCH_PH[phIdx])}
            />
            <button className="btn primary" onClick={() => go('category', { category: 'ALL', query: homeQuery })}>{t('searchBtn')}</button>
          </div>
        </div>
      </section>

      <section>
        <h2>{t('catTitle')}</h2>
        <div className="cat-grid">
          {CATEGORIES.map((c) => (
            <button key={c} className="cat-card" onClick={() => go('category', { category: c })}>
              <Img src={CATEGORY_IMAGES[c]} alt={c} className="cat-img" />
              <span>{t('cat' + c)}</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2>{t('popularTagsTitle')}</h2>
        <div className="chips">
          {tags.map((tag) => (
            <button key={tag} className="chip" onClick={() => go('category', { category: 'ALL', query: tag })}>#{tag}</button>
          ))}
        </div>
      </section>

      <section>
        <h2>{t('picksTitle')}</h2>
        {picks === null && (
          <div className="scroll-row">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-card" style={{ width: 320, flexShrink: 0 }}>
                <div className="skeleton skeleton-img" /><div className="skeleton skeleton-line" />
              </div>
            ))}
          </div>
        )}
        {picks !== null && picks.length === 0 && <p className="muted">{t('picksEmpty')}</p>}
        {picks !== null && picks.length > 0 && (
          <div className="scroll-row">
            {picks.slice(0, 6).map((p) => (
              <HorizontalCard key={p.slug} t={t} currency={currency} p={p} goDetail={goDetail} goBooking={goBooking} wishlist={wishlist} onToggleWishlist={onToggleWishlist} />
            ))}
          </div>
        )}
      </section>

      {wished.length > 0 && (
        <section>
          <h2>{t('wishlistTitle')}</h2>
          <div className="scroll-row">
            {wished.map((p) => (
              <HorizontalCard key={p.slug} t={t} currency={currency} p={p} goDetail={goDetail} goBooking={goBooking} wishlist={wishlist} onToggleWishlist={onToggleWishlist} />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2>{t('dealsTitle')}</h2>
        {deals.length === 0 && <p className="muted">{t('dealsEmpty')}</p>}
        {deals.length > 0 && (
          <div className="scroll-row">
            {deals.map((p) => (
              <HorizontalCard key={p.slug} t={t} currency={currency} p={p} goDetail={goDetail} goBooking={goBooking} wishlist={wishlist} onToggleWishlist={onToggleWishlist} />
            ))}
          </div>
        )}
      </section>

      {CATEGORIES.map((c) => {
        const items = products.filter((p) => p.category === c)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 3);
        if (items.length === 0) return null;
        return (
          <section key={c}>
            <h2 className="section-head">{t('cat' + c)} {t('bestSuffix')}</h2>
            <div className="scroll-row">
              {items.map((p) => (
                <HorizontalCard key={p.slug} t={t} currency={currency} p={p} goDetail={goDetail} goBooking={goBooking} wishlist={wishlist} onToggleWishlist={onToggleWishlist} />
              ))}
            </div>
          </section>
        );
      })}

      <section>
        <h2>{t('travelInfoTitle')}</h2>
        <div className="theme-grid">
          <button className="theme-card" onClick={() => go('map')}><b>{t('navMap')}</b><p>{t('viewOnMap')}</p></button>
          <button className="theme-card" onClick={() => go('itinerary')}><b>{t('navItinerary')}</b><p>{t('itinDesc')}</p></button>
          <button className="theme-card" onClick={() => go('points')}><b>{t('navPoints')}</b><p>{t('pointsTitle')}</p></button>
        </div>
      </section>
    </div>
  );
}
