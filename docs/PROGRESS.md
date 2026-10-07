# 진행 상황

> 프로젝트 전체 요약과 인수인계는 `docs/HANDOVER.md` 를 먼저 본다.

마지막 업데이트: 2026-10-06

## 지금까지 한 것

### 1. 모노레포 + DB 스키마 (커밋 `58487f6`)
- pnpm + Turborepo: `apps/web`(Next.js 16), `packages/db`(Drizzle), `packages/core`(순수 TS 로직)
- 스키마: 매장/권한, 품목·단위 환산, 입출고 원장, 유통기한 로트, 메뉴·레시피, 판매, 거래처·발주, 실사
- `packages/core`: 단위 환산, 레시피 차감, FIFO 로트 배분, 실사 조정, 발주 상태, 권한 표 (테스트 13개)

### 2. 로컬 Supabase + 로그인/매장/직원 초대
- 로컬 Supabase (Docker) 553xx 포트로 실행, 마이그레이션 4개 적용
- 초대 테이블 `store_invitations` + `get_invitation` / `accept_invitation` 함수, 사장 행 보호 RLS
- 화면: `/login`(로그인·가입), `/onboarding`(매장 만들기), `/dashboard`, `/settings/members`(사장 전용), `/invite/[token]`
- 데이터 접근은 `apps/web/src/lib/api/*` 로만 (NestJS 전환 대비)
- 브라우저 E2E로 확인: 가입 → 매장 생성 → 초대 → 직원 가입·수락 → 권한별 메뉴/접근 차단 → 초대 재사용 불가 → 역할 변경 → 로그아웃 → 오류 메시지 → 모바일 레이아웃

### 3. 품목 관리
- 화면: `/items`(목록·검색·카테고리 필터·보관 품목 보기), `/items/new`, `/items/[id]`(입고 단위 + 품목 정보 + 보관), `/items/categories`(추가·이름 변경·순서·삭제)
- 데이터 접근 `apps/web/src/lib/api/catalog.ts`, 서버 액션 `app/(app)/items/actions.ts` (`catalog:manage` 확인)
- 직원은 목록·상세 보기만 가능 (입력칸 비활성, 관리 버튼 숨김, 관리 주소 직접 접근 차단)
- 입고 단위: "1봉 = 1,000g" 형태, 기본 입고 단위는 품목당 하나 (첫 단위는 자동 체크)
- 품목은 삭제하지 않고 보관(archived_at). 카테고리를 지우면 품목은 미분류가 된다
- 마이그레이션 `catalog_triggers`
  - `updated_at` 자동 갱신 트리거 (items, suppliers, menus, purchase_orders). Drizzle `$onUpdate` 는 ORM 으로 수정할 때만 동작해서 추가함
  - 입출고·레시피에 쓰인 품목은 기본 단위(g/ml/ea) 변경 차단 (화면에서도 잠금)
- 공용 `useFormAction` (`components/form-parts.tsx`): `<form action>` 은 제출 후 결과와 상관없이 입력칸을 비우므로, 오류가 나도 입력값이 남도록 직접 제출한다. 새 폼은 이것을 쓴다
- 루트 `db:*` 스크립트를 `npx supabase` 로 수정 (전역 supabase CLI 없이 동작)
- 브라우저 E2E로 확인: 카테고리 CRUD·순서·중복 안내 → 품목 추가(쉼표 숫자) → 단위 추가·기본 변경·삭제·중복/0 거부 → 수정·updated_at → 중복 이름 시 입력값 유지 → 검색·필터 → 기본 단위 잠금(화면+DB 트리거) → 보관/복원 → 직원 보기 전용 → 404 → 모바일 레이아웃

### 4. 입출고 기록 (DB 함수로 트랜잭션 처리)
- **결정 (2026-10-06)**: 여러 행을 함께 쓰는 작업은 DB 함수로 묶는다. 함수 목록과 NestJS 전환 방법은 **`docs/db-functions.md`**
- DB 함수 `record_stock_movement`: 단위 환산·단가 환산·로트 생성·유통기한 순(FIFO) 차감·원장 기록을 한 트랜잭션으로. 품목 행을 잠가 동시 기록에도 안전
- `stock_movements`, `stock_lots` 직접 INSERT 정책 제거 → 함수로만 기록
- 권한 `stock:adjust`(사장·매니저) 추가. 직원은 입고·사용·폐기만
- 화면 `/stock`: 입고·사용·폐기·조정, 품목 선택(카테고리별), 단위 선택(입고는 기본 입고 단위), 현재 재고 → 기록 후 재고 미리보기, 마이너스 경고, 입고 단가·유통기한, 최근 기록 50건(`?item=` 으로 품목별)
- 품목 상세: 현재 재고(부족 배지), 최근 기록 10건, "입출고 기록" 버튼
- 데이터 접근 `apps/web/src/lib/api/stock.ts`
- 확인: SQL로 함수 직접 검증(사장·직원·다른 매장 사용자, 로트 배분, 오류 문구, 직접 INSERT 차단) + 브라우저 E2E(입고→로트별 사용→마이너스 경고→조정→품목 상세→직원 기록→보관 품목 제외→모바일)

