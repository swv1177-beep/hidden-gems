// DeepL 번역 어댑터 — 서버 측에서만 호출한다. 키는 절대 클라이언트에 노출하지 않는다.
// DEEPL_API_KEY 미설정 시 null 반환 → 채팅은 원문으로 동작하고, 빠른 답장(사전 번역)은 그대로 보인다.
// DeepL API Free 키(:fx 접미사)는 api-free.deepl.com, Pro 키는 api.deepl.com을 쓴다.
// 무료 한도 소진 시 456, 인증 실패 시 401/403 → 모두 null로 폴백(채팅 자체는 계속 동작).
const DEEPL_FREE_HOST = 'https://api-free.deepl.com';
const DEEPL_PRO_HOST = 'https://api.deepl.com';

// 앱 UI 언어 코드 → DeepL target_lang. 번체(대만/홍콩)는 DeepL에서 ZH 하나로 처리한다.
const TARGET_MAP = {
  en: 'EN',
  ko: 'KO',
  ja: 'JA',
  'zh-CN': 'ZH',
  'zh-TW': 'ZH',
  'zh-HK': 'ZH',
  es: 'ES',
};

function translateEnabled() {
  return Boolean(process.env.DEEPL_API_KEY);
}

async function translateTextViaDeepL(text, targetLang) {
  const key = process.env.DEEPL_API_KEY;
  if (!key) return null;
  const target = TARGET_MAP[targetLang] || 'EN';
  const host = key.endsWith(':fx') ? DEEPL_FREE_HOST : DEEPL_PRO_HOST;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(`${host}/v2/translate`, {
      method: 'POST',
      headers: {
        Authorization: `DeepL-Auth-Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text: [String(text)], target_lang: target }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const out = data && data.translations && data.translations[0] && data.translations[0].text;
    return typeof out === 'string' && out ? out : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { translateEnabled, translateTextViaDeepL, TARGET_MAP };
