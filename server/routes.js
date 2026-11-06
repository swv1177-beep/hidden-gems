// Bapsang 검증용 API 라우터 — 전부 테스트 모드 (실결제·실공급자 연동 없음).
// 카드번호 전체는 절대 저장하지 않고 마지막 4자리만 저장한다.
// 모든 금액은 서버에서 재계산한다. 클라이언트가 보낸 금액은 무시한다.
const express = require('express');
const { pool } = require('./db');
const { ensureStayRow, fmtDate, todayStr, addDays } = require('./schema');
const { translateEnabled, translateTextViaDeepL } = require('./translate');

const router = express.Router();

// ---------- 공통 헬퍼 ----------

function productOut(row, bookingCount) {
  return {
    slug: row.slug,
    nameKo: row.name_ko,
    nameEn: row.name_en,
    priceKrw: row.price_krw,
    onsitePriceKrw: row.onsite_price_krw,
    areaKo: row.area_ko,
    areaEn: row.area_en,
    city: row.city,
    category: row.category,
    subcategory: row.subcategory,
    unit: row.unit,
    rating: Number(row.rating),
    reviewCount: row.review_count,
    reviewKo: row.review_ko,
    reviewEn: row.review_en,
    lat: Number(row.lat),
    lng: Number(row.lng),
    localRegular: row.local_regular,
    isSample: row.is_sample,
    isMeterTaxi: row.is_meter_taxi,
    supplierNameKo: row.supplier_ko,
    supplierNameEn: row.supplier_en,
    bookingCount: bookingCount != null ? bookingCount : 0,
  };
}

async function bookingCounts() {
  const { rows } = await pool.query(
    "SELECT product_slug, COUNT(*)::int AS c FROM bookings WHERE status <> 'cancelled' GROUP BY product_slug"
  );
  const map = {};
  for (const r of rows) map[r.product_slug] = r.c;
  return map;
}

async function getProduct(slug) {
  const { rows } = await pool.query('SELECT * FROM products WHERE slug = $1', [slug]);
  return rows[0] || null;
}

async function productWithCount(slug) {
  const p = await getProduct(slug);
  if (!p) return null;
  const counts = await bookingCounts();
  return productOut(p, counts[slug] || 0);
}

function bookingOut(row, product) {
  const out = {
    id: row.id,
    code: row.code,
    productSlug: row.product_slug,
    email: row.email,
    name: row.name,
    quantity: row.quantity,
    nights: row.nights,
    date: row.stay_date ? fmtDate(row.stay_date) : null,
    totalKrw: row.total_krw,
    status: row.status,
    paymentStatus: row.payment_status,
    visitCode: row.visit_code,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
  };
  if (product) out.product = product;
  return out;
}

function randomCode(prefix, len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return prefix + s;
}

async function findBooking(code) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE code = $1', [code]);
  return rows[0] || null;
}

// 숙박 재고 차감/복원 (결제 승인 시 차감, 취소 시 복원)
async function applyStayDelta(booking, delta) {
  const p = await getProduct(booking.product_slug);
  if (!p || p.unit !== 'NIGHT') return;
  for (let i = 0; i < booking.nights; i++) {
    const d = addDays(fmtDate(booking.stay_date), i);
    await ensureStayRow(booking.product_slug, d);
    await pool.query(
      'UPDATE stay_inventory SET booked_rooms = booked_rooms + $1 WHERE product_slug = $2 AND stay_date = $3',
      [delta, booking.product_slug, d]
    );
  }
}

async function checkStayAvailability(booking) {
  const p = await getProduct(booking.product_slug);
  if (!p || p.unit !== 'NIGHT') return true;
  for (let i = 0; i < booking.nights; i++) {
    const d = addDays(fmtDate(booking.stay_date), i);
    await ensureStayRow(booking.product_slug, d);
    const { rows } = await pool.query(
      'SELECT total_rooms, booked_rooms FROM stay_inventory WHERE product_slug = $1 AND stay_date = $2',
      [booking.product_slug, d]
    );
    if (!rows[0] || rows[0].total_rooms - rows[0].booked_rooms < booking.quantity) return false;
  }
  return true;
}

async function cancelBooking(booking) {
  if (booking.status === 'completed') return { error: 'cannot_cancel_completed' };
  if (booking.status === 'cancelled') return { error: 'already_cancelled' };
  if (booking.status === 'confirmed' && booking.payment_status === 'paid') {
    await pool.query("UPDATE payments SET status = 'refunded' WHERE booking_code = $1 AND status = 'paid'", [booking.code]);
    await pool.query("UPDATE bookings SET status = 'cancelled', payment_status = 'refunded' WHERE code = $1", [booking.code]);
    await applyStayDelta(booking, -booking.quantity);
  } else {
    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE code = $1", [booking.code]);
  }
  return { ok: true };
}

// 한국 사업자등록번호 체크섬 (숫자 10자리)
function validBusinessNumber(num) {
  const digits = String(num || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits)) return false;
  const key = [1, 3, 7, 1, 3, 7, 1, 3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(digits[i]) * key[i];
  sum += Math.floor((Number(digits[8]) * 5) / 10) + (Number(digits[8]) * 5) % 10;
  return (10 - (sum % 10)) % 10 === Number(digits[9]);
}

