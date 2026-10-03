import { numeric, timestamp, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();

export const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** 삭제 대신 보관 처리. 과거 입출고 기록이 품목을 계속 참조할 수 있도록 한다. */
export const archivedAt = () => timestamp("archived_at", { withTimezone: true });

/** 수량은 항상 품목의 기본 단위(g, ml, ea) 기준, 소수점 3자리 */
export const quantity = (name: string) =>
  numeric(name, { precision: 14, scale: 3, mode: "number" });
