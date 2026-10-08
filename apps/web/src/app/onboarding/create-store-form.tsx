"use client";

import { CAFE_TEMPLATE } from "@cafe/core";
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
      <div className="flex items-start gap-2">
        <input id="store-template" name="template" type="checkbox" defaultChecked className="mt-0.5 size-4 accent-primary" />
        <div className="grid gap-0.5">
          <label htmlFor="store-template" className="text-sm font-medium">
            카페 기본 품목·메뉴로 시작하기
          </label>
          <p className="text-xs text-muted-foreground">
            원두·우유·컵 등 품목 {CAFE_TEMPLATE.items.length}개와 아메리카노·라떼 등 메뉴 {CAFE_TEMPLATE.menus.length}개, 레시피를 넣어 둡니다. 나중에 고치거나 보관할 수 있습니다.
          </p>
        </div>
      </div>
      <FormMessage state={state} />
      <SubmitButton className="w-full" pending={pending} pendingText="만드는 중…">
        매장 만들기
      </SubmitButton>
    </form>
  );
}
