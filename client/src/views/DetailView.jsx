import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatMoney, productArea, productImages, productList, productName, productReview, productSupplier, productText, unitLabel } from '../utils.js';
import { Img, ProductCard } from '../components.jsx';

export default function DetailView({ t, currency, product: p, fareRoutes, goBooking, go, lang, products, goDetail, wishlist, onToggleWishlist, onViewCategory }) {
  const [est, setEst] = useState(null);
  const [avail, setAvail] = useState(null);
  const [availErr, setAvailErr] = useState('');
  const [reviews, setReviews] = useState([]);
  const [imgIdx, setImgIdx] = useState(0);
  const [galleryAll, setGalleryAll] = useState(false);
  const [faqOpen, setFaqOpen] = useState(null);

  useEffect(() => {
    if (!p) return;
    if (p.isMeterTaxi) {
      const route = fareRoutes.find((r) => p.slug.includes(r.id.split('-')[0]) || r.id === 'icn-hongdae');
      api.taxiEstimate({ routeId: route ? route.id : '' })
        .then(setEst)
        .catch(() => {
          // Local fallback with the SPEC constants (standard 4800/1.6km).
          const dist = 12, toll = 0;
          const total = 4800 + Math.ceil(Math.max(0, dist - 1.6) * 1000 / 100) * 100 + toll;
          setEst({ baseKrw: 4800, distanceKrw: total - 4800, tollKrw: toll, totalKrw: total, minKrw: Math.round(total * 0.85), maxKrw: Math.round(total * 1.15), note: 'meter' });
        });
    }
    if (p.category === 'STAY') {
      const today = new Date().toISOString().slice(0, 10);
      api.stayAvailability(p.slug, today, '')
        .then(setAvail)
        .catch(() => setAvailErr('loadFail'));
    }
  }, [p, fareRoutes]);

  useEffect(() => {
    if (!p) return;
    setImgIdx(0);
    setGalleryAll(false);
    if (onViewCategory) onViewCategory(p.category);
    api.productReviews(p.slug)
      .then((d) => setReviews(d.reviews || []))
      .catch(() => setReviews([]));
  }, [p]);

  if (!p) return <p>{t('loading')}</p>;

  const imgs = productImages(p);
  const supplier = productSupplier(p, lang);
  const included = productList(p, 'included', lang);
  const howTo = productList(p, 'howTo', lang);
  const notes = productList(p, 'notes', lang);
  const hours = productText(p, 'hours', lang);
  const discount = p.onsitePriceKrw > p.priceKrw ? Math.round((1 - p.priceKrw / p.onsitePriceKrw) * 100) : 0;
  const similar = (products || [])
    .filter((x) => x.category === p.category && x.slug !== p.slug)
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 4);
  const faqs = [['faqQ1', 'faqA1'], ['faqQ2', 'faqA2'], ['faqQ3', 'faqA3']];
  const thumbs = imgs.filter((_, i) => i !== imgIdx);

  return (
    <div className="detail">
      <button className="btn small" onClick={() => go('home')}>{t('backBtn')}</button>

      <div className={'gallery' + (galleryAll ? ' expanded' : '')}>
        <Img src={imgs[imgIdx]} alt={productName(p, lang)} className="gallery-main" />
        {thumbs.map((src) => {
          const i = imgs.indexOf(src);
          return (
            <button key={src} className="gallery-thumb-btn" onClick={() => setImgIdx(i)} aria-label={'photo ' + (i + 1)}>
              <Img src={src} alt={productName(p, lang)} className="gallery-thumb" />
            </button>
          );
        })}
      </div>
      {imgs.length > 1 && (
        <button className="btn small view-all-btn" onClick={() => setGalleryAll((v) => !v)}>
          {galleryAll ? t('galleryShowLess') : t('galleryViewAll')}
        </button>
      )}

      <h2>{productName(p, lang)}</h2>
      <p className="muted">{productArea(p, lang)} · ★ {p.rating != null ? Number(p.rating).toFixed(1) : '—'} ({p.reviewCount || 0})</p>
      {p.localRegular && (
        <p><span className="badge local">{t('localRegular')}</span> <span className="muted">{t('localBadgeCriteria')}</span></p>
      )}
      {p.isSample && <span className="badge sample">{t('sampleBadge')}</span>}

      <div className="detail-price-card">
        <span className="price big">{formatMoney(p.priceKrw, currency)}{unitLabel(p.unit, t)}</span>
        {p.onsitePriceKrw > p.priceKrw && (
          <span>
            <span className="price-old">{formatMoney(p.onsitePriceKrw, currency)}</span>{' '}
            <span className="deals-badge">-{discount}%</span>{' '}
            <span className="muted">{t('onsiteLabel')}</span>
          </span>
        )}
        {(p.bookingCount || 0) > 0 && <span className="muted">{p.bookingCount}{t('bookingsCountSuffix')}</span>}
      </div>

      {/* Fixed seller line required by the spec, in every language. */}
      <p className="seller-line">
        {t('sellerPrefix')} {supplier}{p.isSample ? ' ' + t('sampleSuffix') : ''}, {t('brokerage')}
      </p>
      {p.reviewEn || p.reviewKo ? <blockquote>“{productReview(p, lang)}”</blockquote> : null}
      {p.category === 'EYEWEAR' && <p className="notice">👓 {t('eyewearNotice')}</p>}
      {p.category === 'JOBS' && <p className="notice">⚠️ {t('jobsNotice')}</p>}
      {p.isMeterTaxi && (
        <div className="notice">
          <p>🚕 {t('meterNote')}</p>
          {est && (
            <p>{t('estTitle')}: {formatMoney(est.totalKrw, currency)} ({formatMoney(est.minKrw, currency)} – {formatMoney(est.maxKrw, currency)}). {t('estNote')}</p>
          )}
        </div>
      )}
      {p.category === 'STAY' && (
        <div>
          <h3>{t('availTitle')}</h3>
          {availErr && <p className="warn">{t(availErr)}</p>}
          {avail && avail.slice(0, 14).map((d) => (
            <span key={d.date} className="chip">
              {d.date}: {d.remaining} {d.remaining > 0 ? t('roomsLeft') : t('soldOut')}
            </span>
          ))}
        </div>
      )}

      {included.length > 0 && (
        <section className="detail-section">
          <h3>{t('includedTitle')}</h3>
          <ul>{included.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}
      {howTo.length > 0 && (
        <section className="detail-section">
          <h3>{t('howToTitle')}</h3>
          <ol>{howTo.map((x, i) => <li key={i}>{x}</li>)}</ol>
        </section>
      )}
      {notes.length > 0 && (
        <section className="detail-section">
          <h3>{t('importantTitle')}</h3>
          <ul>{notes.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </section>
      )}

      <section className="detail-section">
        <h3>{t('locationTitle')}</h3>
        <div className="info-list">
          <div><span className="muted">{t('addressLabel')}</span><span>{productArea(p, lang)}</span></div>
          {hours && <div><span className="muted">{t('hoursLabel')}</span><span>{hours}</span></div>}
        </div>
        <button className="btn small" onClick={() => go('map')}>{t('viewOnMap')}</button>
      </section>

      <section className="detail-section">
        <h3>{t('cancelTitle')}</h3>
        <p>{t('cancelPolicyText')}</p>
      </section>

      <section className="detail-section">
        <h3>{t('reviewsTitle')} ({p.reviewCount || 0})</h3>
        {reviews.length === 0 && <p className="muted">{t('reviewsEmpty')}</p>}
        {reviews.map((r) => (
          <div key={r.id} className="review-item">
            <span>★ {r.rating}</span> <span className="muted">{(r.createdAt || '').slice(0, 10)}</span>
            <p>{r.text}</p>
          </div>
        ))}
      </section>

      <section className="detail-section">
        <h3>{t('qaTitle')}</h3>
        {faqs.map(([q, a], i) => (
          <div key={q} className="faq-item">
            <button className="faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>{t(q)}</button>
            {faqOpen === i && <p>{t(a)}</p>}
          </div>
        ))}
      </section>

      {similar.length > 0 && (
        <section className="detail-section">
          <h3>{t('similarTitle')}</h3>
          <div className="product-grid">
            {similar.map((s) => (
              <ProductCard key={s.slug} t={t} currency={currency} p={s} goDetail={goDetail} goBooking={goBooking} wishlist={wishlist} onToggleWishlist={onToggleWishlist} />
            ))}
          </div>
        </section>
      )}

      <div className="sticky-cta">
        <span className="sticky-total">{formatMoney(p.priceKrw, currency)}{unitLabel(p.unit, t)}</span>
        <button className="btn primary" onClick={() => goBooking(p.slug)}>{t('bookNow')}</button>
      </div>
    </div>
  );
}
