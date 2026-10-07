# 브라우저 E2E (`@playwright/test`)

실제 브라우저(설치된 Chrome)로 가입부터 발주까지 화면을 직접 눌러 보며 확인한다.
필요한 곳은 DB 값도 직접 조회해서 맞는지 본다. 시나리오 8개, 각 시나리오는 테스트 하나이고 단계(`test.step`)로 나뉜다.

## 실행

먼저 로컬 Supabase 를 띄운다 (`docs/HANDOVER.md` §3). 개발 서버는 떠 있으면 그것을 쓰고, 없으면 Playwright 가 띄운다.

```
npx supabase start -x imgproxy,edge-runtime,logflare,vector,supavisor
pnpm e2e                          # 전체 (저장소 루트에서)
pnpm e2e sales orders             # 파일 이름으로 골라서
pnpm e2e --headed                 # 브라우저 창을 보면서
pnpm --filter @cafe/e2e e2e:report    # 마지막 실행의 HTML 리포트 열기
```

- **결과**: 시나리오마다 ✓/✘. 확인 항목은 `expect.soft` 라 하나가 실패해도 시나리오 끝까지 진행하고, 실패한 항목을 모두 모아 보여준다
- **리포트**: `e2e/playwright-report/` (HTML). 단계별 시간, 사람이 볼 스크린샷(`shot()`)이 붙어 있다
- **실패했을 때**: `e2e/test-results/<시나리오>/` 에 실패 시점 스크린샷과 trace. `npx playwright show-trace <trace.zip>` 으로 한 단계씩 다시 볼 수 있다
- **재시도**: 실패하면 한 번 더 돈다 (새 계정·매장으로 처음부터). 재시도에서 통과하면 `flaky` 로 표시된다
- **병렬**: 기본 3개 동시. 시나리오마다 계정·매장이 따로라 겹치지 않는다. PC가 느리면 `E2E_WORKERS=1 pnpm e2e`
- `pnpm typecheck` 가 이 폴더도 검사한다

### 설정 (환경 변수)

| 변수 | 기본값 |
|---|---|
| `E2E_BASE_URL` | `http://localhost:3000` (지정하면 개발 서버를 띄우지 않는다) |
| `CHROME_PATH` | 없음 → 설치된 Chrome (`channel: "chrome"`) |
| `E2E_DB_CONTAINER` | `supabase_db_cafe-manager` (DB 확인용 `docker exec ... psql`) |
| `E2E_WORKERS` | `3` |

브라우저를 내려받지 않는다 (`npx playwright install` 불필요). 설치된 Chrome 을 쓴다.

## 테스트 데이터

- 테스트 계정 이메일은 모두 `e2e-<역할>-<고유값>@test.kr` 이다
- **테스트가 끝나면 그 테스트가 만든 계정과 매장을 지운다** (통과·실패 상관없이, `fixtures.ts`)
- 강제 종료 등으로 남은 것은 다음 실행 시작 때 지운다 (1시간 넘은 것만. 동시에 도는 다른 실행을 건드리지 않도록, `global-setup.ts`)
- 바로 지우려면 `pnpm --filter @cafe/e2e e2e:cleanup` (E2E 가 돌고 있지 않을 때)
- 매장을 지울 때 품목·메뉴·로트를 다른 표가 RESTRICT 로 참조하므로 참조하는 쪽부터 차례로 지운다 (`db.ts` 의 `deleteTestUsers`). 새 표를 추가하면 여기도 확인한다

## 구조

| 파일 | 내용 |
|---|---|
| `playwright.config.ts` | 브라우저·재시도·병렬·리포트·개발 서버 |
| `fixtures.ts` | `app` fixture: `owner()` 가입+매장, `joinByInvite()` 초대로 직원 가입, `newPage()` 다른 사람·기기, `email()` 테스트 계정. 페이지 오류·콘솔 오류를 모아 테스트 끝에 확인하고, 데이터를 지운다 |
| `helpers.ts` | `check`, `createItem`, `recordStock`, `createMenu`, `addIngredient`, `addCategory`, `submitSales`, `appearsLive`(실시간 반영 확인), `shot`, `kstDate` 등 |
| `db.ts` | `sql()` 직접 조회, 테스트 데이터 정리 |
| `tests/*.spec.ts` | 시나리오 |

