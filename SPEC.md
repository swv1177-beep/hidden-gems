# hidden-gems — SPEC (Render 무료 티어용 독립형 재구축 명세)

원본: Muse 검증용 풀스택 앱 kfair-2의 기능 명세를 새 코드로 재구축한다. 아티팩트 소스는 읽지 않는다.
카탈로그 원본: `catalog.json` (listcatalog 액션 결과 저장본). 상품 38개, 노선 4개, 환율 1350, 패키지 0개.

## 디렉터리 구조

```
hidden-gems/
  catalog.json            # 원본 카탈로그 (seed 입력, 직접 수정 금지)
  SPEC.md                 # 이 파일
  package.json            # 루트: express, pg, pg-mem / scripts: build, start
  render.yaml             # 무료 웹서비스 + 무료 Postgres
  README.md               # 로컬 실행법 + Render 배포 순서
  server/
    index.js              # Express 앱, client/dist 정적 서빙, /api 마운트
    db.js                 # Pool 어댑터 (아래 참조)
    schema.js             # CREATE TABLE IF NOT EXISTS + seed (insert-if-empty)
    routes.js             # 모든 API 엔드포인트 (필요시 파일 분할 가능)
  client/
    package.json          # react, react-dom, vite, @vitejs/plugin-react, leaflet
    vite.config.js        # build outDir: dist, dev proxy /api -> localhost:3000
    index.html
    src/                  # main.jsx, App.jsx, api.js, i18n.js, map.jsx, styles.css 등
```

## DB 어댑터 (server/db.js)

- `DATABASE_URL`이 있으면 실제 Postgres: `new Pool({ connectionString, ssl: { rejectUnauthorized: false }, max: 5 })`
  (Render Postgres는 SSL 필수. 512MB RAM이므로 max 5 이하.)
- 없으면(로컬 검증용) `pg-mem`의 pg 호환 Pool을 쓴다. SQL은 양쪽에서 도는 표준 SQL만 쓴다
  (CREATE TABLE IF NOT EXISTS, INSERT ... ON CONFLICT DO NOTHING, SELECT/UPDATE, 트랜잭션은 단순 쿼리 나열로 대체 가능하면 대체).
- Render에서는 항상 DATABASE_URL이 설정되므로 pg-mem 경로는 로컬 개발/검증 전용임을 README에 명시한다.

## 스키마 (Postgres)

- products(slug PK, name_ko, name_en, price_krw, onsite_price_krw, area_ko, area_en, city, category,
  subcategory NULL, unit, rating, review_count, review_ko, review_en, lat, lng, local_regular BOOL,
  is_sample BOOL, is_meter_taxi BOOL, supplier_ko, supplier_en)
- stay_inventory(product_slug, stay_date DATE, total_rooms, booked_rooms, PRIMARY KEY(product_slug, stay_date))
- bookings(id SERIAL PK, code TEXT UNIQUE, product_slug, email, name, quantity INT, nights INT DEFAULT 1,
  stay_date DATE NULL, total_krw INT, status TEXT, payment_status TEXT, visit_code TEXT,
  confirmed_at TIMESTAMPTZ NULL, created_at TIMESTAMPTZ DEFAULT now())
  - status: requested | confirmed | completed | cancelled
  - payment_status: unpaid | paid | refunded
  - code: 'KF-' + 6자리 대문자/숫자 (유니크), visit_code: 'VC-' + 4자리 대문자/숫자
- payments(id SERIAL PK, booking_code, amount_krw INT, last4 TEXT, status TEXT, test_mode BOOL DEFAULT true,
  created_at) — 카드번호 전체는 절대 저장하지 않고 마지막 4자리만 저장한다.
- reviews(id SERIAL PK, booking_code UNIQUE, rating INT, text, verified BOOL, created_at)
- point_ledger(id SERIAL PK, email, booking_code, points INT, kind TEXT, created_at)
  - kind: review_base | review_bonus
