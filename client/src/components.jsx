import React from 'react';
import { CATEGORY_IMAGES, formatMoney, productImages, unitLabel } from './utils.js';

// Global error boundary: any render error outside the map tab degrades to a
// retry box instead of a white page (the map tab keeps its own boundary).
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    // No reporting backend in the verification app; keep it local.
  }
  render() {
    if (this.state.failed) {
      const t = this.props.t || ((k) => k);
      return (
        <div className="error-box">
          <p><b>{t('errorTitle')}</b></p>
          <p>{t('errorDesc')}</p>
          <button className="btn primary" onClick={() => window.location.reload()}>{t('retry')}</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Error boundary for the map tab only: a map-API failure must never blank
// the whole app (no boundary above this tab), so a render/effect error in
// MapTab degrades to the tile-failure note instead of a white page.
export class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) {
      return <p className="warn">{this.props.t('tileFailNote')}</p>;
    }
    return this.props.children;
  }
}

// Every <img> in the app goes through this component so a failed image URL
// always degrades to a gradient block instead of a broken icon. No
// illustrations are used anywhere — only photos (Unsplash CDN) or gradients.
export function Img({ src, alt, className }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) return <div className={'img-fallback ' + (className || '')} aria-label={alt} />;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />;
}

export function TestBadge({ t }) {
  return <span className="test-badge">{t('testMode')}</span>;
}

export function statusLabel(b, t) {
  const s = b.status || b.Status;
  if (s === 'requested') return t('statusRequested');
  if (s === 'confirmed') return t('statusConfirmed');
  if (s === 'completed') return t('statusCompleted');
  if (s === 'cancelled') return t('statusCancelled');
  return s;
}
export function payLabel(b, t) {
  const s = b.paymentStatus || b.payment_status;
  if (s === 'unpaid') return t('payUnpaid');
  if (s === 'paid') return t('payPaid');
  if (s === 'refunded') return t('payRefunded');
  return s;
}

export function HorizontalCard({ t, currency, p, goDetail, goBooking, wishlist, onToggleWishlist }) {
  const wished = wishlist ? wishlist.includes(p.slug) : false;
  const discount = p.onsitePriceKrw > p.priceKrw ? Math.round((1 - p.priceKrw / p.onsitePriceKrw) * 100) : 0;
  return (
    <div className="hcard" onClick={() => goDetail(p.slug)}>
      <Img src={productImages(p)[0]} alt={p.nameEn || p.nameKo} className="hcard-img" />
      <div className="hcard-body">
        <span className="muted">{p.areaEn || p.areaKo}</span>
        <b>{p.nameEn || p.nameKo}</b>
        <span>★ {p.rating != null ? Number(p.rating).toFixed(1) : '—'} ({p.reviewCount || 0})</span>
        {p.localRegular && <span className="badge local">{t('localRegular')}</span>}
        <span className="price-row">
          <span className="price">{formatMoney(p.priceKrw, currency)}{unitLabel(p.unit, t)}</span>
          {discount > 0 && (
            <>
              <span className="price-old">{formatMoney(p.onsitePriceKrw, currency)}</span>
              <span className="deals-badge">-{discount}%</span>
            </>
          )}
        </span>
        <div className="row-actions">
          <button className="btn small primary" onClick={(e) => { e.stopPropagation(); goBooking(p.slug); }}>{t('bookNow')}</button>
          {onToggleWishlist && (
            <button className="btn small" onClick={(e) => { e.stopPropagation(); onToggleWishlist(p.slug); }} aria-label="wishlist">
              {wished ? '♥' : '♡'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ProductCard({ t, currency, p, goDetail, goBooking, wishlist, onToggleWishlist }) {
  const wished = wishlist ? wishlist.includes(p.slug) : false;
  return (
    <div className="product-card">
      {onToggleWishlist && (
        <button
          className={'wishlist-btn' + (wished ? ' active' : '')}
          onClick={(e) => { e.stopPropagation(); onToggleWishlist(p.slug); }}
          aria-label="wishlist"
        >
          {wished ? '♥' : '♡'}
        </button>
      )}
      <Img src={productImages(p)[0]} alt={p.nameEn || p.nameKo} className="product-img" />
      <div className="product-body">
        <b>{p.nameEn || p.nameKo}</b>
        <span className="muted">{p.areaEn || p.areaKo}</span>
        <span>★ {p.rating != null ? Number(p.rating).toFixed(1) : '—'} ({p.reviewCount || 0})</span>
        {p.localRegular && <span className="badge local">{t('localRegular')}</span>}
        {p.isSample && <span className="badge sample">{t('sampleBadge')}</span>}
        <span className="price-row">
          <span className="price">{formatMoney(p.priceKrw, currency)}{unitLabel(p.unit, t)}</span>
          {p.onsitePriceKrw > p.priceKrw && (
            <>
              <span className="price-old">{formatMoney(p.onsitePriceKrw, currency)}</span>
              <span className="deals-badge">-{Math.round((1 - p.priceKrw / p.onsitePriceKrw) * 100)}%</span>
            </>
          )}
        </span>
        <div className="row-actions">
          <button className="btn small" onClick={() => goDetail(p.slug)}>{t('viewDetails')}</button>
          <button className="btn small primary" onClick={() => goBooking(p.slug)}>{t('bookNow')}</button>
        </div>
      </div>
    </div>
  );
}
