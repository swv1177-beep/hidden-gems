import { useState } from 'react';
import { api } from '../api.js';
import { formatMoney } from '../utils.js';

export const TASTE_OPTIONS = [
  ['local', 'tasteLocal'], ['food', 'tasteFood'], ['kbeauty', 'tasteKbeauty'],
  ['nightlife', 'tasteNight'], ['kpop', 'tasteKpop'], ['kdrama', 'tasteKdrama'],
  ['shopping', 'tasteShopping'], ['sightseeing', 'tasteSight']
];

export default function ItineraryView({ t, currency }) {
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