- mate_messages(id SERIAL PK, booking_code, sender TEXT, message TEXT, created_at)
- partner_applications(id SERIAL PK, business_name, business_number TEXT, email, category TEXT,
  status TEXT DEFAULT 'pending', created_at) — status: pending | approved | rejected

## Seed (부팅 시, insert-if-empty — 기존 행 절대 덮어쓰지 않음)

- products: catalog.json 38개 전부를 INSERT ... ON CONFLICT (slug) DO NOTHING.
- stay_inventory: 숙박 3개 상품에 대해 부팅일 기준 다음 14일치를 생성한다.
  catalog.json의 stayAvailability는 2026-11-05 기준 샘플이므로 날짜를 그대로 쓰지 말고,
  각 상품의 total_rooms 반복 패턴을 이용해 상대 날짜로 재생성한다:
  - stay-hanok: [3,4,5] 반복, stay-jeju-stone: [4,2,3] 반복, stay-busan-harbor: [12,13,11] 반복
  - (product_slug, stay_date) ON CONFLICT DO NOTHING.
- 범위 외 날짜를 조회하면 동일 패턴으로 해당 날짜 행을 즉석 생성한다(조회 시 insert-if-empty).

## API 계약 (JSON, 모두 /api prefix, 에러는 { error: '코드' } 형태)

### 카탈로그/검색
- GET /api/catalog → { products, fareRoutes, krwPerUsd }
  - products는 catalog.json 필드를 그대로 camelCase로 반환하되 bookingCount는
    취소되지 않은 예약 수로 계산해서 덮어쓴다.
- GET /api/search?q=&city=&category= → { products } (이름/지역 부분일치, 도시·카테고리 필터)
- GET /api/nearby?lat=&lng=&radius= (기본 1000m, 최대 20000m) → { shops, source: 'kakaomap', radius }
  - 서버 프록시로 카카오맵 카테고리 검색(FD6 음식점·CE7 카페·CS2 편의점, 거리순, 최대 20개)을 실시간 호출한다. 결과는 저장하지 않는다(카카오 정책).
  - 키는 서버 환경변수 KAKAO_REST_API_KEY에만 둔다. 키 없으면 503 { error: 'kakao_key_missing' }, 인증 실패 502 kakao_auth_failed, 쿼터 초과 429 kakao_rate_limited, 타임아웃 504 kakao_timeout.

### 예약/결제 (전부 테스트 모드)
- POST /api/bookings { productSlug, quantity, date, nights, email, name }
  - quantity 기본값: unit SONG이면 10, 그 외 1. NIGHT는 date + nights(기본 1) 필수.
  - totalKrw는 서버가 priceKrw * quantity * (NIGHT ? nights : 1)로 재계산한다. 클라이언트 금액은 무시한다.
  - STAY는 각 숙박일마다 remaining >= quantity인지 확인하고, 부족하면 400 { error: 'sold_out' }.
  - 생성 시 방 차감은 하지 않는다(차감은 결제 승인 시). 상태 requested / unpaid.
- POST /api/bookings/:code/pay { cardNumber }
  - booking이 requested여야 한다. last4 = 숫자만 남긴 뒤 뒤 4자리.
  - cardNumber 끝자리가 0002면 거절: { ok: false, error: 'card_declined' }, 상태 변경 없음.
  - 그 외(4242 포함)는 승인: payments 행 생성(last4만 저장, test_mode true),
    booking confirmed / paid, confirmedAt = now.
  - STAY는 결제 시점에 재고를 다시 확인하고 날짜별 booked_rooms += quantity.
    재고 부족이면 { ok: false, error: 'sold_out' }.
- POST /api/bookings/:code/cancel
  - requested → cancelled. confirmed+paid → cancelled + payments status refunded + STAY 방 복원.
  - completed는 취소 불가 400 { error: 'cannot_cancel_completed' }.
- GET /api/bookings?email= → 본인 예약 목록(최신순, 상품 정보 포함)
- GET /api/bookings/:code → 예약 1건 + 상품 정보

### 숙박 재고
- GET /api/stay/availability?productSlug=&from=&to= → [{ date, totalRooms, bookedRooms, remaining }]
  (기본 from=오늘, 14일치)
