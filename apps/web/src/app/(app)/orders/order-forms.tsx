"use client";

import { BASE_UNIT_LABEL, formatQuantity, formatUnitCount, orderTotal, roundQty, type PurchaseOrderStatus } from "@cafe/core";
import { Check, Copy, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ActionButton,
  Field,
  FormMessage,
  NativeSelect,
  SubmitButton,
  useFormAction,
  useToastResult,
} from "@/components/form-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Item } from "@/lib/api/catalog";
import type { OrderLine, PurchaseOrder } from "@/lib/api/purchasing";
import type { Supplier } from "@/lib/api/suppliers";
import {
  addLineAction,
  addSuggestedAction,
  changeStatusAction,
  createOrderAction,
  receiveAction,
  removeLineAction,
  updateLineAction,
  updateOrderAction,
} from "./actions";
import { dayLabel, won } from "./status";

export type OrderItemOption = Pick<Item, "id" | "name" | "categoryName" | "baseUnit" | "units">;

function WonInput(props: React.ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <Input inputMode="numeric" autoComplete="off" placeholder="0" {...props} className="pr-7 tabular-nums" />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">원</span>
    </div>
  );
}

/** "3봉", "500g" 처럼 주문 단위로 표시 */
function orderQty(line: Pick<OrderLine, "unitName" | "baseUnit">, quantity: number) {
  return formatUnitCount(quantity, line.unitName ?? BASE_UNIT_LABEL[line.baseUnit]);
}

// ---------------------------------------------------------------- 새 발주