### 5. 재고 현황 + 실시간 반영
- core `stock-status.ts`: 재고 상태(없음·부족·충분), 유통기한 상태(지남·임박 3일·충분), 남은 날 표시, 시간대 기준 오늘 날짜 (테스트 16개)
- `lib/inventory.ts`: 품목별 재고·유통기한 상태 계산. 유통기한 "오늘"은 매장 시간대(Asia/Seoul) 기준
- 품목 목록(메뉴 이름 "품목·재고"): 현재 재고, 재고 없음/부족 배지, 가장 빠른 유통기한 배지, 상태 필터(`?status=low|expiry`)
- 품목 상세: 유통기한별 남은 양(로트), 부족 기준 표시
- 대시보드: 부족한 품목, 유통기한 확인(로트별), 최근 기록, 입출고 바로가기
- 실시간: `lib/api/realtime.ts` + `components/realtime-refresh.tsx` (앱 레이아웃). 다른 기기의 기록이 약 1초 안에 반영되고, 입력 중인 폼 값은 유지
  - 주의: 브라우저 클라이언트는 쿠키 세션 토큰을 Realtime 에 자동으로 넣지 않는다. 넣지 않으면 익명으로 구독되어 RLS 에 막혀 이벤트가 오지 않는다 → 구독 전에 `realtime.setAuth(access_token)`
- 확인: 브라우저 E2E (대시보드 집계, 목록 필터, 로트 표시, 직원 기기 기록 → 사장 화면 실시간 반영, 모바일) + 품목·입출고 E2E 회귀

### 6. 메뉴·레시피 + 판매 입력
- 메뉴 `/menus`: 가격, 레시피(재료·1개당 사용량, 입고 단위로도 입력), 원가·원가율(최근 입고 단가 기준, 뷰 `item_latest_costs`), 보관. 직원은 보기만
- 판매 `/sales`: 메뉴별 수량 일괄 입력(± 버튼), 차감될 재료와 남는 재고 미리보기, 날짜 이동(지난 날짜는 그 날 23:59 로 기록), 매출 합계·메뉴별 합계, 판매 기록·취소(사장·매니저)
- DB 함수 `record_sales`: 판매 기록 + 레시피대로 재료 차감(유통기한 순)을 한 트랜잭션으로. 재료 품목을 id 순으로 잠금
- 내부 함수 `stock_outflow`: 유통기한 순 차감을 입출고·판매가 함께 쓴다 (`record_stock_movement` 도 이것으로 바꿈)
- 판매 취소 = `sale_records` 삭제 → 연결된 sale 원장 cascade 삭제 (원장 삭제 금지의 유일한 예외, CLAUDE.md·db-functions.md 에 기록)
- `sale_records` 직접 INSERT 정책 제거, 권한 `sale:cancel` 추가, core `recipeCost`·`costRate` (테스트 18개)
- 대시보드: 오늘 매출, 판매 입력 바로가기. Realtime 에 sale_records 추가 (삭제는 필터 구독에 안 옴)
- 공용 `ActionButton` (`form-parts.tsx`): 누르면 줄이 사라지는 삭제·취소 버튼은 이것을 쓴다. `useActionState` 로 하면 줄과 함께 결과가 사라져 알림이 안 뜬다 (재료 빼기, 단위 삭제, 카테고리 삭제, 직원 내보내기, 초대 취소에 적용)
- 확인: SQL로 함수 검증(일괄 판매·로트 차감·소급 시각·오류·권한·취소 cascade) + 브라우저 E2E(메뉴·레시피·원가 → 판매 → 전날 입력 → 취소 → 직원·실시간 → 보관 → 모바일) + 기존 E2E 회귀

