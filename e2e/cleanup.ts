// 테스트 계정(e2e-...@test.kr)과 그 매장을 모두 지운다. E2E 가 돌고 있지 않을 때만 쓴다.
// 테스트는 끝날 때 자기 데이터를 지우고, 실행 전에 1시간 넘게 남은 것도 지운다. 이것은 바로 지우고 싶을 때 쓴다.
import { deleteTestUsers, sql, TEST_EMAIL_LIKE } from "./db.ts";

const before = sql(`select count(*) from auth.users where email like '${TEST_EMAIL_LIKE}'`);
deleteTestUsers(`email like '${TEST_EMAIL_LIKE}'`);
console.log(`테스트 계정 ${before}개와 그 매장을 지웠습니다.`);