export function NewOrderForm({ suppliers, suggestionCounts, initialSupplierId }: {
  suppliers: Pick<Supplier, "id" | "name">[];
  /** 거래처별 담을 수 있는 부족 품목 수 */
  suggestionCounts: Record<string, number>;
  initialSupplierId?: string;
}) {
  const { state, pending, formProps } = useFormAction(createOrderAction);
  const [supplierId, setSupplierId] = useState(
    suppliers.find((s) => s.id === initialSupplierId)?.id ?? suppliers[0]?.id ?? "",
  );
  const suggested = suggestionCounts[supplierId] ?? 0;

  return (
    <form {...formProps} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="거래처" htmlFor="order-supplier">
          <NativeSelect id="order-supplier" name="supplierId" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="입고 희망일 (선택)" htmlFor="order-expected">
          <Input id="order-expected" name="expectedOn" type="date" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="메모 (선택)" htmlFor="order-memo">
            <Input id="order-memo" name="memo" maxLength={500} placeholder="예) 오전 배송 부탁" />
          </Field>
        </div>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="addSuggested"
          defaultChecked
          disabled={suggested === 0}
          className="mt-0.5 size-4 accent-primary"
        />
        <span className="grid gap-0.5">
          <span className="font-medium">
            {suggested > 0 ? `부족 품목 ${suggested}개 바로 담기` : "담을 부족 품목 없음"}
          </span>
          <span className="text-xs text-muted-foreground">
            기본 거래처가 이 거래처인 품목 중 재고가 없거나 부족한 것을, 부족 기준의 2배까지 채우는 수량으로 담습니다.
          </span>
        </span>
      </label>
      {state?.error && <FormMessage state={state} />}
      <SubmitButton pending={pending} pendingText="만드는 중…" className="w-full sm:w-fit">
        발주서 만들기
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- 머리 정보

export function OrderHeaderForm({ order }: { order: PurchaseOrder }) {
  const { state, pending, formProps } = useFormAction(updateOrderAction);
  useToastResult(state);
  return (
    <form {...formProps} className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
      <input type="hidden" name="orderId" value={order.id} />
      <Field label="입고 희망일" htmlFor="order-expected">
        <Input id="order-expected" name="expectedOn" type="date" defaultValue={order.expectedOn ?? ""} key={order.expectedOn} />
      </Field>
      <Field label="메모" htmlFor="order-memo">
        <Input id="order-memo" name="memo" maxLength={500} defaultValue={order.memo ?? ""} key={order.memo} />
      </Field>
      <SubmitButton pending={pending} pendingText="저장 중…" variant="outline">
        저장
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- 작성 중: 줄 편집

function DraftLineRow({ orderId, line, item }: { orderId: string; line: OrderLine; item?: OrderItemOption }) {
  const { state, pending, formProps } = useFormAction(updateLineAction);
  useToastResult(state?.error ? state : undefined);
  return (
    <li className="grid gap-2 py-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">{line.itemName}</span>
        <span className="ml-auto text-sm tabular-nums text-muted-foreground">
          {line.unitPrice === null ? "단가 없음" : won(Math.round(line.quantity * line.unitPrice))}
        </span>
        <ActionButton
          action={removeLineAction}
          fields={{ orderId, lineId: line.id }}
          variant="ghost"
          size="icon-sm"
          pendingText="…"
          aria-label={`${line.itemName} 빼기`}
        >
          <Trash2 />
        </ActionButton>
      </div>
      <form
        key={`${line.quantity}:${line.unitId}:${line.unitPrice}`}
        {...formProps}
        className="grid grid-cols-[5rem_7rem_1fr_auto] items-center gap-2"
      >
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="lineId" value={line.id} />
        <Input
          name="quantity"
          inputMode="decimal"
          defaultValue={line.quantity}
          aria-label={`${line.itemName} 수량`}
          className="tabular-nums"
        />
        <NativeSelect name="unitId" defaultValue={line.unitId ?? ""} aria-label={`${line.itemName} 단위`}>
          <option value="">{BASE_UNIT_LABEL[line.baseUnit]}</option>
          {(item?.units ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </NativeSelect>
        <WonInput name="unitPrice" defaultValue={line.unitPrice ?? ""} aria-label={`${line.itemName} 단가`} />
        <SubmitButton pending={pending} pendingText="…" variant="outline" size="sm">
          저장
        </SubmitButton>
      </form>
    </li>
  );
}

function AddLineForm({ orderId, items, existingItemIds, costs }: {
  orderId: string;
  items: OrderItemOption[];
  existingItemIds: string[];
  /** 품목별 최근 입고 단가 (기본 단위 1개당 원) */
  costs: Record<string, number>;
}) {
  const { state, pending, formProps } = useFormAction(addLineAction);
  useToastResult(state?.ok ? state : undefined);
  const available = items.filter((i) => !existingItemIds.includes(i.id));
  const [itemId, setItemId] = useState(available[0]?.id ?? "");
  const item = available.find((i) => i.id === itemId) ?? available[0];
  const defaultUnitId = item?.units.find((u) => u.isDefaultPurchase)?.id ?? "";
  const [unitId, setUnitId] = useState(defaultUnitId);
  const [quantity, setQuantity] = useState("");

  // 담기에 성공하면 다음 품목으로 넘어간다.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) {
      setQuantity("");
      const next = available.find((i) => i.id !== itemId);
      setItemId(next?.id ?? "");
      setUnitId(next?.units.find((u) => u.isDefaultPurchase)?.id ?? "");
    }
  }

  if (!item) return <p className="text-sm text-muted-foreground">더 담을 품목이 없습니다.</p>;
  const factor = item.units.find((u) => u.id === unitId)?.factor ?? 1;
  const cost = costs[item.id];
  const suggestedPrice = cost === undefined ? "" : String(Math.round(cost * factor));

  return (
    <form {...formProps} className="grid gap-3 rounded-lg border border-dashed p-3">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_5rem_7rem_8rem_auto] sm:items-end">
        <Field label="품목" htmlFor="line-item">
          <NativeSelect
            id="line-item"
            name="itemId"
            value={item.id}
            onChange={(e) => {
              const next = available.find((i) => i.id === e.target.value);
              setItemId(e.target.value);
              setUnitId(next?.units.find((u) => u.isDefaultPurchase)?.id ?? "");
            }}
          >
            {available.map((i) => (
              <option key={i.id} value={i.id}>
                {i.categoryName ? `${i.name} · ${i.categoryName}` : i.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="수량" htmlFor="line-quantity">
          <Input
            id="line-quantity"
            name="quantity"
            inputMode="decimal"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="0"
            required
          />
        </Field>
        <Field label="단위" htmlFor="line-unit">
          <NativeSelect id="line-unit" name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
            <option value="">{BASE_UNIT_LABEL[item.baseUnit]}</option>
            {item.units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({formatQuantity(u.factor, item.baseUnit)})
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="단가 (선택)" htmlFor="line-price">
          {/* 품목·단위가 바뀌면 최근 입고 단가로 다시 채운다. */}
          <WonInput id="line-price" name="unitPrice" key={`${item.id}:${unitId}`} defaultValue={suggestedPrice} />
        </Field>
        <SubmitButton pending={pending} pendingText="담는 중…">
          담기
        </SubmitButton>
      </div>
      {state?.error && <FormMessage state={state} />}
    </form>
  );
}

export function DraftLines({ order, items, costs, suggestionCount }: {
  order: PurchaseOrder;
  items: OrderItemOption[];
  costs: Record<string, number>;
  /** 더 담을 수 있는 부족 품목 수 */
  suggestionCount: number;
}) {
  const itemById = new Map(items.map((i) => [i.id, i]));
  return (
    <div className="grid gap-4">
      {order.lines.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          아직 담은 품목이 없습니다.
        </p>
      ) : (
        <ul className="divide-y">
          {order.lines.map((line) => (
            <DraftLineRow key={line.id} orderId={order.id} line={line} item={itemById.get(line.itemId)} />
          ))}
        </ul>
      )}
      {suggestionCount > 0 && (
        <ActionButton action={addSuggestedAction} fields={{ orderId: order.id }} variant="outline" pendingText="담는 중…">
          부족 품목 {suggestionCount}개 담기
        </ActionButton>
      )}
      <AddLineForm orderId={order.id} items={items} existingItemIds={order.lines.map((l) => l.itemId)} costs={costs} />
    </div>
  );
}

// ---------------------------------------------------------------- 상태 버튼

export function StatusButtons({ order }: { order: PurchaseOrder }) {
  const button = (status: PurchaseOrderStatus, label: string, variant: "default" | "outline" | "ghost", confirmMessage?: string) => (
    <ActionButton
      key={status}
      action={changeStatusAction}
      fields={{ orderId: order.id, status }}
      confirmMessage={confirmMessage}
      variant={variant}
      size="lg"
    >
      {label}
    </ActionButton>
  );
  switch (order.status) {
    case "draft":
      return (
        <div className="flex flex-wrap gap-2">
          {button("ordered", `발주하기 · ${won(orderTotal(order.lines))}`, "default")}
          {button("cancelled", "발주서 취소", "ghost", "이 발주서를 취소할까요?")}
        </div>
      );
    case "ordered":
      return (
        <div className="flex flex-wrap gap-2">
          {button("draft", "작성 중으로 되돌리기", "outline")}
          {button("cancelled", "발주 취소", "ghost", "발주를 취소할까요? 거래처에도 따로 알려 주세요.")}
        </div>
      );
    case "partially_received":
      return button("received", "남은 수량 없이 마감", "outline", "남은 수량은 더 들어오지 않는 것으로 마감할까요?");
    default:
      return null;
  }
}

// ---------------------------------------------------------------- 발주 내용 복사

export function CopyOrderButton({ order, storeName }: { order: PurchaseOrder; storeName: string }) {
  const [copied, setCopied] = useState(false);
  const text = [
    `[${storeName}] 발주 요청`,
    order.expectedOn && `입고 희망일: ${dayLabel(order.expectedOn)}`,
    "",
    ...order.lines.map((l) => `- ${l.itemName} ${orderQty(l, l.quantity)}`),
    order.memo && `\n메모: ${order.memo}`,
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n");

  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          toast.success("발주 내용을 복사했습니다. 카카오톡이나 문자에 붙여 넣으세요.");
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error("복사하지 못했습니다.");
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
      발주 내용 복사
    </Button>
  );
}

// ---------------------------------------------------------------- 입고 처리

interface ReceiveRow {
  quantity: string;
  unitPrice: string;
  expiresOn: string;
}

export function ReceiveForm({ order }: { order: PurchaseOrder }) {
  // 다 들어오면 이 폼이 화면에서 사라지므로 알림은 액션이 끝난 자리에서 띄운다.
  const { state, pending, formProps } = useFormAction(receiveAction, { toastResult: true });
  const initialRows = () =>
    Object.fromEntries(
      order.lines.map((l) => [
        l.id,
        {
          // 남은 수량을 미리 채운다. (다 들어왔으면 0)
          quantity: String(Math.max(roundQty(l.quantity - l.receivedQuantity), 0)),
          unitPrice: l.unitPrice === null ? "" : String(l.unitPrice),
          expiresOn: "",
        },
      ]),
    ) as Record<string, ReceiveRow>;
  const [rows, setRows] = useState<Record<string, ReceiveRow>>(initialRows);
  // 입고에 성공하면 새 남은 수량으로 다시 채운다. (order 는 같은 응답으로 이미 새 값이다)
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.ok) setRows(initialRows());
  }
  const set = (lineId: string, patch: Partial<ReceiveRow>) =>
    setRows((r) => ({ ...r, [lineId]: { ...r[lineId]!, ...patch } }));

  const payload = order.lines.map((l) => ({
    lineId: l.id,
    quantity: Number(rows[l.id]!.quantity.replace(/,/g, "")) || 0,
    unitPrice: rows[l.id]!.unitPrice.replace(/,/g, ""),
    expiresOn: rows[l.id]!.expiresOn,
  }));
  const receiving = payload.filter((p) => p.quantity > 0).length;

  return (
    <form {...formProps} className="grid gap-4">
      <input type="hidden" name="orderId" value={order.id} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <ul className="divide-y">
        {order.lines.map((line) => {
          const row = rows[line.id]!;
          const needsExpiry = line.trackExpiry && (Number(row.quantity) || 0) > 0;
          return (
            <li key={line.id} className="grid gap-2 py-3">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="font-medium">{line.itemName}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  주문 {orderQty(line, line.quantity)}
                  {line.receivedQuantity > 0 && ` · 입고 ${orderQty(line, line.receivedQuantity)}`}
                </span>
              </div>
              <div className="grid grid-cols-[6rem_1fr] gap-2 sm:grid-cols-[7rem_9rem_10rem]">
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(e) => set(line.id, { quantity: e.target.value })}
                    aria-label={`${line.itemName} 이번 입고 수량`}
                    className="pr-9 tabular-nums"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-muted-foreground">
                    {line.unitName ?? BASE_UNIT_LABEL[line.baseUnit]}
                  </span>
                </div>
                <WonInput
                  value={row.unitPrice}
                  onChange={(e) => set(line.id, { unitPrice: e.target.value })}
                  aria-label={`${line.itemName} 단가`}
                />
                {line.trackExpiry && (
                  <Input
                    type="date"
                    value={row.expiresOn}
                    onChange={(e) => set(line.id, { expiresOn: e.target.value })}
                    aria-label={`${line.itemName} 유통기한`}
                    required={needsExpiry}
                    className="col-span-2 sm:col-span-1"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-muted-foreground">
        실제로 들어온 수량을 입력하세요. 일부만 들어왔으면 그만큼만 입고하고, 나머지는 나중에 입고하거나 마감합니다.
      </p>
      <SubmitButton pending={pending} disabled={receiving === 0} pendingText="입고 중…" size="lg" className="w-full sm:w-fit">
        {receiving > 0 ? `입고 처리 · ${receiving}개 품목` : "입고 수량을 입력해 주세요"}
      </SubmitButton>
    </form>
  );
}

// ---------------------------------------------------------------- 읽기 전용 줄

export function OrderLinesView({ order }: { order: PurchaseOrder }) {
  return (
    <ul className="divide-y">
      {order.lines.map((l) => (
        <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2.5 text-sm">
          <span className="font-medium">{l.itemName}</span>
          <span className="tabular-nums">{orderQty(l, l.quantity)}</span>
          {l.receivedQuantity > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">입고 {orderQty(l, l.receivedQuantity)}</span>
          )}
          <span className="ml-auto tabular-nums text-muted-foreground">
            {l.unitPrice === null ? "단가 없음" : `${won(l.unitPrice)} × ${roundQty(l.quantity)} = ${won(Math.round(l.quantity * l.unitPrice))}`}
          </span>
        </li>
      ))}
    </ul>
  );
}
