# 진행 상황

마지막 업데이트: 2026-10-03

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

1. **품목 관리**: 카테고리, 품목 등록/수정/보관, 입고 단위(item_units) 설정
2. **입출고 기록**: 입고·사용·폐기 입력 (입고 단위로 입력 → 기본 단위로 환산), 유통기한 품목은 로트 생성
3. **재고 현황**: `item_stock_levels` 뷰 기반 목록, 부족 표시, Supabase Realtime으로 다른 기기에 즉시 반영
4. 그다음: 메뉴·레시피 → 판매 입력(자동 차감) → 재고 실사 → 거래처·발주
5. 정리 과제
   - E2E 테스트를 저장소에 Playwright 테스트로 추가 (지금은 임시 스크립트로만 확인함)
   - 재고 차감처럼 여러 행을 함께 써야 하는 작업은 DB 함수(트랜잭션)로 처리할지 결정

## 메모
- 이 PC에는 다른 Supabase 프로젝트(`cafe-manager_simple`)와 `cafe-postgres` 컨테이너가 있다. Docker를 켜면 같이 켜진다. 건드리지 않았다.
- Next.js 16: middleware → `src/proxy.ts`. 코드 작성 전 `apps/web/node_modules/next/dist/docs/` 확인
- shadcn/ui 는 Base UI 기반(base-nova). `cn` 은 shadcn의 `cn` 패키지
