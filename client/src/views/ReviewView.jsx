import { useState } from 'react';
import { api } from '../api.js';

export default function ReviewView({ t, prefillCode, go }) {
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
