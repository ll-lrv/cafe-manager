"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { ActionButton, Field, FormMessage, SubmitButton, useFormAction, useToastResult } from "@/components/form-parts";
import { Input } from "@/components/ui/input";
import type { Supplier } from "@/lib/api/suppliers";
import { createSupplierAction, setSupplierArchivedAction, updateSupplierAction } from "./actions";

export function SupplierForm({ supplier, next }: { supplier?: Supplier; next?: string }) {
  const { state, pending, formProps } = useFormAction(supplier ? updateSupplierAction : createSupplierAction);
  useToastResult(supplier ? state : undefined);
  const s = supplier;

  return (
    <form {...formProps} className="grid gap-4">
      {s && <input type="hidden" name="supplierId" value={s.id} />}
      {next && <input type="hidden" name="next" value={next} />}
      {/* 저장된 값이 바뀌면 입력칸을 새로 그려 저장된 값을 보여준다. */}
      <fieldset key={s && JSON.stringify([s.name, s.contactName, s.phone, s.email, s.memo])} className="grid gap-4 sm:grid-cols-2">
        <Field label="거래처 이름" htmlFor="supplier-name">
          <Input id="supplier-name" name="name" defaultValue={s?.name} placeholder="예) 빈스서플라이" maxLength={50} required />
        </Field>
        <Field label="담당자 (선택)" htmlFor="supplier-contact">
          <Input id="supplier-contact" name="contactName" defaultValue={s?.contactName ?? ""} maxLength={30} />
        </Field>
        <Field label="전화번호 (선택)" htmlFor="supplier-phone">
          <Input id="supplier-phone" name="phone" type="tel" defaultValue={s?.phone ?? ""} placeholder="010-0000-0000" maxLength={30} />
        </Field>
        <Field label="이메일 (선택)" htmlFor="supplier-email">
          <Input id="supplier-email" name="email" type="email" defaultValue={s?.email ?? ""} maxLength={100} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="메모 (선택)" htmlFor="supplier-memo">
            <Input id="supplier-memo" name="memo" defaultValue={s?.memo ?? ""} placeholder="예) 화·금 배송, 오후 3시 마감" maxLength={500} />
          </Field>
        </div>
      </fieldset>
      {!s && <FormMessage state={state} />}
      <div className="flex justify-end">
        <SubmitButton pending={pending} pendingText="저장 중…">
          {s ? "저장" : "거래처 만들기"}
        </SubmitButton>
      </div>
    </form>
  );
}

export function ArchiveSupplierButton({ supplierId, archived }: { supplierId: string; archived: boolean }) {
  return (
    <ActionButton
      action={setSupplierArchivedAction}
      fields={{ supplierId, archived: String(!archived) }}
      confirmMessage={archived ? undefined : "이 거래처를 보관할까요? 새 발주서에서 숨겨지고, 지난 발주서는 그대로 남습니다."}
      variant="outline"
      size="sm"
    >
      {archived ? <ArchiveRestore /> : <Archive />}
      {archived ? "다시 거래" : "보관"}
    </ActionButton>
  );
}
