import { useState } from 'react';
import { api } from '../api.js';
import { formatMoney } from '../utils.js';
import { TestBadge } from '../components.jsx';

// Fixed start times for bookable experiences. STAY bookings use the
// check-in time instead, so no slot picker is shown for them.
const TIME_SLOTS = ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00'];

export default function BookingView({ t, currency, product: p, go }) {
  const [step, setStep] = useState('form'); // form | pay | done
  const [qty, setQty] = useState(p && p.unit === 'SONG' ? 10 : 1);
  const [nights, setNights] = useState(1);
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [card, setCard] = useState('');
  const [booking, setBooking] = useState(null);
  const [err, setErr] = useState('');
  const [declined, setDeclined] = useState(false);

  if (!p) return <p>{t('loading')}</p>;
  const total = p.priceKrw * qty * (p.unit === 'NIGHT' ? nights : 1);
  const showSlots = p.unit !== 'NIGHT';

  async function submitBooking(e) {
    e.preventDefault();
    setErr('');
    if (!name || !email) { setErr('requiredFields'); return; }
    if (p.unit === 'NIGHT' && !date) { setErr('requiredFields'); return; }
    try {
      const b = await api.createBooking({
        productSlug: p.slug, quantity: qty, date: date || undefined,
        nights: p.unit === 'NIGHT' ? nights : 1, email, name,
        timeSlot: showSlots && slot ? slot : undefined
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

  function Summary() {
    return (
      <div className="summary-card">
        <h3>{t('summaryTitle')}</h3>
        <div className="summary-row"><span>{p.nameEn || p.nameKo}</span></div>
        <div className="summary-row"><span>{t('priceBreakdown')}</span></div>
        <div className="summary-row">
          <span>{formatMoney(p.priceKrw, currency)} × {qty}{p.unit === 'NIGHT' ? ` × ${nights}` : ''}</span>
          <span>{formatMoney(total, currency)}</span>
        </div>
        <div className="summary-row">
          <span>{t('serviceFee')}</span>
          <span>{formatMoney(0, currency)}</span>
        </div>
        <p className="muted">{t('feeFreeNote')}</p>
        {date && <div className="summary-row"><span>{t('dateLabel')}</span><span>{date}{slot ? ` · ${slot}` : ''}</span></div>}
        <div className="summary-row"><span><b>{t('totalLabel')}</b></span><span><b>{formatMoney(total, currency)}</b></span></div>
      </div>
    );
  }

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
          {!date && <p className="muted">{t('selectDateTime')}</p>}
          {showSlots && (
            <div>
              <label>{t('timeSlotLabel')}</label>
              <div className="slot-chips">
                {TIME_SLOTS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={'slot-chip' + (slot === s ? ' selected' : '')}
                    onClick={() => setSlot(slot === s ? '' : s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label>{t('nameLabel')}
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>{t('emailLabel')}
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <Summary />
          {err && <p className="warn">{t(err)}</p>}
          <button className="btn primary" type="submit">{t('bookBtn')}</button>
        </form>
      )}

      {step === 'pay' && (
        <form onSubmit={submitPay} className="form">
          <h3>{t('payTitle')}</h3>
          <p><TestBadge t={t} /> {t('testModeNote')}</p>
          <Summary />
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
