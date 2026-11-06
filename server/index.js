// Bapsang 검증용 앱 서버 — 전부 테스트 모드 (실결제·실공급자 연동 없음).
const express = require('express');
const fs = require('fs');
const path = require('path');
const { initDb } = require('./schema');
const routes = require('./routes');

const app = express();
app.use(express.json());

async function main() {
  const catalog = await initDb();
  app.locals.catalog = catalog;

  app.use('/api', routes);

  // client/dist가 존재하면 정적 서빙 (없어도 API는 동작)
  const distDir = path.join(__dirname, '..', 'client', 'dist');
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api')) return res.status(404).json({ error: 'not_found' });
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Bapsang test server listening on ${PORT} (test mode)`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
