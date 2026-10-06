export type MemberRole = "owner" | "manager" | "staff";

/**
 * 권한 표. 화면에서 버튼 노출 여부를 정할 때와 서버에서 검증할 때 같은 표를 쓴다.
 * DB의 RLS 정책도 이 표와 맞춰야 한다. (supabase/migrations 의 rls 마이그레이션)
 */
const PERMISSIONS = {
  /** 입고·사용·폐기 기록 */
  "stock:move": ["owner", "manager", "staff"],
  /** 재고 직접 조정(± 수량). 잘못 기록한 입출고를 바로잡을 때 */
  "stock:adjust": ["owner", "manager"],
  /** 실사 진행(수량 입력) */
  "stock:count": ["owner", "manager", "staff"],
  /** 실사 완료 → 재고 조정 확정 */
  "stock:count:complete": ["owner", "manager"],
  /** 판매 수량 입력 */
  "sale:record": ["owner", "manager", "staff"],
  /** 판매 취소 (연결된 재료 차감도 함께 취소) */
  "sale:cancel": ["owner", "manager"],
  /** 품목·카테고리·단위·메뉴·레시피 관리 */
  "catalog:manage": ["owner", "manager"],
  /** 거래처 관리 */
  "supplier:manage": ["owner", "manager"],
  /** 발주서 작성·발주·입고 처리 */
  "purchase:manage": ["owner", "manager"],
  /** 원가·매출 리포트 */
  "report:view": ["owner", "manager"],
  /** 직원 초대·권한 변경 */
  "member:manage": ["owner"],
  /** 매장 정보·삭제 */
  "store:manage": ["owner"],
} as const satisfies Record<string, readonly MemberRole[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: MemberRole | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role);
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  owner: "사장",
  manager: "매니저",
  staff: "직원",
};