## 시나리오

| 파일 | 확인하는 것 |
|---|---|
| `auth` | 가입 → 매장 만들기 → 직원 초대 링크(메모 칸 비움) → 직원 가입·수락 → 권한별 메뉴·접근 차단 → 초대 재사용 불가 → 역할 변경 → 로그아웃 → 잘못된 비밀번호(입력값 유지) → 모바일 |
| `items` | 카테고리(추가·중복·순서·이름·삭제) → 품목 추가·수정·중복 → 입고 단위(추가·기본 변경·삭제·0 거부) → 오류 시 입력 유지 → updated_at 트리거 → 검색·필터 → 기본 단위 잠금(화면 + DB 트리거) → 보관 → 직원 보기 전용 → 404 → 모바일 |
| `stock` | 입고(기본 입고 단위, 단가, 유통기한 필수) → 유통기한 순 사용(로트 배분을 DB로 확인) → 마이너스 경고 → 조정(사유 필수) → 품목 상세 → 직원 기록 → 보관 품목 제외 → 모바일 |
| `inventory` | 대시보드 집계(부족·유통기한·최근 기록) → 목록 재고·배지·상태 필터 → 로트별 남은 양 → **다른 기기 기록의 실시간 반영** → 실시간 새로고침 중 입력값 유지 → 모바일 |
| `sales` | 메뉴·레시피(단위 입력, 수정, 빼기) → 원가·원가율 → 판매 일괄 입력·차감 미리보기 → 재고 차감(로트) → 지난 날짜 입력(23:59) → 판매 취소(차감 되돌림) → 직원 권한 → 실시간 매출·**판매 취소 실시간 반영** → 메뉴 보관 → 모바일 |
| `counts` | 실사 시작 → 묶음+낱개 입력 → 두 사람이 나눠 세기(실시간) → **센 뒤 판매가 있어도 센 시각 기준 조정** → 필터 → 다시 세기·지우기 → 완료(재고 반영) → 취소 → 카테고리 실사 → 모바일 |
| `store` | 매장 설정: 이름·시간대 저장(공백 거부, 입력 유지) → 머리글 이름 → **호놀룰루 시간대로 바꾸면 판매 화면 "오늘"과 지난 날짜 23:59 가 그 시간대 기준** → DB 트리거 검사 → 직원 차단 → 모바일 |
| `orders` | 거래처(발주 중 만들고 돌아오기) → 기본 거래처 → 부족 품목 추천 수량·단가 → 줄 수정·추가·빼기 → 발주·복사·되돌리기 → 일부 입고(유통기한 필수) → 나머지 입고(단가 변경, 원가 반영) → 마감·취소 → 직원 차단 → 모바일 |

## 새 테스트를 쓸 때

- `import { test, expect } from "../fixtures"` 로 시작하고 `app.owner()` 로 매장을 만든다. 계정은 `app.email()` 로만 만든다 (그래야 지워진다)
- 주소는 `/items` 처럼 경로만 쓴다 (`baseURL`)
- 알림(토스트)은 화면 갱신보다 조금 먼저 뜰 수 있다. 알림 직후 화면 내용을 확인할 때는 `expect(locator).toContainText()` 처럼 기다리는 방식으로
- 다른 기기의 실시간 반영은 화면을 연 뒤 `waitForRealtime()` 으로 구독 연결을 기다리고, `appearsLive()` 로 확인한다
- 콘솔의 `caret-color: transparent` hydration 경고(Playwright 스크린샷이 넣는 스타일)와 404 테스트의 `status of 404` 는 오류로 보지 않는다 (`fixtures.ts`)
- 의존성을 바꿔 `pnpm install` 한 뒤에는 개발 서버를 다시 띄운다. `@playwright/test` 는 Next 의 선택 peer 라 설치 경로가 바뀌어, 떠 있던 개발 서버가 옛 경로와 섞여 404 화면에서 모듈 오류를 낸다
