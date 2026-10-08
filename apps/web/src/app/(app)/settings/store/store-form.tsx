"use client";

import { Field, NativeSelect, SubmitButton, useFormAction, useToastResult } from "@/components/form-parts";
import { PercentInput } from "@/components/percent-input";
import { Input } from "@/components/ui/input";
import { updateStoreAction } from "./actions";

export function StoreForm({
  name,
  timeZone,
  targetCostRate,
  timeZoneOptions,
}: {
  name: string;
  timeZone: string;
  targetCostRate: number;
  timeZoneOptions: { value: string; label: string }[];
}) {
  const { state, pending, formProps } = useFormAction(updateStoreAction);
  useToastResult(state);

  return (
    <form {...formProps} className="grid gap-4">
      {/* 저장된 값이 바뀌면 입력칸을 새로 그려 저장된 값을 보여준다. */}
      <fieldset key={JSON.stringify([name, timeZone, targetCostRate])} className="grid gap-4 sm:grid-cols-2">
        <Field label="매장 이름" htmlFor="store-name">
          <Input id="store-name" name="name" defaultValue={name} maxLength={50} required />
        </Field>
        <Field
          label="시간대"
          htmlFor="store-timezone"
          hint="'오늘' 매출, 유통기한까지 남은 날, 지난 날짜 판매의 마감 시각, 화면의 기록 시각이 이 시간대를 따릅니다."
        >
          <NativeSelect id="store-timezone" name="timeZone" defaultValue={timeZone}>
            {timeZoneOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="목표 원가율"
          htmlFor="store-target-cost-rate"
          hint="메뉴 원가율이 이 값을 넘으면 메뉴·대시보드·리포트에 표시하고, 맞추려면 얼마에 팔아야 하는지 알려 줍니다. 메뉴마다 따로 정할 수도 있습니다."
        >
          <PercentInput id="store-target-cost-rate" name="targetCostRate" defaultValue={targetCostRate} required />
        </Field>
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="저장 중…">
          저장
        </SubmitButton>
      </div>
    </form>
  );
}
