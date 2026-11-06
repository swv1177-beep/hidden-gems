// 스키마 + Seed (부팅 시, insert-if-empty — 기존 행 절대 덮어쓰지 않음).
// 테스트 모드 전용 검증용 앱 (실결제·실공급자 연동 없음).
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

// 숙박 total_rooms 반복 패턴 (SPEC.md 고정값)
const STAY_PATTERNS = {
  'stay-hanok': [3, 4, 5],
  'stay-jeju-stone': [4, 2, 3],
  'stay-busan-harbor': [12, 13, 11],
};

function fmtDate(d) {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// 패턴 인덱스: 날짜를 에포크 기준 일수로 나눈 나머지로 결정 → 재시작해도 동일 날짜는 동일 패턴.
function patternTotal(slug, dateStr) {
  const pattern = STAY_PATTERNS[slug];
  if (!pattern) return null;
  const days = Math.floor(Date.parse(dateStr + 'T00:00:00Z') / 86400000);
  return pattern[((days % pattern.length) + pattern.length) % pattern.length];
}

async function ensureStayRow(productSlug, dateStr) {
  const total = patternTotal(productSlug, dateStr);
  if (total === null) return;
  await pool.query(
    'INSERT INTO stay_inventory (product_slug, stay_date, total_rooms, booked_rooms) VALUES ($1, $2, $3, 0) ON CONFLICT (product_slug, stay_date) DO NOTHING',
    [productSlug, dateStr, total]
  );
}

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS products (
    slug TEXT PRIMARY KEY, name_ko TEXT, name_en TEXT, price_krw INT,
    onsite_price_krw INT, area_ko TEXT, area_en TEXT, city TEXT, category TEXT,
    subcategory TEXT, unit TEXT, rating NUMERIC, review_count INT,
    review_ko TEXT, review_en TEXT, lat NUMERIC, lng NUMERIC,
    local_regular BOOLEAN, is_sample BOOLEAN, is_meter_taxi BOOLEAN,
    supplier_ko TEXT, supplier_en TEXT
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS stay_inventory (
    product_slug TEXT, stay_date DATE, total_rooms INT, booked_rooms INT,
    PRIMARY KEY (product_slug, stay_date)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS bookings (
    id SERIAL PRIMARY KEY, code TEXT UNIQUE, product_slug TEXT, email TEXT,
    name TEXT, quantity INT, nights INT DEFAULT 1, stay_date DATE,
    total_krw INT, status TEXT, payment_status TEXT, visit_code TEXT,
    confirmed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY, booking_code TEXT, amount_krw INT, last4 TEXT,
    status TEXT, test_mode BOOLEAN DEFAULT true, created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY, booking_code TEXT UNIQUE, rating INT, text TEXT,
    verified BOOLEAN, created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS point_ledger (
    id SERIAL PRIMARY KEY, email TEXT, booking_code TEXT, points INT,
    kind TEXT, created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS mate_messages (
    id SERIAL PRIMARY KEY, booking_code TEXT, sender TEXT, message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS owner_messages (
    id SERIAL PRIMARY KEY, booking_code TEXT, sender TEXT, message TEXT,
    sender_lang TEXT, translated_message TEXT, translated_lang TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS partner_applications (
    id SERIAL PRIMARY KEY, business_name TEXT, business_number TEXT, email TEXT,
    category TEXT, status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now()
  )`);

  // Seed: catalog.json 38개 (insert-if-empty)
  const catalog = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'catalog.json'), 'utf8')
  );
  for (const p of catalog.products) {
    await pool.query(
      `INSERT INTO products (slug, name_ko, name_en, price_krw, onsite_price_krw,
        area_ko, area_en, city, category, subcategory, unit, rating, review_count,
        review_ko, review_en, lat, lng, local_regular, is_sample, is_meter_taxi,
        supplier_ko, supplier_en)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       ON CONFLICT (slug) DO NOTHING`,
      [p.slug, p.nameKo, p.nameEn, p.priceKrw, p.onsitePriceKrw, p.areaKo, p.areaEn,
       p.city, p.category, p.subcategory || null, p.unit, p.rating, p.reviewCount,
       p.reviewKo, p.reviewEn, p.lat, p.lng, p.localRegular, p.isSample, p.isMeterTaxi,
       p.supplierNameKo, p.supplierNameEn]
    );
  }

  // 숙박 재고: 부팅일 기준 다음 14일치 (오늘 포함 14일)
  const today = todayStr();
  for (const slug of Object.keys(STAY_PATTERNS)) {
    for (let i = 0; i < 14; i++) {
      await ensureStayRow(slug, addDays(today, i));
    }
  }
  return catalog;
}

module.exports = { initDb, ensureStayRow, patternTotal, STAY_PATTERNS, fmtDate, todayStr, addDays };