const URGENT_KEYWORDS = ['긴급', 'urgent', '응급', '도와주세요', 'emergency', 'help'];
function isUrgent(text) {
  const t = String(text || '').toLowerCase();
  return URGENT_KEYWORDS.some((k) => t.includes(k.toLowerCase()));
}

// ---------- 카탈로그/검색 ----------

router.get('/catalog', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products ORDER BY slug');
    const counts = await bookingCounts();
    const catalog = req.app.locals.catalog || {};
    res.json({
      products: rows.map((r) => productOut(r, counts[r.slug] || 0)),
      fareRoutes: catalog.fareRoutes || [],
      krwPerUsd: catalog.krwPerUsd || 1350,
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').toLowerCase();
  const city = String(req.query.city || '').toUpperCase();
  const category = String(req.query.category || '').toUpperCase();
  const { rows } = await pool.query('SELECT * FROM products ORDER BY slug');
  const counts = await bookingCounts();
  const filtered = rows.filter((r) => {
    if (city && r.city !== city) return false;
    if (category && r.category !== category) return false;
    if (q) {
      const hay = `${r.name_ko} ${r.name_en} ${r.area_ko} ${r.area_en}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  res.json({ products: filtered.map((r) => productOut(r, counts[r.slug] || 0)) });
});

// 동네 칩용 지역 목록 (카탈로그의 고유 지역 목록 — 지도 폴백 기준점용)
router.get('/areas', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT DISTINCT area_ko, area_en, city, lat, lng FROM products ORDER BY area_ko'
  );
  res.json({
    areas: rows.map((r) => ({
      areaKo: r.area_ko, areaEn: r.area_en, city: r.city,
      lat: Number(r.lat), lng: Number(r.lng),
    })),
  });
});

// ---------- 주변 상점 (카카오맵 카테고리 검색, 서버 프록시) ----------
// 정책: 카카오 검색 결과는 저장하지 않고 요청 때마다 실시간으로만 조회한다.
// (이름·주소·좌표 DB 저장 금지 — 장소 ID와 place_url만 예외적으로 보관 가능)
// 키는 서버 환경변수 KAKAO_REST_API_KEY에만 두고 클라이언트에는 노출하지 않는다.
const NEARBY_CATEGORIES = ['FD6', 'CE7', 'CS2']; // 음식점, 카페, 편의점

async function kakaoCategorySearch(code, lat, lng, radius) {
  const url = 'https://dapi.kakao.com/v2/local/search/category.json'
    + `?category_group_code=${code}&x=${encodeURIComponent(lng)}&y=${encodeURIComponent(lat)}`
    + `&radius=${radius}&sort=distance&size=15&page=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `KakaoAK ${process.env.KAKAO_REST_API_KEY}` },
      signal: ctrl.signal,
    });
    if (res.status === 401 || res.status === 403) {
      const e = new Error('kakao_auth_failed');
      e.status = 401;
      throw e;
    }
    if (res.status === 429) {
      const e = new Error('kakao_rate_limited');
      e.status = 429;
      throw e;
    }
    if (!res.ok) {
      const e = new Error('kakao_error');
      e.status = 502;
      throw e;
    }
    return (await res.json()).documents || [];
  } finally {
    clearTimeout(timer);
  }
}

router.get('/nearby', async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'invalid_location' });
  }
  const radius = Math.min(20000, Math.max(100, Number(req.query.radius) || 1000));
  if (!process.env.KAKAO_REST_API_KEY) {
    return res.status(503).json({ error: 'kakao_key_missing' });
  }
  try {
    const lists = await Promise.all(
      NEARBY_CATEGORIES.map((c) => kakaoCategorySearch(c, lat, lng, radius))
    );
    const seen = new Set();
    const shops = [];
    for (const doc of lists.flat()) {
      if (!doc.id || seen.has(doc.id)) continue;
      seen.add(doc.id);
      shops.push({
        id: doc.id,
        name: doc.place_name,
        category: doc.category_group_name || '',
        categoryDetail: (doc.category_name || '').split(' > ').pop() || '',
        address: doc.road_address_name || doc.address_name || '',
        lat: Number(doc.y),
        lng: Number(doc.x),
        distance: doc.distance != null ? Number(doc.distance) : null,
        placeUrl: doc.place_url || '',
      });
    }
    shops.sort((a, b) => (a.distance ?? 1e9) - (b.distance ?? 1e9));
    res.json({ shops: shops.slice(0, 20), source: 'kakaomap', radius });
  } catch (e) {
    if (e.status === 401) return res.status(502).json({ error: 'kakao_auth_failed' });
    if (e.status === 429) return res.status(429).json({ error: 'kakao_rate_limited' });
    if (e.name === 'AbortError') return res.status(504).json({ error: 'kakao_timeout' });
    res.status(502).json({ error: 'kakao_error' });
  }
});

// ---------- 예약/결제 (테스트 모드) ----------