### 7. 재고 실사
- 화면 `/counts`(시작: 전체 또는 카테고리, 진행 중 실사, 지난 실사), `/counts/[id]`(품목별 센 수량 입력 "3봉 + 200g", 장부와 차이, 안 센 것/차이 있음 필터, 다시 세기·지우기, 완료·취소 / 끝난 실사 결과)
- **조정 기준 = 품목을 센 시각의 장부** (기존 core 는 완료 시점 비교였음 → 바꿈). 세는 도중·센 뒤의 판매·입출고가 있어도 정확
- 스키마: 실사 줄 `counted_at`·`counted_by`·`adjustment`, 실사 `category_id`, 센 수량 ≥ 0, 매장당 진행 중 실사 1개, 뷰 `stock_count_line_books`
- DB 함수 `start_stock_count`(실사 + 줄을 한 번에), `complete_stock_count`(센 시각 기준 차이만큼 adjust, 줄이면 유통기한 순·늘리면 로트 없이). `stock_outflow` 에 실사 연결 인자 추가
- 권한: 누구나 시작·세기, 완료·취소는 사장·매니저. 구성원은 `counted_quantity` 컬럼만 수정 가능(컬럼 권한), 센 시각·사람은 트리거가 기록
- 여러 사람이 나눠 세면 실시간 반영 (`stock_count_lines` Realtime). 대시보드에 진행 중 실사 표시
- 확인: SQL 검증(권한·제약·센 뒤 판매·완료·취소) + 브라우저 E2E 23개 + 기존 E2E 회귀(품목 49, 입출고 28, 재고 현황 20, 판매 36)

### 8. 거래처·발주 (재고관리 MVP 완료)
- 거래처 `/suppliers`: 추가·수정·보관, 연락처·메모, 주로 주문하는 품목, 최근 발주. 품목 정보에 "기본 거래처" 추가
- 발주 `/orders` (사장·매니저 전용, 메뉴 "발주"): 작성 중 → 발주 → 일부 입고 → 입고 완료 / 취소
  - 새 발주: 거래처의 부족 품목을 추천 수량(부족 기준 × 2 까지, 주문 단위로 올림)과 최근 입고 단가로 바로 담기
  - 작성 중: 품목 담기·수량·단위·단가 수정·빼기, 같은 품목 중복 금지
  - 발주 후: 카카오톡용 "발주 내용 복사", 되돌리기, 취소
  - 입고 처리: 남은 수량 미리 채움, 일부 입고, 단가 변경, 유통기한(로트), 남은 수량 없이 마감
- DB 함수 `receive_purchase_order`(로트 + receive 원장 + 입고 수량 + 상태, 한 트랜잭션), `change_purchase_order_status`(허용된 상태 전환만)
- 권한: 상태·입고 수량은 함수로만(컬럼 권한), 줄은 작성 중일 때만, 품목·단위는 같은 매장 것만
- core `suggestOrderQuantity`, `orderTotal` (테스트 21개). 대시보드에 입고 예정
- `useFormAction` 에 `toastResult` 옵션: 성공하면 폼이 사라지는 곳(입고 완료)에서도 알림이 뜨도록
- 확인: SQL 검증 + 브라우저 E2E 41개, 전체 E2E 회귀 197개 통과

### 9. MVP 다듬기 (진행 중)
- 브라우저 E2E 스크립트를 저장소 `e2e/` 로 옮김 (`pnpm e2e`)
- 로그인·회원가입·매장 만들기·직원 초대 폼을 `useFormAction` 으로: 오류가 나도 입력값 유지, 초대 링크를 만들면 메모 칸 비움.
  `useFormAction` 은 액션 결과 타입을 제네릭으로 받는다 (초대의 `token` 처럼 추가 필드가 있는 결과)
- `@cafe/core`, `@cafe/db` 에 lint 스크립트 (`@eslint/js` + `typescript-eslint` 권장 규칙). `pnpm lint` 가 세 패키지를 모두 검사
- 확인: typecheck·lint·단위 테스트 21개, 전체 E2E 218개 통과 (가입·초대에 입력값 유지·메모 비움 2개 추가)
- 매장 시간대·매장 설정 (`/settings/store`, 사장)
  - "오늘", 하루 범위, 지난 날짜 판매의 23:59, 화면의 날짜·시각 표시가 모두 `stores.timezone` 을 따른다 (그동안 Asia/Seoul 고정)
  - core `time.ts`: `zonedTimeToUtc`(서머타임 반영), `isValidTimeZone`, `dateInTimeZone`(옮김). 테스트 23개
  - DB: 사장은 `name`·`timezone` 만 수정(컬럼 권한), 트리거 `validate_store` 가 이름·시간대 검사
- 판매 취소 실시간 반영: 트리거가 `realtime.send` 로 비공개 채널 `store:<id>` 에 방송, `realtime.messages` 정책으로 그 매장 구성원만 수신
  - 확인: 트리거를 끄면 E2E 가 실패하는 것, 다른 사람은 채널 메시지를 못 읽는 것(SQL)
