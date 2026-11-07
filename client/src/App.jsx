import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { LANGS, makeT, t as tLang } from './i18n.js';
import {
  CATEGORIES, CATEGORY_IMAGES, CITY_POINTS, formatMoney, productArea,
  productName, productReview, productSupplier, sortByDistance, unitLabel
} from './utils.js';
import MapTab from './map.jsx';

// Error boundary for the map tab only: a map-API failure must never blank
// the whole app (no boundary above this tab), so a render/effect error in
// MapTab degrades to the tile-failure note instead of a white page.
class MapErrorBoundary extends React.Component {
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
  const [failed, setFailed] = useState(false);
  if (failed) return <div className={'img-fallback ' + (className || '')} aria-label={alt} />;
  return <img src={src} alt={alt} className={className} onError={() => setFailed(true)} loading="lazy" />;
}

function TestBadge({ t }) {
  return <span className="test-badge">{t('testMode')}</span>;
}

function statusLabel(b, t) {
  const s = b.status || b.Status;
  if (s === 'requested') return t('statusRequested');
  if (s === 'confirmed') return t('statusConfirmed');
  if (s === 'completed') return t('statusCompleted');
  if (s === 'cancelled') return t('statusCancelled');
  return s;
}
function payLabel(b, t) {
  const s = b.paymentStatus || b.payment_status;
  if (s === 'unpaid') return t('payUnpaid');
  if (s === 'paid') return t('payPaid');
  if (s === 'refunded') return t('payRefunded');
  return s;
}