router.post('/bookings', async (req, res) => {
  try {
    const { productSlug, quantity, date, nights, email, name } = req.body || {};
    const p = await getProduct(productSlug);
    if (!p) return res.status(404).json({ error: 'product_not_found' });
    const qty = quantity != null ? Number(quantity) : (p.unit === 'SONG' ? 10 : 1);
    if (!Number.isFinite(qty) || qty < 1) return res.status(400).json({ error: 'invalid_quantity' });
    const n = p.unit === 'NIGHT' ? (nights != null ? Number(nights) : 1) : 1;
    if (p.unit === 'NIGHT') {
      if (!date) return res.status(400).json({ error: 'date_required' });
      if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'invalid_nights' });
    }
    // 금액은 서버에서 재계산 (클라이언트 금액 무시)
    const totalKrw = p.price_krw * qty * (p.unit === 'NIGHT' ? n : 1);

    const booking = {
      product_slug: p.slug, email: email || null, name: name || null,
      quantity: qty, nights: n, stay_date: p.unit === 'NIGHT' ? date : null,
      total_krw: totalKrw,
    };
    if (p.unit === 'NIGHT') {
      const ok = await checkStayAvailability(booking);
      if (!ok) return res.status(400).json({ error: 'sold_out' });
    }
    // 코드 유니크 재시도
    let code, visitCode;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = randomCode('KF-', 6);
      visitCode = randomCode('VC-', 4);
      try {
        const { rows } = await pool.query(
          `INSERT INTO bookings (code, product_slug, email, name, quantity, nights, stay_date,
             total_krw, status, payment_status, visit_code)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'requested','unpaid',$9) RETURNING *`,
          [code, booking.product_slug, booking.email, booking.name, booking.quantity,
           booking.nights, booking.stay_date, booking.total_krw, visitCode]
        );
        return res.status(201).json({ booking: bookingOut(rows[0], productOut(p, 0)), testMode: true });
      } catch (e) {
        if (e.code !== '23505') throw e;
      }
    }
    return res.status(500).json({ error: 'server_error' });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/bookings/:code/pay', async (req, res) => {
  try {
    const booking = await findBooking(req.params.code);
    if (!booking) return res.status(404).json({ error: 'booking_not_found' });
    if (booking.status !== 'requested') return res.status(400).json({ error: 'not_payable' });
    const digits = String((req.body || {}).cardNumber || '').replace(/\D/g, '');
    if (digits.length < 4) return res.status(400).json({ error: 'invalid_card' });
    const last4 = digits.slice(-4);
    // 테스트 카드 거절 규칙: 마지막 4자리가 0002면 거절 (상태 변경 없음)
    if (last4 === '0002') return res.json({ ok: false, error: 'card_declined', testMode: true });
    if (!(await checkStayAvailability(booking))) {
      return res.json({ ok: false, error: 'sold_out', testMode: true });
    }
    // 테스트 모드 승인: 카드번호 전체는 저장하지 않고 마지막 4자리만 저장
    await pool.query(
      'INSERT INTO payments (booking_code, amount_krw, last4, status, test_mode) VALUES ($1,$2,$3,$4,true)',
      [booking.code, booking.total_krw, last4, 'paid']
    );
    await pool.query(
      "UPDATE bookings SET status = 'confirmed', payment_status = 'paid', confirmed_at = now() WHERE code = $1",
      [booking.code]
    );
    await applyStayDelta(booking, booking.quantity);
    const updated = await findBooking(booking.code);
    const product = await productWithCount(booking.product_slug);
    res.json({ ok: true, booking: bookingOut(updated, product), testMode: true });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/bookings/:code/cancel', async (req, res) => {
  const booking = await findBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: 'booking_not_found' });
  const result = await cancelBooking(booking);
  if (result.error) return res.status(400).json({ error: result.error });
  const updated = await findBooking(booking.code);
  const product = await productWithCount(booking.product_slug);
  res.json({ ok: true, booking: bookingOut(updated, product), testMode: true });
});

router.get('/bookings', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'email_required' });
  const { rows } = await pool.query(
    'SELECT * FROM bookings WHERE email = $1 ORDER BY id DESC', [email]
  );
  const out = [];
  for (const r of rows) out.push(bookingOut(r, await productWithCount(r.product_slug)));
  res.json({ bookings: out, testMode: true });
});

router.get('/bookings/:code', async (req, res) => {
  const booking = await findBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: 'booking_not_found' });
  res.json({ booking: bookingOut(booking, await productWithCount(booking.product_slug)), testMode: true });
});

// ---------- 숙박 재고 ----------

router.get('/stay/availability', async (req, res) => {
  const productSlug = req.query.productSlug;
  const from = req.query.from ? fmtDate(req.query.from) : todayStr();
  const to = req.query.to ? fmtDate(req.query.to) : addDays(from, 13);
  if (!productSlug) return res.status(400).json({ error: 'product_required' });
  const p = await getProduct(productSlug);
  if (!p) return res.status(404).json({ error: 'product_not_found' });
  const out = [];
  let d = from;
  while (d <= to) {
    await ensureStayRow(productSlug, d);
    const { rows } = await pool.query(
      'SELECT total_rooms, booked_rooms FROM stay_inventory WHERE product_slug = $1 AND stay_date = $2',
      [productSlug, d]
    );
    const r = rows[0];
    out.push({
      date: d,
      totalRooms: r.total_rooms,
      bookedRooms: r.booked_rooms,
      remaining: r.total_rooms - r.booked_rooms,
    });
    d = addDays(d, 1);
  }
  res.json(out);
});