- POST /api/admin/inventory { productSlug, date, totalRooms }
  - totalRooms는 bookedRooms보다 작게 설정 불가(400).

### 후기/포인트
- POST /api/reviews { bookingCode, visitCode, rating, text }
  - booking이 completed가 아니면 400 { error: 'booking_not_completed' } (저장하지 않음).
  - visitCode 불일치면 400 { error: 'visit_code_mismatch' } (저장하지 않음).
  - 이미 후기가 있으면 400 { error: 'already_reviewed' }.
  - 성공 시 verified=true로 저장하고 포인트 적립: floor(totalKrw * 0.01) + 100
    (base와 bonus를 point_ledger에 분리 저장).
- POST /api/reviews/:id/reverify { visitCode } — 미검증 후기가 있을 때만 코드 확인 후 검증+소급 적립
  (정상 경로에서는 도달하지 않는 방어용 엔드포인트).
- GET /api/points?email= → { balance, ledger }

### 로컬 메이트 (예약 확정 후 7일간)
- POST /api/mate/messages { bookingCode, message }
  - confirmed가 아니거나 confirmedAt + 7일이 지났으면 400 { error: 'mate_window_closed' }.
  - 키워드 기반 정형 답장(예약 확인/변경/취소/결제/이용 방법/술집 예절 등).
  - 긴급 키워드(긴급, urgent, 응급, 도와주세요, emergency) 포함 시 urgent=true와
    '1분 이내 응답 목표' 문구를 답장에 포함한다.
- GET /api/mate/:code → { messages, active, expiresAt }

### 공급자/관리자 (관리자 인증 없음 — 테스트용임을 README에 명시, 실서비스 전 보호 필수)
- POST /api/partners { businessName, businessNumber, email, category }
  - businessNumber는 숫자 10자리 + 한국 사업자등록번호 체크섬 규칙을 만족해야 한다.
    실패 시 400 { error: 'invalid_business_number' }. 이메일 형식 검증. 상태 pending.
- GET /api/admin/partners, POST /api/admin/partners/:id/status { status }
- GET /api/admin/overview → { bookingsByStatus, paidRevenue, pendingApplications, reviewCount, pointsIssued }
- GET /api/admin/bookings, GET /api/admin/payments (최신순, 상품·예약코드 포함)
- POST /api/admin/bookings/:code/complete → confirmed를 completed로 (후기 제출 가능 상태로 만듦)
- POST /api/admin/bookings/:code/confirm → requested를 confirmed로 (STAY면 방 차감, 결제 없음)
- POST /api/admin/bookings/:code/cancel → 일반 취소와 동일 규칙

### AI (규칙 기반, 실제 모델 연동 없음)
- POST /api/itinerary { tastes[], date, guests, city }
  - tastes → 카테고리 매핑: local→DAILY, food→FOOD, kbeauty→KBEAUTY, nightlife→PUB,
    kpop→KPOP, kdrama→KDRAMA, shopping→DAILY(대체), sightseeing→SIGHTSEEING.
  - 카탈로그 실상품으로 09:30~20:30 하루 5슬롯 구성(09:30, 12:00, 14:30, 17:00, 19:30).
    요청 도시 상품을 우선 사용하고, 부족하면 다른 도시로 채우되 첫 슬롯 도시를 우선한다.
  - 반환: { slots: [{ time, productSlug, nameKo, nameEn, priceKrw }], totalKrw }
- POST /api/chatbot { message }
  - 의도 분류(예약 조회/변경/취소/결제/이용 방법/기타) + 정형 답장, 긴급 키워드 시
    urgent=true + '1분 이내 응답 목표' 표시. quickReplies 배열 포함.
- GET /api/recommendations?viewed=DAILY,FOOD&email=
  - viewed/예약 카테고리 기반 + reviewCount 상위 인기 상품. 반환:
    { items: [상품], reason: 'viewed_category' | 'popular',
      searchTermsKo: ['한식 바비큐 세트','찜질방 사우나','을지로 포차','헤어 펌'] 중 관련 항목 }
