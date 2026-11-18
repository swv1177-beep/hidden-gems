import { useState } from 'react';
import { api } from '../api.js';
import { CATEGORIES } from '../utils.js';

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

export default function PartnerView({ t }) {
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