router.post('/admin/inventory', async (req, res) => {
  const { productSlug, date, totalRooms } = req.body || {};
  if (!productSlug || !date || totalRooms == null) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  const d = fmtDate(date);
  await ensureStayRow(productSlug, d);
  const { rows } = await pool.query(
    'SELECT booked_rooms FROM stay_inventory WHERE product_slug = $1 AND stay_date = $2',
    [productSlug, d]
  );
  if (rows[0] && Number(totalRooms) < rows[0].booked_rooms) {
    return res.status(400).json({ error: 'total_below_booked' });
  }
  await pool.query(
    'UPDATE stay_inventory SET total_rooms = $1 WHERE product_slug = $2 AND stay_date = $3',
    [Number(totalRooms), productSlug, d]
  );
  res.json({ ok: true, testMode: true });
});

// ---------- 후기/포인트 ----------

async function creditReviewPoints(booking) {
  const base = Math.floor(booking.total_krw * 0.01);
  const bonus = 100;
  await pool.query(
    'INSERT INTO point_ledger (email, booking_code, points, kind) VALUES ($1,$2,$3,$4)',
    [booking.email, booking.code, base, 'review_base']
  );
  await pool.query(
    'INSERT INTO point_ledger (email, booking_code, points, kind) VALUES ($1,$2,$3,$4)',
    [booking.email, booking.code, bonus, 'review_bonus']
  );
  return base + bonus;
}

router.post('/reviews', async (req, res) => {
  try {
    const { bookingCode, visitCode, rating, text } = req.body || {};
    const booking = await findBooking(bookingCode);
    if (!booking) return res.status(404).json({ error: 'booking_not_found' });
    if (booking.status !== 'completed') {
      return res.status(400).json({ error: 'booking_not_completed' });
    }
    if (booking.visit_code !== visitCode) {
      return res.status(400).json({ error: 'visit_code_mismatch' });
    }
    const existing = await pool.query(
      'SELECT id FROM reviews WHERE booking_code = $1', [bookingCode]
    );
    if (existing.rows.length) return res.status(400).json({ error: 'already_reviewed' });
    const { rows } = await pool.query(
      'INSERT INTO reviews (booking_code, rating, text, verified) VALUES ($1,$2,$3,true) RETURNING *',
      [bookingCode, Number(rating) || 5, text || '']
    );
    const points = await creditReviewPoints(booking);
    res.status(201).json({
      ok: true, review: { id: rows[0].id, bookingCode, rating: rows[0].rating, verified: true },
      points, testMode: true,
    });
  } catch (e) {
    res.status(500).json({ error: 'server_error' });
  }
});

router.post('/reviews/:id/reverify', async (req, res) => {
  // 방어용: 미검증 후기가 있을 때만 코드 확인 후 검증 + 소급 적립
  const { rows } = await pool.query('SELECT * FROM reviews WHERE id = $1', [req.params.id]);
  const review = rows[0];
  if (!review) return res.status(404).json({ error: 'review_not_found' });
  if (review.verified) return res.status(400).json({ error: 'already_verified' });
  const booking = await findBooking(review.booking_code);
  if (!booking || booking.visit_code !== (req.body || {}).visitCode) {
    return res.status(400).json({ error: 'visit_code_mismatch' });
  }
  await pool.query('UPDATE reviews SET verified = true WHERE id = $1', [review.id]);
  const points = await creditReviewPoints(booking);
  res.json({ ok: true, points, testMode: true });
});

router.get('/points', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'email_required' });
  const { rows } = await pool.query(
    'SELECT * FROM point_ledger WHERE email = $1 ORDER BY id DESC', [email]
  );
  const balance = rows.reduce((s, r) => s + r.points, 0);
  res.json({
    balance,
    ledger: rows.map((r) => ({
      id: r.id, email: r.email, bookingCode: r.booking_code,
      points: r.points, kind: r.kind,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    })),
  });
});

// ---------- 로컬 메이트 (예약 확정 후 7일간) ----------

function mateReply(message, booking) {
  const t = String(message || '');
  if (isUrgent(t)) {
    return { reply: '긴급 요청을 접수했습니다. 1분 이내 응답 목표로 담당 메이트가 연락드립니다. (테스트 모드)', urgent: true };
  }
  if (/예약|확인|조회/.test(t)) {
    return { reply: `예약 ${booking.code}은(는) ${booking.status === 'confirmed' ? '확정' : booking.status} 상태입니다. 테스트 모드 예약입니다.`, urgent: false };
  }
  if (/변경/.test(t)) return { reply: '예약 변경은 내 예약 화면에서 취소 후 새로 예약해 주세요. 테스트 모드에서는 실제 변경 수수료가 없습니다.', urgent: false };
  if (/취소|환불/.test(t)) return { reply: '예약 취소는 내 예약 화면에서 가능합니다. 테스트 모드에서는 실제 환불이 발생하지 않습니다.', urgent: false };
  if (/결제|카드/.test(t)) return { reply: '결제는 테스트 모드로 진행됩니다. 실제 카드 청구가 발생하지 않으며, 카드번호는 마지막 4자리만 저장됩니다.', urgent: false };
  if (/이용|어떻게|방법|입장/.test(t)) return { reply: '이용 당일 예약 코드와 방문 코드를 현장에서 제시해 주세요. 테스트 모드 예약입니다.', urgent: false };
  if (/술집|예절|매너|음주/.test(t)) return { reply: '술집 이용 시 현지 예절: 자리에서 큰 소리로 떠들지 않고, 일행 전원이 주문하는 것이 일반적입니다. 과음은 피해 주세요.', urgent: false };
  return { reply: '메시지를 받았습니다. 예약·결제·이용 방법에 대해 물어보시면 안내해 드릴게요. (테스트 모드)', urgent: false };
}

