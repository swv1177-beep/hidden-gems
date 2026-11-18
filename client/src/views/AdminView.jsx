import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatMoney } from '../utils.js';
import { payLabel, statusLabel } from '../components.jsx';
import OwnerChatPanel from './OwnerChat.jsx';

export default function AdminView({ t, currency, products }) {
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