- E2E: `store` 시나리오 추가(호놀룰루 시간대로 바꿔 판매 날짜 확인), 판매 시나리오에 취소 실시간 반영. 8개 통과
- `pnpm db:reset` 으로 로컬 DB를 비우고 마이그레이션 15개를 처음부터 적용 → 오류 없음, E2E 8개 통과 (2026-10-07, 로컬 데이터 모두 삭제)
- CI(`.github/workflows/ci.yml`): 타입·lint·단위 테스트, Supabase 를 띄워 마이그레이션 적용 후 E2E. 첫 실행 둘 다 통과 (E2E 8개 3.4분)
- GitHub 공개 저장소 https://github.com/ll-lrv/cafe-manager 에 올림. 올리기 전 커밋 이메일을 GitHub noreply 로 바꿈 (커밋 ID 바뀜)
  - 예전 저장소는 `cafe-manager_v1` (이름이 겹쳐 `C:\project\cafe-manager_v1` 의 origin 을 `.../cafe-manager_v1.git` 로 바꿈)
- E2E 를 `@playwright/test` 로 전환 (`e2e/tests/*.spec.ts`)
  - 공통 fixture `app`: 가입+매장(`owner`), 초대로 직원 가입(`joinByInvite`), 다른 기기(`newPage`), 페이지·콘솔 오류 수집
  - 도우미(`helpers.ts`): 품목·메뉴·레시피·입출고·판매, 실시간 반영 확인. 시나리오마다 복사돼 있던 것을 하나로
  - 확인 항목은 `expect.soft`(실패해도 끝까지), 단계는 `test.step`. 3개 병렬, 재시도 1회, HTML 리포트, 실패 시 trace
  - 테스트 데이터: 테스트가 끝나면 만든 계정·매장을 지운다. 강제 종료로 남은 것은 다음 실행 때(1시간 넘은 것), `e2e:cleanup` 으로 바로
  - 개발 서버가 없으면 Playwright 가 띄운다 (`webServer`). 설치된 Chrome 사용 (`channel: "chrome"`)
  - 옮기면서 고친 것: 누를 수 없는 체크 칸을 기다리다 멈추던 곳(발주 취소), 알림 직후 화면을 읽던 곳(일부 입고). 동작 제한 시간 15초

## 다시 시작하는 방법

1. **Docker Desktop 실행** (`%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe`)
2. 로컬 Supabase 시작 (데이터는 그대로 남아 있음)
   ```
   npx supabase start -x imgproxy,edge-runtime,logflare,vector,supavisor
   ```
3. 웹 개발 서버
   ```
   pnpm dev
   ```
   → http://localhost:3000 · DB 보기: Supabase Studio http://127.0.0.1:55323
4. 처음부터 깨끗한 DB가 필요하면 `pnpm db:reset` (테스트 계정 모두 삭제)

`apps/web/.env.local` 은 git에 없다. 새로 받은 경우 `.env.example` 을 복사하고
`npx supabase status` 의 Publishable key 를 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 에 넣는다.

## 다음 할 일

재고관리 MVP(품목·입출고·재고 현황·메뉴/판매·실사·발주)는 끝났다. 다음 단계 후보:

1. **MVP 다듬기** (남은 것)
   - 배포 환경 결정·구성 (후보: Supabase 클라우드 + Vercel)
2. **매출 연동**: CSV 업로드 → `record_sales` 를 `source = 'csv'`, `external_id` 로 중복 방지하며 호출. 이후 POS 연동
3. **분석**: 기간별 매출·원가·마진, 메뉴별 원가율 추이, 재료 소모·폐기율
4. **NestJS 전환 시작**: `docs/db-functions.md` 의 대응표대로 기능 단위로 옮긴다
5. **앱(Expo)**: 판매 입력·입출고·실사처럼 직원이 휴대폰으로 하는 화면부터

## 메모
- 이 PC에는 다른 Supabase 프로젝트(`cafe-manager_simple`)와 `cafe-postgres` 컨테이너가 있다. Docker를 켜면 같이 켜진다. 건드리지 않았다.
- Next.js 16: middleware → `src/proxy.ts`. 코드 작성 전 `apps/web/node_modules/next/dist/docs/` 확인
- shadcn/ui 는 Base UI 기반(base-nova). `cn` 은 shadcn의 `cn` 패키지
- E2E 중 hydration 경고(`caret-color: transparent`)가 보이면 Playwright 스크린샷이 넣는 스타일이다. 앱 문제 아님
