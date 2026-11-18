import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { LANGS, makeT } from './i18n.js';
import { loadViewedCategories, loadWishlist, saveViewedCategories, saveWishlist } from './utils.js';
import { ErrorBoundary, MapErrorBoundary } from './components.jsx';
import MapTab from './map.jsx';
import HomeView from './views/HomeView.jsx';
import CategoryView from './views/CategoryView.jsx';
import DetailView from './views/DetailView.jsx';
import BookingView from './views/BookingView.jsx';
import MyBookingsView from './views/MyBookingsView.jsx';
import PartnerView from './views/PartnerView.jsx';
import AdminView from './views/AdminView.jsx';
import ItineraryView from './views/ItineraryView.jsx';
import ReviewView from './views/ReviewView.jsx';
import PointsView from './views/PointsView.jsx';

// Hash routing (no router dependency): #/category/FOOD?q=bbq, #/detail/<slug>,
// #/booking/<slug>, #/bookings, #/map, #/partner, #/admin, #/itinerary,
// #/review?code=KF-XXXXXX, #/points. Back button and deep links work;
// reload lands on the same view. Language/currency still reset on reload
// (no localStorage persistence — unchanged behaviour).
function hashFor(name, extra) {
  const e = extra || {};
  if (name === 'category') {
    const q = e.query ? '?q=' + encodeURIComponent(e.query) : '';
    return '#/category/' + (e.category || 'ALL') + q;
  }
  if (name === 'detail') return '#/detail/' + e.slug;
  if (name === 'booking') return '#/booking/' + e.slug;
  if (name === 'review') return '#/review' + (e.code ? '?code=' + encodeURIComponent(e.code) : '');
  return '#/' + name;
}
function parseHash() {
  const raw = (window.location.hash || '').replace(/^#/, '');
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query || '');
  if (!parts.length) return { name: 'home' };
  const [seg, arg] = parts;
  if (seg === 'category') return { name: 'category', category: arg || 'ALL', query: params.get('q') || '' };
  if (seg === 'detail') return { name: 'detail', slug: arg };
  if (seg === 'booking') return { name: 'booking', slug: arg };
  if (seg === 'review') return { name: 'review', code: params.get('code') || '' };
  if (['home', 'map', 'bookings', 'partner', 'admin', 'itinerary', 'points'].includes(seg)) return { name: seg };
  return { name: 'home' };
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
  const [homeQuery, setHomeQuery] = useState('');
  const [showTools, setShowTools] = useState(false);
  const [wishlist, setWishlist] = useState(loadWishlist);
  const [viewedCats, setViewedCats] = useState(loadViewedCategories);
  const [picks, setPicks] = useState(null);

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
    api.recommendations(viewedCats.join(','), '')
      .then((d) => setPicks(d.items || []))
      .catch(() => setPicks([]));
  }, [viewedCats]);

  function toggleWishlist(slug) {
    setWishlist((list) => {
      const next = list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
      saveWishlist(next);
      return next;
    });
  }
  function recordViewedCategory(cat) {
    if (!cat) return;
    setViewedCats((prev) => {
      if (prev[0] === cat) return prev;
      const next = [cat, ...prev.filter((c) => c !== cat)].slice(0, 5);
      saveViewedCategories(next);
      return next;
    });
  }

  useEffect(() => {
    const apply = () => { setView(parseHash()); window.scrollTo(0, 0); };
    apply();
    window.addEventListener('hashchange', apply);
    return () => window.removeEventListener('hashchange', apply);
  }, []);

  const bySlug = useMemo(() => {
    const m = {};
    products.forEach((p) => { m[p.slug] = p; });
    return m;
  }, [products]);

  function go(name, extra) {
    const h = hashFor(name, extra);
    if (window.location.hash === h) {
      setView(parseHash());
      window.scrollTo(0, 0);
      return;
    }
    window.location.hash = h;
  }
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

  const tags = ['BBQ', 'sauna', 'pocha', 'hair perm'];

  const loading = products.length === 0 && !loadErr;

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
        <button className="btn small tools-toggle" onClick={() => setShowTools((v) => !v)} aria-expanded={showTools}>🌐 {lang.toUpperCase()}</button>
        <div className={'header-tools' + (showTools ? ' open' : '')}>
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

      <ErrorBoundary t={t}>
      <main>
        {loadErr && (
          <p className="warn">{t(loadErr)} <button className="btn small" onClick={() => window.location.reload()}>{t('retry')}</button></p>
        )}
        {loading && (
          <div>
            <p className="muted">{t('loadingProducts')}</p>
            <div className="product-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-card"><div className="skeleton skeleton-img" /><div className="skeleton skeleton-line" /><div className="skeleton skeleton-line short" /></div>
            ))}
            </div>
          </div>
        )}
        {!loading && view.name === 'home' && (
          <HomeView
            t={t} currency={currency} products={products} picks={picks}
            wishlist={wishlist} onToggleWishlist={toggleWishlist}
            tags={tags} homeQuery={homeQuery} setHomeQuery={setHomeQuery}
            go={go} goDetail={goDetail} goBooking={goBooking}
          />
        )}
        {!loading && view.name === 'category' && (
          <CategoryView t={t} currency={currency} products={products} category={view.category} query={view.query || ''} goDetail={goDetail} goBooking={goBooking} wishlist={wishlist} onToggleWishlist={toggleWishlist} />
        )}
        {!loading && view.name === 'detail' && (
          <DetailView t={t} currency={currency} product={bySlug[view.slug]} fareRoutes={fareRoutes} goBooking={goBooking} go={go} lang={lang} products={products} goDetail={goDetail} wishlist={wishlist} onToggleWishlist={toggleWishlist} onViewCategory={recordViewedCategory} />
        )}
        {!loading && view.name === 'booking' && (
          <BookingView t={t} currency={currency} product={bySlug[view.slug]} go={go} />
        )}
        {!loading && view.name === 'bookings' && (
          <MyBookingsView t={t} currency={currency} products={products} go={go} lang={lang} />
        )}
        {!loading && view.name === 'map' && (
          <MapErrorBoundary t={t}>
            <MapTab products={products} t={t} goDetail={goDetail} goBooking={goBooking} />
          </MapErrorBoundary>
        )}
        {!loading && view.name === 'partner' && <PartnerView t={t} />}
        {!loading && view.name === 'admin' && <AdminView t={t} currency={currency} products={products} />}
        {!loading && view.name === 'itinerary' && <ItineraryView t={t} currency={currency} />}
        {!loading && view.name === 'review' && <ReviewView t={t} prefillCode={view.code || ''} go={go} />}
        {!loading && view.name === 'points' && <PointsView t={t} />}
      </main>
      </ErrorBoundary>

      <footer className="footer">
        <p><b>Bapsang</b> — {t('tagline')}</p>
        <p>{t('testModeNote')}</p>
        <p>{t('brokerage')}</p>
        <div className="footer-links">
          <button onClick={() => go('itinerary')}>{t('navItinerary')}</button>
          <button onClick={() => go('partner')}>{t('navPartner')}</button>
          <button onClick={() => go('admin')}>{t('navAdmin')}</button>
        </div>
      </footer>

      <nav className="tabbar" aria-label="Main">
        <button className={'tabbar-btn' + (view.name === 'home' ? ' active' : '')} onClick={() => go('home')}>
          <span className="tabbar-icon">⌂</span><span>{t('tabHome')}</span>
        </button>
        <button className={'tabbar-btn' + (view.name === 'category' ? ' active' : '')} onClick={() => go('category', { category: 'ALL' })}>
          <span className="tabbar-icon">▦</span><span>{t('tabCategory')}</span>
        </button>
        <button className={'tabbar-btn' + (view.name === 'map' ? ' active' : '')} onClick={() => go('map')}>
          <span className="tabbar-icon">◎</span><span>{t('tabMap')}</span>
        </button>
        <button className={'tabbar-btn' + (view.name === 'bookings' ? ' active' : '')} onClick={() => go('bookings')}>
          <span className="tabbar-icon">▤</span><span>{t('tabBookings')}</span>
        </button>
        <button className={'tabbar-btn' + (view.name === 'points' ? ' active' : '')} onClick={() => go('points')}>
          <span className="tabbar-icon">○</span><span>{t('tabMy')}</span>
        </button>
      </nav>
    </div>
  );
}