router.post('/mate/messages', async (req, res) => {
  const { bookingCode, message } = req.body || {};
  const booking = await findBooking(bookingCode);
  if (!booking) return res.status(404).json({ error: 'booking_not_found' });
  const confirmedAt = booking.confirmed_at ? new Date(booking.confirmed_at) : null;
  const expired = !confirmedAt || Date.now() - confirmedAt.getTime() > 7 * 24 * 3600 * 1000;
  if (booking.status !== 'confirmed' || expired) {
    return res.status(400).json({ error: 'mate_window_closed' });
  }
  const { reply, urgent } = mateReply(message, booking);
  await pool.query(
    'INSERT INTO mate_messages (booking_code, sender, message) VALUES ($1,$2,$3)',
    [bookingCode, 'user', message || '']
  );
  await pool.query(
    'INSERT INTO mate_messages (booking_code, sender, message) VALUES ($1,$2,$3)',
    [bookingCode, 'mate', reply]
  );
  res.json({ ok: true, reply, urgent, testMode: true });
});

router.get('/mate/:code', async (req, res) => {
  const booking = await findBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: 'booking_not_found' });
  const confirmedAt = booking.confirmed_at ? new Date(booking.confirmed_at) : null;
  const expiresAt = confirmedAt ? new Date(confirmedAt.getTime() + 7 * 24 * 3600 * 1000) : null;
  const active = booking.status === 'confirmed' && expiresAt && Date.now() <= expiresAt.getTime();
  const { rows } = await pool.query(
    'SELECT * FROM mate_messages WHERE booking_code = $1 ORDER BY id', [req.params.code]
  );
  res.json({
    messages: rows.map((r) => ({
      id: r.id, sender: r.sender, message: r.message,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    })),
    active: !!active,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    testMode: true,
  });
});

// ---------- 사업자↔외국인 AI 번역 채팅 (예약별 스레드) ----------
// 손님 측(내 예약)과 사장님 측(관리자 콘솔)이 같은 예약 코드로 대화한다.
// 번역은 서버에서 DeepL로 수행한다. DEEPL_API_KEY 미설정 시 번역 없이 원문만
// 저장·표시되고 채팅 자체는 계속 동작한다. 빠른 답장은 클라이언트 사전 번역이라
// 키 없이도 번역되어 보인다. 번역 실패(한도 소진·인증 실패·타임아웃)도 원문 폴백.

const OWNER_CHAT_LANGS = ['en', 'ko', 'ja', 'zh-CN', 'zh-TW', 'zh-HK', 'es'];

async function customerLangOf(bookingCode) {
  const { rows } = await pool.query(
    "SELECT sender_lang FROM owner_messages WHERE booking_code = $1 AND sender = 'user' ORDER BY id DESC LIMIT 1",
    [bookingCode]
  );
  const lang = rows[0] && rows[0].sender_lang;
  return OWNER_CHAT_LANGS.includes(lang) ? lang : 'en';
}

function ownerMessageOut(r) {
  return {
    id: r.id,
    sender: r.sender,
    message: r.message,
    senderLang: r.sender_lang,
    translatedMessage: r.translated_message,
    translatedLang: r.translated_lang,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
  };
}

