import { deleteTestUsers, sql, TEST_EMAIL_LIKE } from "./db";

/** 실행 전: 로컬 DB 확인, 중간에 끊긴 실행이 남긴 테스트 데이터 정리 */
export default function globalSetup() {
  const ping = sql("select 1");
  if (ping !== "1") {
    throw new Error(
      `로컬 Supabase DB에 연결할 수 없습니다. Docker Desktop 과 \`npx supabase start\` 를 먼저 실행해 주세요.\n${ping}`,
    );
  }
  // 테스트는 끝날 때 자기 데이터를 지운다. 여기서는 강제 종료 등으로 남은 것만 지운다.
  // 동시에 도는 다른 실행의 데이터를 건드리지 않도록 1시간 넘은 것만.
  deleteTestUsers(`email like '${TEST_EMAIL_LIKE}' and created_at < now() - interval '1 hour'`);
}
