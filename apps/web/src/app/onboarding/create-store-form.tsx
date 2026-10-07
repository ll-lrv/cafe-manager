"use client";

import { Field, FormMessage, SubmitButton, useFormAction } from "@/components/form-parts";
import { Input } from "@/components/ui/input";
import { createStoreAction } from "./actions";

export function CreateStoreForm() {
  const { state, pending, formProps } = useFormAction(createStoreAction);
  return (
    <form {...formProps} className="grid gap-4">
      <Field label="매장 이름" htmlFor="store-name" hint="나중에 바꿀 수 있습니다.">
        <Input id="store-name" name="name" placeholder="예) 커피앤브레드 성수점" maxLength={50} required />
      </Field>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingText="만드는 중…">
        매장 만들기
      </SubmitButton>
    </form>
  );
}
