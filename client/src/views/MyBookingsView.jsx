import { useState } from 'react';
import { api } from '../api.js';
import { formatMoney } from '../utils.js';
import { payLabel, statusLabel } from '../components.jsx';
import OwnerChatPanel from './OwnerChat.jsx';

export default function MyBookingsView({ t, currency, products, go, lang }) {
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
