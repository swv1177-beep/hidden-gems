// DB 어댑터 — 테스트 모드 전용 검증용 앱 (실결제·실공급자 연동 없음).
// DATABASE_URL이 있으면 실제 Postgres(Render), 없으면 pg-mem(로컬 검증 전용).
// SQL은 양쪽에서 도는 표준 SQL만 사용한다.
const { Pool } = require('pg');

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5, // Render 무료 512MB RAM
  });
} else {
  const { newDb } = require('pg-mem');
  const db = newDb();
  const pgMem = db.adapters.createPg();
  pool = new pgMem.Pool();
}

module.exports = { pool };
