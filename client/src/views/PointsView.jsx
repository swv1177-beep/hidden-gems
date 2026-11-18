import { useState } from 'react';
import { api } from '../api.js';

export default function PointsView({ t }) {
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
