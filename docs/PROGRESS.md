# 진행 상황

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

1. **재고 현황**: `item_stock_levels` 뷰 기반 목록(품목 목록에 현재 재고·부족 표시), 유통기한 임박 로트(`lot_stock_levels`, core `daysUntilExpiry`), 대시보드에 부족·임박 요약, Supabase Realtime으로 다른 기기에 즉시 반영
2. 그다음: 메뉴·레시피 → 판매 입력(자동 차감) → 재고 실사 → 거래처·발주
3. 정리 과제
   - E2E 테스트를 저장소에 Playwright 테스트로 추가 (지금은 임시 스크립트로만 확인함)
   - 로그인·매장 만들기·직원 초대 폼도 `useFormAction` 으로 바꿔 오류 시 입력값 유지
   - `@cafe/core`, `@cafe/db` 에는 lint 스크립트가 없다

## 메모
- 이 PC에는 다른 Supabase 프로젝트(`cafe-manager_simple`)와 `cafe-postgres` 컨테이너가 있다. Docker를 켜면 같이 켜진다. 건드리지 않았다.
- Next.js 16: middleware → `src/proxy.ts`. 코드 작성 전 `apps/web/node_modules/next/dist/docs/` 확인
- shadcn/ui 는 Base UI 기반(base-nova). `cn` 은 shadcn의 `cn` 패키지
- E2E 중 hydration 경고(`caret-color: transparent`)가 보이면 Playwright 스크린샷이 넣는 스타일이다. 앱 문제 아님
