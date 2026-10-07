"use client";

import { Field, NativeSelect, SubmitButton, useFormAction, useToastResult } from "@/components/form-parts";
import { Input } from "@/components/ui/input";
import { updateStoreAction } from "./actions";

export function StoreForm({
  name,
  timeZone,
  timeZoneOptions,
}: {
  name: string;
  timeZone: string;
  timeZoneOptions: { value: string; label: string }[];
}) {
  const { state, pending, formProps } = useFormAction(updateStoreAction);
  useToastResult(state);

  return (
    <form {...formProps} className="grid gap-4">
      {/* 저장된 값이 바뀌면 입력칸을 새로 그려 저장된 값을 보여준다. */}
      <fieldset key={JSON.stringify([name, timeZone])} className="grid gap-4 sm:grid-cols-2">
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
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="저장 중…">
          저장
        </SubmitButton>
      </div>
    </form>
  );
}
