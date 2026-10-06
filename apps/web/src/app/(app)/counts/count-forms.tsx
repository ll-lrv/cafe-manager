"use client";

import { BASE_UNIT_LABEL, formatQuantity, roundQty } from "@cafe/core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import {
  ActionButton,
  Field,
  FormMessage,
  NativeSelect,
  SubmitButton,
  useFormAction,
  useToastResult,
} from "@/components/form-parts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category } from "@/lib/api/catalog";
import type { StockCountLine } from "@/lib/api/counts";
import { cn } from "@/lib/utils";
import { cancelCountAction, clearCountAction, completeCountAction, saveCountAction, startCountAction } from "./actions";

// ---------------------------------------------------------------- 시작

export function StartCountForm({ categories }: { categories: Category[] }) {
  const { state, pending, formProps } = useFormAction(startCountAction);
  return (
    <form {...formProps} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <Field label="셀 범위" htmlFor="count-category">
          <NativeSelect id="count-category" name="categoryId" defaultValue="">
            <option value="">전체 품목</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}만
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="메모 (선택)" htmlFor="count-memo">
          <Input id="count-memo" name="memo" maxLength={200} placeholder="예) 월말 실사, 마감 실사" />
        </Field>
      </div>
      {state?.error && <FormMessage state={state} />}
      <SubmitButton pending={pending} pendingText="준비 중…" className="w-full sm:w-fit">
        실사 시작
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- 세기

function diffText(diff: number, fmt: (n: number) => string) {
  if (diff === 0) return "일치";
  return `${diff > 0 ? "+" : "−"}${fmt(Math.abs(diff))}`;
}

function SuffixInput({ suffix, ...props }: React.ComponentProps<typeof Input> & { suffix: string }) {
  return (
    <div className="relative">
      <Input inputMode="decimal" autoComplete="off" placeholder="0" {...props} className="pr-9 tabular-nums" />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
        {suffix}
      </span>
    </div>
  );
}

function CountLineRow({ countId, line, currentStock }: {
  countId: string;
  line: StockCountLine;
  /** 지금 장부 재고 (아직 안 센 품목에 보여준다) */
  currentStock: number;
}) {
  const { state, pending, formProps } = useFormAction(saveCountAction, { resetOnSuccess: true });
  useToastResult(state?.error ? state : undefined);
  const [editing, setEditing] = useState(false);
  // 저장에 성공하면 입력 모드를 닫는다.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setEditing(false);
  }

  const packUnit = line.units.find((u) => u.isDefaultPurchase) ?? null;
  const baseLabel = BASE_UNIT_LABEL[line.baseUnit];
  const fmt = (n: number) => formatQuantity(n, line.baseUnit, packUnit);
  const counted = line.countedQuantity !== null;
  const book = counted ? (line.bookAtCount ?? 0) : currentStock;
  const diff = counted ? roundQty(line.countedQuantity! - book) : null;
  const showInputs = !counted || editing;

  return (
    <li className="grid gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium">{line.itemName}</span>
        <span className="text-xs text-muted-foreground">
          장부 {fmt(book)}
          {counted && " (센 시각 기준)"}
        </span>
        {counted && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-sm tabular-nums">센 수량 {fmt(line.countedQuantity!)}</span>
            <Badge variant={diff === 0 ? "secondary" : "destructive"}>{diffText(diff!, fmt)}</Badge>
          </span>
        )}
      </div>

      {showInputs ? (
        <form {...formProps} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="countId" value={countId} />
          <input type="hidden" name="itemId" value={line.itemId} />
          <input type="hidden" name="factor" value={packUnit?.factor ?? 1} />
          {packUnit && (
            <>
              <div className="w-24">
                <SuffixInput name="packs" suffix={packUnit.name} aria-label={`${line.itemName} ${packUnit.name} 수`} />
              </div>
              <span className="text-sm text-muted-foreground">+</span>
            </>
          )}
          <div className="w-28">
            <SuffixInput
              name="loose"
              suffix={baseLabel}
              aria-label={packUnit ? `${line.itemName} 낱개 (${baseLabel})` : `${line.itemName} 수량 (${baseLabel})`}
            />
          </div>
          <SubmitButton pending={pending} pendingText="저장 중…" size="sm">
            확인
          </SubmitButton>
          {editing && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              닫기
            </Button>
          )}
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          {line.countedByName && <span>{line.countedByName}</span>}
          <div className="ml-auto flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              다시 세기
            </Button>
            <ActionButton
              action={clearCountAction}
              fields={{ countId, itemId: line.itemId }}
              variant="ghost"
              size="sm"
              aria-label={`${line.itemName} 센 수량 지우기`}
            >
              지우기
            </ActionButton>
          </div>
        </div>
      )}
    </li>
  );
}