export default function App() {
  const [lang, setLang] = useState('en');
  const [currency, setCurrency] = useState('KRW');
  const t = useMemo(() => makeT(lang), [lang]);
  const [view, setView] = useState({ name: 'home' });
  const [products, setProducts] = useState([]);
  const [fareRoutes, setFareRoutes] = useState([]);
  const [loadErr, setLoadErr] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [promoIdx, setPromoIdx] = useState(0);
  const [expandedCats, setExpandedCats] = useState({});
  const [homeQuery, setHomeQuery] = useState('');

  useEffect(() => {
    api.catalog()
      .then((d) => {
        const list = d.products || [];
        setProducts(list);
        setFareRoutes(d.fareRoutes || []);
      })
      .catch(() => setLoadErr('loadFail'));
  }, []);

  useEffect(() => {
    const id = setInterval(() => setPromoIdx((i) => (i + 1) % 3), 5000);
    return () => clearInterval(id);
  }, []);

  const bySlug = useMemo(() => {
    const m = {};
    products.forEach((p) => { m[p.slug] = p; });
    return m;
  }, [products]);

  function go(name, extra) { setView({ name, ...(extra || {}) }); window.scrollTo(0, 0); }
  function goDetail(slug) { go('detail', { slug }); }
  function goBooking(slug) { go('booking', { slug }); }

  async function sendChat(text) {
    const msg = (text || chatInput).trim();
    if (!msg) return;
    setChatMsgs((m) => [...m, { from: 'user', text: msg }]);
    setChatInput('');
    try {
      const d = await api.chatbot(msg);
      setChatMsgs((m) => [...m, {
        from: 'bot',
        text: d.reply || d.answer || d.message || JSON.stringify(d),
        urgent: d.urgent
      }]);
    } catch (e) {
      setChatMsgs((m) => [...m, { from: 'bot', text: t('loadFail') }]);
    }
  }

  const promos = [
    { title: t('promo1Title'), text: t('promo1Text'), img: CATEGORY_IMAGES.STAY },
    { title: t('promo2Title'), text: t('promo2Text'), img: CATEGORY_IMAGES.KBEAUTY },
    { title: t('promo3Title'), text: t('promo3Text'), img: CATEGORY_IMAGES.DAILY }
  ];
  const tags = ['BBQ', 'sauna', 'pocha', 'hair perm'];

  return (
    <div className="app">
      <header className="header">
        <button className="logo" onClick={() => go('home')}>Bapsang</button>
        <span className="tagline">{t('tagline')}</span>
        <nav className="nav">
          <button onClick={() => go('home')}>{t('navHome')}</button>
          <button onClick={() => go('map')}>{t('navMap')}</button>
          <button onClick={() => go('bookings')}>{t('navBookings')}</button>
          <button onClick={() => go('itinerary')}>{t('navItinerary')}</button>
          <button onClick={() => go('points')}>{t('navPoints')}</button>
          <button onClick={() => go('partner')}>{t('navPartner')}</button>
          <button onClick={() => go('admin')}>{t('navAdmin')}</button>
        </nav>
        {/* Language switcher is always visible in the header, never hidden in a menu. */}
        <div className="lang-switch" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l.code} className={lang === l.code ? 'lang active' : 'lang'} onClick={() => setLang(l.code)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="currency-switch" role="group" aria-label="Currency">
          <button className={currency === 'KRW' ? 'cur active' : 'cur'} onClick={() => setCurrency('KRW')}>KRW</button>
          <button className={currency === 'USD' ? 'cur active' : 'cur'} onClick={() => setCurrency('USD')}>USD</button>
        </div>
        <button className="btn chat-toggle" onClick={() => setChatOpen((v) => !v)}>💬 {t('chatBtn')}</button>
      </header>

      {chatOpen && (
        <section className="chat-panel">
          <h3>{t('chatTitle')}</h3>
          <div className="chat-log">
            {chatMsgs.map((m, i) => (
              <p key={i} className={m.from === 'user' ? 'msg user' : 'msg bot'}>
                {m.urgent ? '🚨 ' : ''}{m.text}
              </p>
            ))}
          </div>
          <div className="chat-input-row">
            <input
              className="input"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') sendChat(); }}
              placeholder={t('chatPlaceholder')}
            />
            <button className="btn primary" onClick={() => sendChat()}>{t('chatSend')}</button>
          </div>
          <div className="chips">
            <button className="chip" onClick={() => sendChat('booking status')}>booking</button>
            <button className="chip" onClick={() => sendChat('cancel')}>cancel</button>
            <button className="chip" onClick={() => sendChat('payment')}>payment</button>
            <button className="chip" onClick={() => sendChat('how to use')}>how to use</button>
          </div>
        </section>
      )}

      <main>
        {loadErr && (
          <p className="warn">{t(loadErr)} <button className="btn small" onClick={() => window.location.reload()}>{t('retry')}</button></p>
        )}

        {view.name === 'home' && (
          <HomeView
            t={t} currency={currency} products={products} promos={promos} promoIdx={promoIdx}
            setPromoIdx={setPromoIdx} tags={tags} expandedCats={expandedCats}
            setExpandedCats={setExpandedCats} homeQuery={homeQuery} setHomeQuery={setHomeQuery}
            go={go} goDetail={goDetail} goBooking={goBooking}
          />
        )}
        {view.name === 'category' && (
          <CategoryView t={t} currency={currency} products={products} category={view.category} query={view.query || ''} goDetail={goDetail} goBooking={goBooking} />
        )}
        {view.name === 'detail' && (
          <DetailView t={t} currency={currency} product={bySlug[view.slug]} fareRoutes={fareRoutes} goBooking={goBooking} go={go} />
        )}
        {view.name === 'booking' && (
          <BookingView t={t} currency={currency} product={bySlug[view.slug]} go={go} />
        )}
        {view.name === 'bookings' && (
          <MyBookingsView t={t} currency={currency} products={products} go={go} lang={lang} />
        )}
        {view.name === 'map' && (
          <MapErrorBoundary t={t}>
            <MapTab products={products} t={t} goDetail={goDetail} goBooking={goBooking} />
          </MapErrorBoundary>
        )}
        {view.name === 'partner' && <PartnerView t={t} />}
        {view.name === 'admin' && <AdminView t={t} currency={currency} products={products} />}
        {view.name === 'itinerary' && <ItineraryView t={t} currency={currency} />}
        {view.name === 'review' && <ReviewView t={t} prefillCode={view.code || ''} go={go} />}
        {view.name === 'points' && <PointsView t={t} />}
      </main>

      <footer className="footer">
        <p><b>Bapsang</b> — {t('tagline')}</p>
        <p>{t('testModeNote')}</p>
        <p>{t('brokerage')}</p>
      </footer>
    </div>
  );
}