- POST /api/translate { text, target } / GET /api/translate/product/:slug?target=
  - target: en | ko | ja | zh-CN | zh-TW | zh-HK | es.
  - 소형 사전으로 알려진 상품명·문구를 번역하고, 사전에 없으면 영어 원문을 fallback:true와 함께 반환한다.
  - 최소 사전: BBQ 세트 → zh-TW '韓式烤肉套餐' 포함, 사우나/포차/헤어 펌/카페/시장 등 주요 명칭의
    ja/zh-CN/zh-TW/zh-HK/es 번역을 갖춘다.

### 택시 (미터기, 최종가 아님)
- GET /api/taxi/estimate?routeId=&distanceKm=&minutes=&type=standard|large&tollKrw=
  - 상수: 일반 기본 4,800원/1.6km, 대형·모범 7,000원/3.0km.
  - 계산식(추정치임을 명시): 기본요금 + max(0, distanceKm - 기본km) * 1000원(100원 단위 올림),
    통행료는 별도 합산. min = 총액*0.85, max = 총액*1.15 (반올림).
  - routeId가 있으면 fareRoutes의 거리/시간/통행료를 사용한다.
  - 반환: { baseKrw, distanceKrw, tollKrw, totalKrw, minKrw, maxKrw, note: '미터기 기준 추정치' }
  - 운행 후 자동결제 개념은 UI 문구로만 표현하고, 테스트 결제는 일반 결제 흐름과 동일하다.

## 프론트엔드 요구사항 (client/)

- Vite + React SPA. 모든 API 호출은 상대경로 /api/... (동일 오리진)만 사용한다.
- 헤더에 언어 전환 버튼을 상시 표시한다(햄버거 안에 숨기지 말 것). 언어 7개:
  en(기본), ko, ja, zh-CN, zh-TW, zh-HK, es. 통화 KRW/USD 토글(환율 1350, USD = krw/1350 소수 2자리).
- 프론트엔드가 사용하는 모든 UI 문구는 7개 언어 사전에 빠짐없이 포함한다(누락 시 영어로 폴백하는 안전장치 포함).
- 뷰: 홈(히어로, 프로모션 캐러셀, 카테고리 바로가기 그리드, 인기 태그 칩, 테마 탐색, 접이식 카테고리 행,
  쿠폰·포인트 배너), 카테고리 목록, 상품 상세, 예약 폼 → 테스트 결제 → 확정 화면, 내 예약, 지도 탭,
  공급자 가입, 관리자 콘솔, AI 일정 에이전트, CX 상담봇(헤더 버튼 → 헤더 아래 패널), 후기 작성, 포인트 표시.
- 카테고리 순서(고정): DAILY, FOOD, PUB, KBEAUTY, STAY, SIGHTSEEING, DELIVERY, RIDE, EYEWEAR, KPOP, KDRAMA, JOBS.
  패키지 상품 없음. 의료 카테고리(피부과·성형외과) 절대 만들지 말 것.
- 상품 상세 가격 아래 고정 문구: '판매자: [공급자명], hidden gems는 예약 중개 플랫폼입니다'.
  샘플 상품은 공급자명 뒤에 '(검증용 샘플 공급자)'를 병기한다.
- 안경점 상품 상세에 '구입은 매장에서 이루어진다' 안내를 포함한다.
  직업소개 상품 상세에 E-9 알선 금지·H-2 유료 알선 실질 금지·취업 가능 체류자격자 한정 고지를 포함한다.