type LineFilter = "all" | "todo" | "diff";

/** 센 수량이 센 시각의 장부와 다른지 */
function isDiff(l: StockCountLine) {
  return l.countedQuantity !== null && roundQty(l.countedQuantity - (l.bookAtCount ?? 0)) !== 0;
}

export function CountSheet({ countId, lines, stock }: {
  countId: string;
  lines: StockCountLine[];
  /** 품목별 지금 장부 재고 */
  stock: Record<string, number>;
}) {
  const [filter, setFilter] = useState<LineFilter>("all");
  const [query, setQuery] = useState("");

  const todoCount = lines.filter((l) => l.countedQuantity === null).length;
  const diffCount = lines.filter(isDiff).length;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, StockCountLine[]>();
    for (const l of lines) {
      if (filter === "todo" && l.countedQuantity !== null) continue;
      if (filter === "diff" && !isDiff(l)) continue;
      if (q && !l.itemName.toLowerCase().includes(q)) continue;
      const key = l.categoryName ?? "미분류";
      map.set(key, [...(map.get(key) ?? []), l]);
    }
    return [...map].sort(([a], [b]) => (a === "미분류" ? 1 : b === "미분류" ? -1 : a.localeCompare(b, "ko")));
  }, [lines, filter, query]);

  const filters: { value: LineFilter; label: string }[] = [
    { value: "all", label: `전체 ${lines.length}` },
    { value: "todo", label: `안 센 것 ${todoCount}` },
    { value: "diff", label: `차이 있음 ${diffCount}` },
  ];

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="품목 검색"
          aria-label="품목 검색"
          className="pl-8"
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="실사 품목 보기">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-sm transition-colors",
              filter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {filter === "todo" ? "모든 품목을 셌습니다." : "조건에 맞는 품목이 없습니다."}
        </p>
      ) : (
        groups.map(([group, groupLines]) => (
          <section key={group} className="grid">
            <h3 className="text-xs font-medium text-muted-foreground">{group}</h3>
            <ul className="divide-y">
              {groupLines.map((line) => (
                <CountLineRow key={line.itemId} countId={countId} line={line} currentStock={stock[line.itemId] ?? 0} />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------- 완료·취소

export function CompleteCountButtons({ countId, countedCount, todoCount }: {
  countId: string;
  countedCount: number;
  todoCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton
        action={completeCountAction}
        fields={{ countId }}
        confirmMessage={`센 품목 ${countedCount}개를 장부에 반영할까요?${todoCount > 0 ? ` 세지 않은 ${todoCount}개는 그대로 둡니다.` : ""}`}
        pendingText="반영 중…"
        size="lg"
      >
        실사 완료 · 재고 반영
      </ActionButton>
      <ActionButton
        action={cancelCountAction}
        fields={{ countId }}
        confirmMessage="실사를 취소할까요? 센 수량은 재고에 반영되지 않습니다."
        variant="ghost"
        size="lg"
      >
        실사 취소
      </ActionButton>
    </div>
  );
}