function HomeView({ t, currency, products, promos, promoIdx, setPromoIdx, tags, expandedCats, setExpandedCats, homeQuery, setHomeQuery, go, goDetail, goBooking }) {
  const promo = promos[promoIdx];
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
              placeholder={t('searchPlaceholder')}
            />
            <button className="btn primary" onClick={() => go('category', { category: 'ALL', query: homeQuery })}>{t('searchBtn')}</button>
          </div>
        </div>
      </section>

      <section>
        <h2>{t('promoTitle')}</h2>
        <div className="carousel">
          <button className="btn small" onClick={() => setPromoIdx((promoIdx + 2) % 3)}>‹</button>
          <div className="promo-card">
            <Img src={promo.img} alt={promo.title} className="promo-img" />
            <div><b>{promo.title}</b><p>{promo.text}</p></div>
          </div>
          <button className="btn small" onClick={() => setPromoIdx((promoIdx + 1) % 3)}>›</button>
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
        <h2>{t('themeTitle')}</h2>
        <div className="theme-grid">
          <button className="theme-card" onClick={() => go('category', { category: 'DAILY' })}><b>{t('themeLocal')}</b><p>{t('themeLocalDesc')}</p></button>
          <button className="theme-card" onClick={() => go('category', { category: 'FOOD' })}><b>{t('themeFood')}</b><p>{t('themeFoodDesc')}</p></button>
          <button className="theme-card" onClick={() => go('category', { category: 'PUB' })}><b>{t('themeNight')}</b><p>{t('themeNightDesc')}</p></button>
          <button className="theme-card" onClick={() => go('category', { category: 'KBEAUTY' })}><b>{t('themeBeauty')}</b><p>{t('themeBeautyDesc')}</p></button>
        </div>
      </section>

      <section className="banners">
        <div className="banner coupon"><b>{t('couponBanner')}</b><p>{t('couponDesc')}</p></div>
        <div className="banner points"><b>{t('pointsBanner')}</b><p>{t('pointsDesc')}</p></div>
      </section>

      <section>
        {CATEGORIES.map((c) => {
          const items = products.filter((p) => p.category === c);
          if (items.length === 0) return null;
          const open = !!expandedCats[c];
          return (
            <div key={c} className="cat-row">
              <button
                className="cat-row-head"
                onClick={() => setExpandedCats((s) => ({ ...s, [c]: !s[c] }))}
              >
                <span>{t('cat' + c)} ({items.length})</span>
                <span>{open ? t('hideProducts') : t('showProducts')}</span>
              </button>
              {open && (
                <div className="product-grid">
                  {items.slice(0, 6).map((p) => (
                    <ProductCard key={p.slug} t={t} currency={currency} p={p} goDetail={goDetail} goBooking={goBooking} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}

export function ProductCard({ t, currency, p, goDetail, goBooking }) {
  return (
    <div className="product-card">
      <Img src={CATEGORY_IMAGES[p.category] || CATEGORY_IMAGES.DAILY} alt={p.nameEn || p.nameKo} className="product-img" />
      <div className="product-body">
        <b>{p.nameEn || p.nameKo}</b>
        <span className="muted">{p.areaEn || p.areaKo}</span>
        <span>★ {p.rating != null ? Number(p.rating).toFixed(1) : '—'} ({p.reviewCount || 0})</span>
        {p.localRegular && <span className="badge">{t('localRegular')}</span>}
        {p.isSample && <span className="badge sample">{t('sampleBadge')}</span>}
        <span className="price">{formatMoney(p.priceKrw, currency)}{unitLabel(p.unit, t)}</span>
        <div className="row-actions">
          <button className="btn small" onClick={() => goDetail(p.slug)}>{t('viewDetails')}</button>
          <button className="btn small primary" onClick={() => goBooking(p.slug)}>{t('bookNow')}</button>
        </div>
      </div>
    </div>
  );
}

function CategoryView({ t, currency, products, category, query, goDetail, goBooking }) {
  const [q, setQ] = useState(query);
  const [city, setCity] = useState('ALL');
  const [sort, setSort] = useState('popular');
  const cat = category || 'ALL';
  const filtered = products.filter((p) => {
    if (cat !== 'ALL' && p.category !== cat) return false;
    if (city !== 'ALL' && p.city !== city) return false;
    if (q) {
      const s = q.toLowerCase();
      if (
        !(p.nameKo || '').toLowerCase().includes(s) &&
        !(p.nameEn || '').toLowerCase().includes(s) &&
        !(p.areaKo || '').toLowerCase().includes(s) &&
        !(p.areaEn || '').toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });
  let list = [...filtered];
  if (sort === 'popular') list.sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
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
            <option value="priceAsc">{t('sortPriceAsc')}</option>
            <option value="priceDesc">{t('sortPriceDesc')}</option>
            <option value="distance">{t('sortDistance')}</option>
          </select>
        </label>
      </div>
      <div className="chips">
        {['ALL', 'SEOUL', 'BUSAN', 'JEJU'].map((c) => (
          <button key={c} className={city === c ? 'chip active' : 'chip'} onClick={() => setCity(c)}>
            {c === 'ALL' ? t('cityAll') : c === 'SEOUL' ? t('citySeoul') : c === 'BUSAN' ? t('cityBusan') : t('cityJeju')}
          </button>
        ))}
      </div>
      {list.length === 0 && <p>{t('noResults')}</p>}
      <div className="product-grid">
        {list.map((p) => (
          <ProductCard key={p.slug} t={t} currency={currency} p={p} goDetail={goDetail} goBooking={goBooking} />
        ))}
      </div>
    </div>
  );
}

function DetailView({ t, currency, product: p, fareRoutes, goBooking, go }) {
  const [est, setEst] = useState(null);
  const [avail, setAvail] = useState(null);
  const [availErr, setAvailErr] = useState('');
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

  if (!p) return <p>{t('loading')}</p>;
  const supplier = productSupplier(p, 'en');
  return (
    <div className="detail">
      <button className="btn small" onClick={() => go('home')}>{t('backBtn')}</button>
      <Img src={CATEGORY_IMAGES[p.category] || CATEGORY_IMAGES.DAILY} alt={p.nameEn || p.nameKo} className="detail-img" />
      <h2>{p.nameEn || p.nameKo}</h2>
      <p className="muted">{p.areaEn || p.areaKo} · ★ {p.rating != null ? Number(p.rating).toFixed(1) : '—'} ({p.reviewCount || 0})</p>
      {p.localRegular && <span className="badge">{t('localRegular')}</span>}
      {p.isSample && <span className="badge sample">{t('sampleBadge')}</span>}
      <p className="price big">{formatMoney(p.priceKrw, currency)}{unitLabel(p.unit, t)}</p>
      {/* Fixed seller line required by the spec, in every language. */}
      <p className="seller-line">
        {t('sellerPrefix')} {supplier}{p.isSample ? ' ' + t('sampleSuffix') : ''}, {t('brokerage')}
      </p>
      {p.reviewEn || p.reviewKo ? <blockquote>“{productReview(p, 'en')}”</blockquote> : null}
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
      <div className="row-actions">
        <button className="btn primary" onClick={() => goBooking(p.slug)}>{t('bookNow')}</button>
      </div>
    </div>
  );
}

function BookingView({ t, currency, product: p, go }) {
  const [step, setStep] = useState('form'); // form | pay | done
  const [qty, setQty] = useState(p && p.unit === 'SONG' ? 10 : 1);
  const [nights, setNights] = useState(1);
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [card, setCard] = useState('');
  const [booking, setBooking] = useState(null);
  const [err, setErr] = useState('');
  const [declined, setDeclined] = useState(false);

  if (!p) return <p>{t('loading')}</p>;
  const total = p.priceKrw * qty * (p.unit === 'NIGHT' ? nights : 1);

  async function submitBooking(e) {
    e.preventDefault();
    setErr('');
    if (!name || !email) { setErr('requiredFields'); return; }
    if (p.unit === 'NIGHT' && !date) { setErr('requiredFields'); return; }
    try {
      const b = await api.createBooking({
        productSlug: p.slug, quantity: qty, date: date || undefined,
        nights: p.unit === 'NIGHT' ? nights : 1, email, name
      });
      setBooking(b.booking || b);
      setStep('pay');
    } catch (e2) {
      setErr('bookingFailed');
    }
  }

  async function submitPay(e) {
    e.preventDefault();
    setErr('');
    setDeclined(false);
    const code = booking && (booking.code || booking.bookingCode);
    try {
      const r = await api.payBooking(code, card);
      if (r && r.ok === false) {
        if (r.error === 'card_declined') setDeclined(true);
        else setErr('paymentFailed');
        return;
      }
      setBooking(r.booking || r || booking);
      setStep('done');
    } catch (e2) {
      if (e2.code === 'card_declined') setDeclined(true);
      else setErr('paymentFailed');
    }
  }

  const code = booking && (booking.code || booking.bookingCode);
  const visitCode = booking && (booking.visitCode || booking.visit_code);

  return (
    <div className="booking-view">
      <h2>{t('bookingTitle')}: {p.nameEn || p.nameKo}</h2>
      <p><TestBadge t={t} /> {t('testModeNote')}</p>

      {step === 'form' && (
        <form onSubmit={submitBooking} className="form">
          <label>
            {p.unit === 'SONG' ? t('songsLabel') : t('qtyLabel')}
            <input className="input" type="number" min="1" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
          </label>
          {p.unit === 'NIGHT' && (
            <label>{t('nightsLabel')}
              <input className="input" type="number" min="1" value={nights} onChange={(e) => setNights(Number(e.target.value))} />
            </label>
          )}
          <label>{t('dateLabel')}
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>{t('nameLabel')}
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>{t('emailLabel')}
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <p><b>{t('totalLabel')}: {formatMoney(total, currency)}</b></p>
          {err && <p className="warn">{t(err)}</p>}
          <button className="btn primary" type="submit">{t('bookBtn')}</button>
        </form>
      )}

      {step === 'pay' && (
        <form onSubmit={submitPay} className="form">
          <h3>{t('payTitle')}</h3>
          <p><TestBadge t={t} /> {t('testModeNote')}</p>
          <p><b>{t('totalLabel')}: {formatMoney(total, currency)}</b></p>
          <label>{t('cardLabel')}
            <input className="input" inputMode="numeric" value={card} onChange={(e) => setCard(e.target.value)} placeholder="4242 4242 4242 4242" />
          </label>
          <p className="muted">{t('cardHint')}</p>
          {declined && <p className="warn">{t('cardDeclinedNote')}</p>}
          {err && <p className="warn">{t(err)}</p>}
          <button className="btn primary" type="submit">{t('payBtn')}</button>
        </form>
      )}

      {step === 'done' && (
        <div>
          <h3>✓ {t('paySuccess')}</h3>
          <p>{t('confirmDesc')}</p>
          {code && <p><b>{t('bookingCodeLabel')}: {code}</b></p>}
          {visitCode && <p><b>{t('visitCodeLabel')}: {visitCode}</b></p>}
          <button className="btn primary" onClick={() => go('bookings')}>{t('goBookings')}</button>
        </div>
      )}
    </div>
  );
}

const QUICK_REPLIES = ['qr1', 'qr2', 'qr3', 'qr4', 'qr5', 'qr6', 'qr7', 'qr8'];

// 사업자↔외국인 AI 번역 채팅 패널. 손님 측(viewer=user)은 내 예약에서,
// 사장님 측(viewer=owner)은 관리자 콘솔에서 같은 예약 코드로 연다.
// 3초 폴링으로 실시간처럼 갱신한다. 번역은 서버에서 수행하고, 번역본이
// 보는 사람의 언어와 일치할 때만 번역본을 보여주고 원문도 함께 표시한다.
function OwnerChatPanel({ bookingCode, viewer, lang, t }) {
  const [data, setData] = useState(null);
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');
  // 보는 사람의 표시 언어: 손님은 UI 언어, 사장님은 한국어 고정.
  const viewerLang = viewer === 'owner' ? 'ko' : lang;
  async function load() {
    try {
      const d = await api.ownerChat(bookingCode);
      setData(d);
    } catch (e) { setErr('loadFail'); }
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [bookingCode]);
  async function send(text) {
    const msg = (text || input).trim();
    if (!msg) return;
    setInput('');
    setErr('');
    try {
      await api.ownerChatSend({ bookingCode, message: msg, lang: viewerLang, sender: viewer });
      load();
    } catch (e) { setErr(e.code === 'owner_chat_closed' ? 'ownerChatClosed' : 'loadFail'); }
  }
  function displayText(m) {
    if (m.translatedMessage && m.translatedLang === viewerLang) return m.translatedMessage;
    return m.message;
  }
  const msgs = (data && data.messages) || [];
  return (
    <div className="chat-panel">
      <h3>{t('ownerChatTitle')}</h3>
      <p className="muted">{t('ownerChatHint')}</p>
      {viewer === 'owner' && data && data.customerLang && (
        <p className="muted">{t('ownerChatCustomerLang')}: {(LANGS.find((l) => l.code === data.customerLang) || {}).label || data.customerLang}</p>
      )}
      {data && data.translateEnabled === false && <p className="warn">{t('ownerChatNoKey')}</p>}
      {err && <p className="warn">{t(err)}</p>}
      <div className="chat-log">
        {msgs.map((m) => {
          const own = (viewer === 'user' && m.sender === 'user') || (viewer === 'owner' && m.sender === 'owner');
          const shown = displayText(m);
          const translated = shown !== m.message;
          return (
            <div key={m.id} className={own ? 'msg user' : 'msg bot'}>
              <div>{shown}</div>
              {translated && <div className="chat-orig">{t('ownerChatOriginal')}: {m.message}</div>}
              {translated && <div className="chat-tag">{t('ownerChatTranslated')}</div>}
            </div>
          );
        })}
      </div>
      <div className="chips">
        {QUICK_REPLIES.map((key) => (
          <button key={key} className="chip" onClick={() => send(viewer === 'owner' ? tLang('ko', key) : t(key))}>
            {viewer === 'owner' ? tLang('ko', key) : t(key)}
          </button>
        ))}
      </div>
      <div className="chat-input-row">
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder={t('ownerChatPlaceholder')}
        />
        <button className="btn primary" onClick={() => send()}>{t('chatSend')}</button>
      </div>
    </div>
  );
}

function MyBookingsView({ t, currency, products, go, lang }) {
  const [email, setEmail] = useState('');
  const [list, setList] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [chatCode, setChatCode] = useState('');
  const bySlug = {};
  products.forEach((p) => { bySlug[p.slug] = p; });

  async function load() {
    setErr(''); setMsg('');
    try {
      const d = await api.myBookings(email);
      setList(d.bookings || d || []);
    } catch (e) { setErr('loadFail'); }
  }
  async function cancel(code) {
    try {
      await api.cancelBooking(code);
      setMsg('cancelDone');
      load();
    } catch (e) { setErr('loadFail'); }
  }
  return (
    <div>
      <h2>{t('bookingsTitle')}</h2>
      <p>{t('bookingsHint')}</p>
      <div className="map-controls">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailLabel')} />
        <button className="btn primary" onClick={load}>{t('bookingsLoad')}</button>
      </div>
      {err && <p className="warn">{t(err)}</p>}
      {msg && <p className="ok">{t(msg)}</p>}
      {list && list.length === 0 && <p>{t('noResults')}</p>}
      {list && list.map((b) => {
        const code = b.code || b.bookingCode;
        const p = bySlug[b.productSlug || b.product_slug] || b.product || {};
        return (
          <div key={code}>
            <div className="booking-row">
              <div>
                <b>{code}</b> · {p.nameEn || p.nameKo || b.productSlug}
                <br />
                {statusLabel(b, t)} · {payLabel(b, t)}
                {b.totalKrw != null && <span> · {formatMoney(b.totalKrw, currency)}</span>}
              </div>
              <div className="row-actions">
                {(b.status === 'requested' || b.status === 'confirmed') && (
                  <button className="btn small" onClick={() => cancel(code)}>{t('cancelBtn')}</button>
                )}
                {b.status === 'confirmed' && (
                  <button className="btn small" onClick={() => setChatCode(chatCode === code ? '' : code)}>{t('ownerChatBtn')}</button>
                )}
                {b.status === 'completed' && (
                  <button className="btn small primary" onClick={() => go('review', { code })}>{t('writeReview')}</button>
                )}
              </div>
            </div>
            {chatCode === code && <OwnerChatPanel bookingCode={code} viewer="user" lang={lang} t={t} />}
          </div>
        );
      })}
    </div>
  );
}

// Korean business registration number checksum (10 digits).
function validBusinessNumber(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 10) return false;
  const key = [1, 3, 7, 1, 3, 7, 1, 3, 7];
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const m = key[i] * Number(d[i]);
    sum += Math.floor(m / 10) + (m % 10);
  }
  const m9 = key[8] * Number(d[8]);
  sum += Math.floor(m9 / 10) + (m9 % 10);
  return (10 - (sum % 10)) % 10 === Number(d[9]);
}

function PartnerView({ t }) {
  const [name, setName] = useState('');
  const [bn, setBn] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('FOOD');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr(''); setOk(false);
    if (!validBusinessNumber(bn)) { setErr('invalidBn'); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErr('invalidEmail'); return; }
    try {
      await api.partnerApply({ businessName: name, businessNumber: bn.replace(/\D/g, ''), email, category });
      setOk(true);
    } catch (e2) {
      setErr(e2.code === 'invalid_business_number' ? 'invalidBn' : 'loadFail');
    }
  }
  return (
    <div>
      <h2>{t('partnerTitle')}</h2>
      <p>{t('partnerDesc')}</p>
      <form onSubmit={submit} className="form">
        <label>{t('businessName')}<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>{t('businessNumber')}<input className="input" value={bn} onChange={(e) => setBn(e.target.value)} placeholder="1234567890" /></label>
        <label>{t('partnerEmail')}<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>{t('partnerCategory')}
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{t('cat' + c)}</option>)}
          </select>
        </label>
        {err && <p className="warn">{t(err)}</p>}
        {ok && <p className="ok">{t('partnerSuccess')}</p>}
        <button className="btn primary" type="submit">{t('submitBtn')}</button>
      </form>
    </div>
  );
}

function AdminView({ t, currency, products }) {
  const [overview, setOverview] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [partners, setPartners] = useState([]);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [invProduct, setInvProduct] = useState('');
  const [invDate, setInvDate] = useState('');
  const [invRooms, setInvRooms] = useState(10);
  const [chatCode, setChatCode] = useState('');

  async function load() {
    try {
      const [o, b, pay, pa] = await Promise.all([
        api.adminOverview(), api.adminBookings(), api.adminPayments(), api.adminPartners()
      ]);
      setOverview(o);
      setBookings(o && o.bookings ? o.bookings : (b.bookings || b || []));
      setPayments(pay.payments || pay || []);
      setPartners(pa.partners || pa.applications || pa || []);
    } catch (e) { setErr('loadFail'); }
  }
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const stays = products.filter((p) => p.category === 'STAY');
    if (stays.length && !invProduct) setInvProduct(stays[0].slug);
  }, [products, invProduct]);

  async function act(fn) {
    try { await fn(); setMsg(''); load(); } catch (e) { setErr('loadFail'); }
  }
  async function saveInventory(e) {
    e.preventDefault();
    try {
      await api.adminInventory({ productSlug: invProduct, date: invDate, totalRooms: Number(invRooms) });
      setMsg('invSaved');
    } catch (e2) { setErr('loadFail'); }
  }

  return (
    <div>
      <h2>{t('adminTitle')}</h2>
      <p className="warn">{t('adminNote')}</p>
      {err && <p className="warn">{t(err)}</p>}
      {msg && <p className="ok">{t(msg)}</p>}
      {overview && (
        <div>
          <h3>{t('overviewTitle')}</h3>
          <div className="overview-grid">
          <div className="stat"><b>{t('bookingsByStatus')}</b><p>{JSON.stringify(overview.bookingsByStatus || overview.bookings_by_status || {})}</p></div>
          <div className="stat"><b>{t('paidRevenue')}</b><p>{formatMoney(overview.paidRevenue || overview.paid_revenue || 0, currency)}</p></div>
          <div className="stat"><b>{t('pendingApps')}</b><p>{overview.pendingApplications ?? overview.pending_applications ?? 0}</p></div>
          <div className="stat"><b>{t('reviewCount')}</b><p>{overview.reviewCount ?? overview.review_count ?? 0}</p></div>
          <div className="stat"><b>{t('pointsIssued')}</b><p>{overview.pointsIssued ?? overview.points_issued ?? 0}</p></div>
        </div>
        </div>
      )}
      <h3>{t('adminBookings')}</h3>
      {bookings.map((b) => {
        const code = b.code || b.bookingCode;
        return (
          <div key={code}>
            <div className="booking-row">
              <span><b>{code}</b> · {b.productSlug || b.product_slug} · {statusLabel(b, t)} · {payLabel(b, t)}</span>
              <span className="row-actions">
                <button className="btn small" onClick={() => act(() => api.adminBookingAction(code, 'confirm'))}>{t('confirmBtn')}</button>
                <button className="btn small" onClick={() => act(() => api.adminBookingAction(code, 'complete'))}>{t('completeBtn')}</button>
                <button className="btn small" onClick={() => act(() => api.adminBookingAction(code, 'cancel'))}>{t('cancelBtn')}</button>
                <button className="btn small" onClick={() => setChatCode(chatCode === code ? '' : code)}>{t('ownerChatAdminBtn')}{b.chatCount ? ` (${b.chatCount})` : ''}</button>
              </span>
            </div>
            {chatCode === code && <OwnerChatPanel bookingCode={code} viewer="owner" lang="ko" t={t} />}
          </div>
        );
      })}
      <h3>{t('adminPayments')}</h3>
      {payments.map((pay, i) => (
        <div key={pay.id || i} className="booking-row">
          <span>{pay.bookingCode || pay.booking_code} · {formatMoney(pay.amountKrw || pay.amount_krw || 0, currency)} · ****{pay.last4 || ''} · {pay.status}</span>
        </div>
      ))}
      <h3>{t('adminPartners')}</h3>
      {partners.map((pa) => (
        <div key={pa.id} className="booking-row">
          <span><b>{pa.businessName || pa.business_name}</b> · {pa.email} · {pa.status}</span>
          <span className="row-actions">
            <button className="btn small" onClick={() => act(() => api.adminPartnerStatus(pa.id, 'approved'))}>{t('approveBtn')}</button>
            <button className="btn small" onClick={() => act(() => api.adminPartnerStatus(pa.id, 'rejected'))}>{t('rejectBtn')}</button>
          </span>
        </div>
      ))}
      <h3>{t('inventoryTitle')}</h3>
      <form onSubmit={saveInventory} className="form">
        <label>{t('invProduct')}
          <select className="input" value={invProduct} onChange={(e) => setInvProduct(e.target.value)}>
            {products.filter((p) => p.category === 'STAY').map((p) => (
              <option key={p.slug} value={p.slug}>{p.nameEn || p.nameKo}</option>
            ))}
          </select>
        </label>
        <label>{t('invDate')}<input className="input" type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} /></label>
        <label>{t('invRooms')}<input className="input" type="number" min="0" value={invRooms} onChange={(e) => setInvRooms(e.target.value)} /></label>
        <button className="btn primary" type="submit">{t('invSave')}</button>
      </form>
    </div>
  );
}

const TASTE_OPTIONS = [
  ['local', 'tasteLocal'], ['food', 'tasteFood'], ['kbeauty', 'tasteKbeauty'],
  ['nightlife', 'tasteNight'], ['kpop', 'tasteKpop'], ['kdrama', 'tasteKdrama'],
  ['shopping', 'tasteShopping'], ['sightseeing', 'tasteSight']
];

function ItineraryView({ t, currency }) {
  const [tastes, setTastes] = useState(['local', 'food']);
  const [date, setDate] = useState('');
  const [guests, setGuests] = useState(2);
  const [city, setCity] = useState('SEOUL');
  const [plan, setPlan] = useState(null);
  const [err, setErr] = useState('');
  function toggle(v) {
    setTastes((s) => s.includes(v) ? s.filter((x) => x !== v) : [...s, v]);
  }
  async function generate(e) {
    e.preventDefault();
    setErr('');
    try {
      const d = await api.itinerary({ tastes, date, guests, city });
      setPlan(d);
    } catch (e2) { setErr('loadFail'); }
  }
  return (
    <div>
      <h2>{t('itinTitle')}</h2>
      <p>{t('itinDesc')}</p>
      <form onSubmit={generate} className="form">
        <label>{t('tastesLabel')}</label>
        <div className="chips">
          {TASTE_OPTIONS.map(([v, key]) => (
            <button type="button" key={v} className={tastes.includes(v) ? 'chip active' : 'chip'} onClick={() => toggle(v)}>{t(key)}</button>
          ))}
        </div>
        <label>{t('dateLabel')}<input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>{t('guestsLabel')}<input className="input" type="number" min="1" value={guests} onChange={(e) => setGuests(Number(e.target.value))} /></label>
        <label>{t('cityAll')}
          <select className="input" value={city} onChange={(e) => setCity(e.target.value)}>
            <option value="SEOUL">{t('citySeoul')}</option>
            <option value="BUSAN">{t('cityBusan')}</option>
            <option value="JEJU">{t('cityJeju')}</option>
          </select>
        </label>
        {err && <p className="warn">{t(err)}</p>}
        <button className="btn primary" type="submit">{t('generateBtn')}</button>
      </form>
      {plan && plan.slots && (
        <div>
          <h3>{t('itinTotal')}: {formatMoney(plan.totalKrw || 0, currency)}</h3>
          {plan.slots.map((s, i) => (
            <div key={i} className="booking-row">
              <span><b>{s.time}</b> · {s.nameEn || s.nameKo}</span>
              <span>{formatMoney(s.priceKrw || 0, currency)}</span>
            </div>
          ))}
        </div>
      )}
      {!plan && <p>{t('itinEmpty')}</p>}
    </div>
  );
}

function ReviewView({ t, prefillCode, go }) {
  const [code, setCode] = useState(prefillCode || '');
  const [visitCode, setVisitCode] = useState('');
  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr(''); setOk(false);
    try {
      await api.submitReview({ bookingCode: code, visitCode, rating, text });
      setOk(true);
    } catch (e2) { setErr('reviewFail'); }
  }
  return (
    <div>
      <h2>{t('reviewTitle')}</h2>
      <p>{t('reviewDesc')}</p>
      <form onSubmit={submit} className="form">
        <label>{t('reviewCodeLabel')}<input className="input" value={code} onChange={(e) => setCode(e.target.value)} /></label>
        <label>{t('reviewVisitLabel')}<input className="input" value={visitCode} onChange={(e) => setVisitCode(e.target.value)} /></label>
        <label>{t('reviewRatingLabel')}
          <select className="input" value={rating} onChange={(e) => setRating(Number(e.target.value))}>
            {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{r} ★</option>)}
          </select>
        </label>
        <label>{t('reviewTextLabel')}<textarea className="input" value={text} onChange={(e) => setText(e.target.value)} rows="4" /></label>
        {err && <p className="warn">{t(err)}</p>}
        {ok && <p className="ok">{t('reviewSuccess')}</p>}
        <button className="btn primary" type="submit">{t('reviewSubmit')}</button>
      </form>
    </div>
  );
}

function PointsView({ t }) {
  const [email, setEmail] = useState('');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  async function load() {
    setErr('');
    try {
      const d = await api.points(email);
      setData(d);
    } catch (e) { setErr('loadFail'); }
  }
  return (
    <div>
      <h2>{t('pointsTitle')}</h2>
      <p>{t('pointsHint')}</p>
      <div className="map-controls">
        <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('emailLabel')} />
        <button className="btn primary" onClick={load}>{t('pointsLoad')}</button>
      </div>
      {err && <p className="warn">{t(err)}</p>}
      {data && (
        <div>
          <p><b>{t('pointsBalance')}: {data.balance ?? 0}</b></p>
          <h3>{t('pointsHistory')}</h3>
          {(data.ledger || []).map((row, i) => (
            <div key={row.id || i} className="booking-row">
              <span>{row.kind} · {row.bookingCode || row.booking_code}</span>
              <span>+{row.points}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
