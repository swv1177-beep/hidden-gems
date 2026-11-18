import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { LANGS, t as tLang } from '../i18n.js';

export const QUICK_REPLIES = ['qr1', 'qr2', 'qr3', 'qr4', 'qr5', 'qr6', 'qr7', 'qr8'];

export default function OwnerChatPanel({ bookingCode, viewer, lang, t }) {
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