router.post('/owner-chat/messages', async (req, res) => {
  const { bookingCode, message, lang, sender } = req.body || {};
  const booking = await findBooking(bookingCode);
  if (!booking) return res.status(404).json({ error: 'booking_not_found' });
  if (booking.status !== 'confirmed') {
    return res.status(400).json({ error: 'owner_chat_closed' });
  }
  const text = String(message || '').trim();
  if (!text || text.length > 1000) {
    return res.status(400).json({ error: 'invalid_message' });
  }
  const from = sender === 'owner' ? 'owner' : 'user';
  const senderLang = OWNER_CHAT_LANGS.includes(lang)
    ? lang
    : (from === 'owner' ? 'ko' : 'en');
  const targetLang = from === 'user' ? 'ko' : await customerLangOf(bookingCode);
  let translated = null;
  if (senderLang === targetLang) {
    translated = text;
  } else {
    translated = await translateTextViaDeepL(text, targetLang);
  }
  const { rows } = await pool.query(
    `INSERT INTO owner_messages (booking_code, sender, message, sender_lang, translated_message, translated_lang)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [bookingCode, from, text, senderLang, translated, translated ? targetLang : null]
  );
  res.json({
    ok: true,
    message: ownerMessageOut(rows[0]),
    translateEnabled: translateEnabled(),
    testMode: true,
  });
});

router.get('/owner-chat/:code', async (req, res) => {
  const booking = await findBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: 'booking_not_found' });
  const { rows } = await pool.query(
    'SELECT * FROM owner_messages WHERE booking_code = $1 ORDER BY id', [req.params.code]
  );
  res.json({
    messages: rows.map(ownerMessageOut),
    active: booking.status === 'confirmed',
    customerLang: await customerLangOf(req.params.code),
    translateEnabled: translateEnabled(),
    testMode: true,
  });
});

// ---------- 공급자/관리자 (관리자 인증 없음 — 테스트용, 실서비스 전 보호 필수) ----------

router.post('/partners', async (req, res) => {
  const { businessName, businessNumber, email, category } = req.body || {};
  if (!businessName || !businessNumber || !email || !category) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  if (!validBusinessNumber(businessNumber)) {
    return res.status(400).json({ error: 'invalid_business_number' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'invalid_email' });
  }
  const { rows } = await pool.query(
    `INSERT INTO partner_applications (business_name, business_number, email, category, status)
     VALUES ($1,$2,$3,$4,'pending') RETURNING *`,
    [businessName, String(businessNumber).replace(/\D/g, ''), email, category]
  );
  const r = rows[0];
  res.status(201).json({
    application: {
      id: r.id, businessName: r.business_name, businessNumber: r.business_number,
      email: r.email, category: r.category, status: r.status,
    },
    testMode: true,
  });
});

router.get('/admin/partners', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM partner_applications ORDER BY id DESC');
  res.json({
    partners: rows.map((r) => ({
      id: r.id, businessName: r.business_name, businessNumber: r.business_number,
      email: r.email, category: r.category, status: r.status,
    })),
    testMode: true,
  });
});

router.post('/admin/partners/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'invalid_status' });
  }
  const { rows } = await pool.query(
    'UPDATE partner_applications SET status = $1 WHERE id = $2 RETURNING *', [status, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'application_not_found' });
  res.json({ ok: true, status: rows[0].status, testMode: true });
});

router.get('/admin/overview', async (req, res) => {
  const byStatus = await pool.query(
    'SELECT status, COUNT(*)::int AS c FROM bookings GROUP BY status'
  );
  const bookingsByStatus = {};
  for (const r of byStatus.rows) bookingsByStatus[r.status] = r.c;
  const revenue = await pool.query(
    "SELECT COALESCE(SUM(amount_krw),0)::int AS s FROM payments WHERE status = 'paid'"
  );
  const pending = await pool.query(
    "SELECT COUNT(*)::int AS c FROM partner_applications WHERE status = 'pending'"
  );
  const reviewCount = await pool.query('SELECT COUNT(*)::int AS c FROM reviews');
  const points = await pool.query('SELECT COALESCE(SUM(points),0)::int AS s FROM point_ledger');
  res.json({
    bookingsByStatus,
    paidRevenue: revenue.rows[0].s,
    pendingApplications: pending.rows[0].c,
    reviewCount: reviewCount.rows[0].c,
    pointsIssued: points.rows[0].s,
    testMode: true,
  });
});

router.get('/admin/bookings', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM bookings ORDER BY id DESC');
  const chatCounts = await pool.query(
    'SELECT booking_code, COUNT(*)::int AS c FROM owner_messages GROUP BY booking_code'
  );
  const chatMap = {};
  for (const r of chatCounts.rows) chatMap[r.booking_code] = r.c;
  const out = [];
  for (const r of rows) {
    const b = bookingOut(r, await productWithCount(r.product_slug));
    b.chatCount = chatMap[r.code] || 0;
    out.push(b);
  }
  res.json({ bookings: out, testMode: true });
});

router.get('/admin/payments', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM payments ORDER BY id DESC');
  res.json({
    payments: rows.map((r) => ({
      id: r.id, bookingCode: r.booking_code, amountKrw: r.amount_krw,
      last4: r.last4, status: r.status, testMode: r.test_mode,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    })),
    testMode: true,
  });
});

router.post('/admin/bookings/:code/complete', async (req, res) => {
  const booking = await findBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: 'booking_not_found' });
  if (booking.status !== 'confirmed') return res.status(400).json({ error: 'not_completable' });
  await pool.query("UPDATE bookings SET status = 'completed' WHERE code = $1", [booking.code]);
  const updated = await findBooking(booking.code);
  res.json({ ok: true, booking: bookingOut(updated, await productWithCount(booking.product_slug)), testMode: true });
});

router.post('/admin/bookings/:code/confirm', async (req, res) => {
  const booking = await findBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: 'booking_not_found' });
  if (booking.status !== 'requested') return res.status(400).json({ error: 'not_confirmable' });
  if (!(await checkStayAvailability(booking))) {
    return res.status(400).json({ error: 'sold_out' });
  }
  await pool.query(
    "UPDATE bookings SET status = 'confirmed', confirmed_at = now() WHERE code = $1", [booking.code]
  );
  await applyStayDelta(booking, booking.quantity); // STAY면 방 차감, 결제 없음
  const updated = await findBooking(booking.code);
  res.json({ ok: true, booking: bookingOut(updated, await productWithCount(booking.product_slug)), testMode: true });
});

router.post('/admin/bookings/:code/cancel', async (req, res) => {
  const booking = await findBooking(req.params.code);
  if (!booking) return res.status(404).json({ error: 'booking_not_found' });
  const result = await cancelBooking(booking);
  if (result.error) return res.status(400).json({ error: result.error });
  const updated = await findBooking(booking.code);
  res.json({ ok: true, booking: bookingOut(updated, await productWithCount(booking.product_slug)), testMode: true });
});

// ---------- AI (규칙 기반, 실제 모델 연동 없음) ----------

const TASTE_MAP = {
  local: 'DAILY', food: 'FOOD', kbeauty: 'KBEAUTY', nightlife: 'PUB',
  kpop: 'KPOP', kdrama: 'KDRAMA', shopping: 'DAILY', sightseeing: 'SIGHTSEEING',
};
const SLOT_TIMES = ['09:30', '12:00', '14:30', '17:00', '19:30'];

router.post('/itinerary', async (req, res) => {
  const { tastes = [], city } = req.body || {};
  const wantedCity = String(city || '').toUpperCase();
  const categories = [];
  for (const t of tastes) {
    const c = TASTE_MAP[String(t).toLowerCase()];
    if (c && !categories.includes(c)) categories.push(c);
  }
  const { rows } = await pool.query('SELECT * FROM products ORDER BY review_count DESC');
  const used = new Set();
  const pick = (category, preferCity) => {
    const poolCity = rows.filter((r) => r.category === category && !used.has(r.slug) && (!preferCity || r.city === preferCity));
    const p = poolCity[0] || rows.find((r) => r.category === category && !used.has(r.slug));
    if (p) used.add(p.slug);
    return p;
  };
  const chosen = [];
  for (const c of categories) {
    const p = pick(c, wantedCity);
    if (p) chosen.push(p);
  }
  // 5슬롯 채우기: 요청 도시 우선, 그 외 인기순
  while (chosen.length < 5) {
    const p = rows.find((r) => !used.has(r.slug) && (!wantedCity || r.city === wantedCity))
      || rows.find((r) => !used.has(r.slug));
    if (!p) break;
    used.add(p.slug);
    chosen.push(p);
  }
  const slots = chosen.slice(0, 5).map((p, i) => ({
    time: SLOT_TIMES[i],
    productSlug: p.slug,
    nameKo: p.name_ko,
    nameEn: p.name_en,
    priceKrw: p.price_krw,
  }));
  res.json({
    slots,
    totalKrw: slots.reduce((s, x) => s + x.priceKrw, 0),
    testMode: true,
  });
});

const CHAT_QUICK_REPLIES = ['예약 조회', '예약 변경', '예약 취소', '결제 문의', '이용 방법'];

function chatbotReply(message) {
  const t = String(message || '');
  if (isUrgent(t)) {
    return { reply: '긴급 요청을 접수했습니다. 1분 이내 응답 목표로 상담원이 연락드립니다. (테스트 모드)', urgent: true, intent: 'urgent' };
  }
  if (/조회|내 예약|확인/.test(t)) return { reply: '예약 조회는 내 예약 화면에서 이메일로 조회할 수 있습니다. 예약 코드(KF-xxxxxx)를 알려주시면 확인해 드릴게요.', urgent: false, intent: 'booking_lookup' };
  if (/변경/.test(t)) return { reply: '예약 변경은 기존 예약을 취소한 뒤 새로 예약해 주세요. 테스트 모드에서는 변경 수수료가 없습니다.', urgent: false, intent: 'booking_change' };
  if (/취소|환불/.test(t)) return { reply: '예약 취소는 내 예약 화면에서 가능합니다. 결제된 테스트 예약은 취소 시 자동 환불 처리됩니다(실제 청구 없음).', urgent: false, intent: 'booking_cancel' };
  if (/결제|카드/.test(t)) return { reply: '결제는 테스트 모드로 진행되며 실제 청구가 없습니다. 카드번호는 마지막 4자리만 저장됩니다.', urgent: false, intent: 'payment' };
  if (/이용|어떻게|방법|입장|사용/.test(t)) return { reply: '이용 당일 예약 코드와 방문 코드를 현장에서 제시해 주세요. 상품별 이용 안내는 상품 상세 페이지를 확인해 주세요.', urgent: false, intent: 'usage' };
  return { reply: '무엇을 도와드릴까요? 예약 조회·변경·취소·결제·이용 방법에 대해 물어보실 수 있습니다. (테스트 모드)', urgent: false, intent: 'other' };
}

router.post('/chatbot', (req, res) => {
  const { reply, urgent, intent } = chatbotReply((req.body || {}).message);
  res.json({ reply, urgent, intent, quickReplies: CHAT_QUICK_REPLIES, testMode: true });
});

const SEARCH_TERM_MAP = {
  FOOD: '한식 바비큐 세트',
  DAILY: '찜질방 사우나',
  PUB: '을지로 포차',
  KBEAUTY: '헤어 펌',
};

router.get('/recommendations', async (req, res) => {
  const viewed = String(req.query.viewed || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  const email = req.query.email;
  const cats = [...viewed];
  if (email) {
    const { rows } = await pool.query(
      "SELECT DISTINCT p.category FROM bookings b JOIN products p ON p.slug = b.product_slug WHERE b.email = $1 AND b.status <> 'cancelled'",
      [email]
    );
    for (const r of rows) if (!cats.includes(r.category)) cats.push(r.category);
  }
  const { rows } = await pool.query('SELECT * FROM products ORDER BY review_count DESC');
  const counts = await bookingCounts();
  let items, reason;
  if (cats.length) {
    items = rows.filter((r) => cats.includes(r.category));
    reason = 'viewed_category';
    if (!items.length) items = rows;
  } else {
    items = rows;
    reason = 'popular';
  }
  const searchTermsKo = cats.map((c) => SEARCH_TERM_MAP[c]).filter(Boolean);
  res.json({
    items: items.slice(0, 10).map((r) => productOut(r, counts[r.slug] || 0)),
    reason,
    searchTermsKo,
    testMode: true,
  });
});

// 소형 번역 사전 (알려진 상품명·문구)
const DICT = {
  '한식 바비큐 세트': { en: 'Korean BBQ Set', ja: '韓国バーベキューセット', 'zh-CN': '韩式烤肉套餐', 'zh-TW': '韓式烤肉套餐', 'zh-HK': '韓式燒烤套餐', es: 'Set de barbacoa coreana' },
  '바비큐 세트': { en: 'BBQ Set', ja: 'バーベキューセット', 'zh-CN': '烤肉套餐', 'zh-TW': '烤肉套餐', 'zh-HK': '燒烤套餐', es: 'Set de barbacoa' },
  '찜질방 사우나': { en: 'Jjimjilbang Sauna', ja: 'チムジルバンサウナ', 'zh-CN': '汗蒸幕桑拿', 'zh-TW': '汗蒸幕三溫暖', 'zh-HK': '汗蒸幕桑拿', es: 'Sauna jjimjilbang' },
  '사우나': { en: 'Sauna', ja: 'サウナ', 'zh-CN': '桑拿', 'zh-TW': '三溫暖', 'zh-HK': '桑拿', es: 'Sauna' },
  '을지로 포차': { en: 'Euljiro Pocha', ja: '乙支路ポチャ', 'zh-CN': '乙支路布帐马车', 'zh-TW': '乙支路布帳馬車', 'zh-HK': '乙支路布帳馬車', es: 'Pocha de Euljiro' },
  '포차': { en: 'Pocha (street bar)', ja: 'ポチャ', 'zh-CN': '布帐马车', 'zh-TW': '布帳馬車', 'zh-HK': '布帳馬車', es: 'Pocha' },
  '헤어 펌': { en: 'Hair Perm', ja: 'ヘアパーマ', 'zh-CN': '烫发', 'zh-TW': '燙髮', 'zh-HK': '燙髮', es: 'Permanente' },
  '카페': { en: 'Cafe', ja: 'カフェ', 'zh-CN': '咖啡馆', 'zh-TW': '咖啡館', 'zh-HK': '咖啡室', es: 'Café' },
  '시장': { en: 'Market', ja: '市場', 'zh-CN': '市场', 'zh-TW': '市場', 'zh-HK': '市場', es: 'Mercado' },
  '코인노래방': { en: 'Coin Karaoke', ja: 'コインカラオケ', 'zh-CN': '投币练歌房', 'zh-TW': '投幣卡拉OK', 'zh-HK': '投幣卡拉OK', es: 'Karaoke de monedas' },
  '한옥': { en: 'Hanok', ja: '韓屋', 'zh-CN': '韩屋', 'zh-TW': '韓屋', 'zh-HK': '韓屋', es: 'Hanok' },
  '안경': { en: 'Glasses', ja: '眼鏡', 'zh-CN': '眼镜', 'zh-TW': '眼鏡', 'zh-HK': '眼鏡', es: 'Gafas' },
  '택시': { en: 'Taxi', ja: 'タクシー', 'zh-CN': '出租车', 'zh-TW': '計程車', 'zh-HK': '的士', es: 'Taxi' },
};

function translateText(text, target) {
  const t = String(text || '');
  if (target === 'ko') return { text: t, fallback: false };
  for (const [ko, map] of Object.entries(DICT)) {
    if (t.includes(ko) && map[target]) return { text: map[target], fallback: false };
  }
  return { text: t, fallback: true };
}

router.post('/translate', (req, res) => {
  const { text, target } = req.body || {};
  const { text: translated, fallback } = translateText(text, target);
  res.json({ text: translated, translated, target: target || 'en', fallback, testMode: true });
});

router.get('/translate/product/:slug', async (req, res) => {
  const target = req.query.target || 'en';
  const p = await getProduct(req.params.slug);
  if (!p) return res.status(404).json({ error: 'product_not_found' });
  if (target === 'ko') {
    return res.json({ text: p.name_ko, translated: p.name_ko, target, fallback: false, testMode: true });
  }
  const { text: translated, fallback } = translateText(p.name_ko, target);
  // 사전에 없으면 영어 원문으로 폴백
  const out = fallback ? p.name_en : translated;
  res.json({ text: out, translated: out, target, fallback, testMode: true });
});

// ---------- 택시 (미터기 기준 추정치, 최종가 아님) ----------

router.get('/taxi/estimate', async (req, res) => {
  const catalog = req.app.locals.catalog || {};
  let distanceKm = Number(req.query.distanceKm);
  let tollKrw = Number(req.query.tollKrw) || 0;
  const type = req.query.type === 'large' ? 'large' : 'standard';
  if (req.query.routeId) {
    const route = (catalog.fareRoutes || []).find((r) => r.id === req.query.routeId);
    if (route) {
      distanceKm = route.distanceKm;
      tollKrw = route.tollKrw;
    }
  }
  if (!Number.isFinite(distanceKm)) {
    return res.status(400).json({ error: 'distance_required' });
  }
  const baseKrw = type === 'large' ? 7000 : 4800;
  const baseKm = type === 'large' ? 3.0 : 1.6;
  const extra = Math.max(0, distanceKm - baseKm);
  const distanceKrw = Math.ceil((extra * 1000) / 100) * 100; // 100원 단위 올림
  const totalKrw = baseKrw + distanceKrw + tollKrw;
  res.json({
    baseKrw,
    distanceKrw,
    tollKrw,
    totalKrw,
    minKrw: Math.round(totalKrw * 0.85),
    maxKrw: Math.round(totalKrw * 1.15),
    note: '미터기 기준 추정치',
    testMode: true,
  });
});

module.exports = router;