- 코인노래방: 단위 SONG, 500원/곡, 예약 수량 기본 10곡(=5,000원), 수량란 라벨은 '곡 수'.
- 모든 결제·예약 화면에 '테스트 모드' 표시를 명확히 한다. 실결제·실공급자 연동 없음.
- 이미지: Unsplash 직접 CDN 링크(images.unsplash.com/photo-<id>?auto=format&fit=crop&w=800&q=80)를
  카테고리별로 사용하고, 모든 <img>에 onError → 그라데이션 폴백을 적용한다. 일러스트 사용 금지.
  권장 ID(실패 시 폴백이 처리하므로 확정 ID가 아니어도 됨):
  히어로 photo-1517154421773-0529f29ea451 / DAILY photo-1521017432531-fbd92d768814 /
  FOOD photo-1504674900247-0877df9cc836 / PUB photo-1514933651103-005eec06c04b /
  KBEAUTY photo-1560066984-138dadb4c035 / STAY photo-1566073771259-6a8506099945 /
  SIGHTSEEING photo-1506905925346-21bda4d32df4 / DELIVERY photo-1565299624946-b28f40a0ae38 /
  RIDE photo-1449824913935-59a10b8d2000 / EYEWEAR photo-1572635196237-14b3f281503f /
  KPOP photo-1470229722913-7c0e2dbbafd3 / KDRAMA photo-1493976040374-85c8e12f0c0e /
  JOBS photo-1521791136064-7986c2920216
- 지도 탭(Leaflet + OpenStreetMap 타일, API 키 불필요):
  - 상품 38개 전체에 동네 단위 핀(catalog lat/lng 사용). 화면에 '핀은 동네를 표시한다'를 명시한다.
  - 도시 칩(전체·서울·부산·제주), 카테고리 칩, 지도 검색 입력, 거리순 정렬(haversine).
  - 도시 기준점: 서울 37.57202217,126.97683236 / 부산 35.15779726,129.05989495 / 제주 33.4997202,126.5312573.
  - 행마다 길찾기 링크(https://www.google.com/maps/dir/?api=1&destination={lat},{lng})와 상세·예약 버튼.
  - 내 위치 찾기: navigator.geolocation 사용. 캐시 위치를 먼저 허용(maximumAge 크게, timeout 10초)하고,
    실패·차단·시간 초과 시 원인별 안내 + 동네 칩 기준점 폴백(동네 칩 = 카탈로그의 고유 지역 목록, 선택 시 그 지점 기준 거리순).
    Muse 패널 iframe에서는 위치가 안 되는 것으로 확인됐으므로 폴백은 반드시 구현한다.
  - 타일 로딩 실패 시에도 목록·필터·예약 연결이 동작하는 폴백(지도 컨테이너 숨김 + 목록 표시)을 구현한다.
- 브랜딩: hidden gems 브랜드만 사용한다. 크리에이트립 등 타사 로고·문구를 절대 베끼지 않는다.
- 의존성은 가볍게 유지한다(Render 무료 512MB). 무거운 차트·에디터 라이브러리 금지.

## Render 배포 (render.yaml)

- 무료 웹서비스 1개(env node, plan free): buildCommand는 루트 npm install + client install/build,
  startCommand는 node server/index.js. PORT 환경변수를 사용한다(기본 3000).
- 무료 Postgres 1개(plan free): DATABASE_URL을 웹서비스에 fromDatabase로 연결한다.
- 무료 Postgres는 30일 만료되므로, 부팅 시 seed(insert-if-empty)로 빈 DB를 자동 복원한다는 점을 README에 명시한다.
  (DB 자체가 삭제되면 Render 대시보드에서 DB를 재생성한 뒤 재배포해야 한다.)
- 무료 웹서비스는 15분 무활동 시 슬립한다는 점을 README에 명시한다.

## 작업 분담

- 백엔드 담당: server/, 루트 package.json, render.yaml. 로컬에서 PORT=3101로 서버를 띄워
  아래 검증 항목을 curl로 직접 확인하고 결과를 보고한다. client/ 파일은 건드리지 않는다.
- 프론트엔드 담당: client/만 작성한다. `npm run build`가 성공하고 dist가 생성되는지 확인한다.
  장시간 서버를 띄우지 않는다(포트 충돌 방지). 루트 package.json과 server/는 건드리지 않는다.
- 공통 금지: GitHub 푸시 금지, Render 배포 금지, 아티팩트 소스 읽기 금지, 의료 카테고리 추가 금지.
