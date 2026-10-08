"use client";

import { startTransition, useActionState, useEffect, useRef, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

/** 폼 제출 중에는 비활성화되고 문구가 바뀌는 버튼 */
export function SubmitButton({
  children,
  pendingText = "처리 중…",
  className,
  variant,
  size,
  "aria-label": ariaLabel,
  pending: pendingProp,
  disabled = false,
}: {
  children: React.ReactNode;
  /** 제출할 수 없는 상태 (예: 입력값 없음) */
  disabled?: boolean;
  /** useFormAction 처럼 form action 을 쓰지 않는 폼은 직접 넘긴다. */
  pending?: boolean;
  pendingText?: React.ReactNode;
  "aria-label"?: string;
  className?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
}) {
  const status = useFormStatus();
  const pending = pendingProp ?? status.pending;
  return (
    <Button
      type="submit"
      disabled={pending || disabled}
      className={className}
      variant={variant}
      size={size}
      aria-label={ariaLabel}
    >
      {pending ? pendingText : children}
    </Button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state?.error && !state?.message) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={cn("text-sm", state.error ? "text-destructive" : "text-muted-foreground")}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** 네이티브 select. 폼 제출과 모바일 키보드에서 가장 안정적이다. */
export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:bg-input/30",
        className,
      )}
      {...props}
    />
  );
}

/** 서버 액션 결과를 토스트로 띄운다. 덧붙인 안내(notice)가 있으면 아래에 보여주고 더 오래 남긴다. */
function toastResult(state: ActionState) {
  if (state?.error) toast.error(state.error);
  else if (state?.message) {
    toast.success(
      state.message,
      state.notice
        ? { description: state.notice, duration: 12_000, classNames: { description: "whitespace-pre-line" } }
        : undefined,
    );
  }
}

/** 서버 액션 결과를 토스트로 보여준다. */
export function useToastResult(state: ActionState) {
  useEffect(() => toastResult(state), [state]);
}

/**
 * 서버 액션을 쓰는 폼. `<form action>` 으로 넘기면 React가 제출 후 결과와 상관없이 입력칸을 비우므로,
 * 직접 제출해서 오류가 나도 입력값이 남게 한다. resetOnSuccess 면 성공했을 때만 초기값으로 되돌린다.
 * toastResult 면 액션이 끝난 자리에서 바로 알림을 띄운다. 성공하면 폼이 화면에서 사라지는 곳(예: 입고 완료)은
 * useToastResult 로는 결과와 함께 폼이 사라져 알림이 뜨지 않으므로 이것을 쓴다.
 */
export function useFormAction<T extends NonNullable<ActionState> = NonNullable<ActionState>>(
  action: (prev: T | undefined, formData: FormData) => Promise<T | undefined>,
  { resetOnSuccess = false, toastResult: toastOnDone = false }: { resetOnSuccess?: boolean; toastResult?: boolean } = {},
) {
  const [state, dispatch, pending] = useActionState<T | undefined, FormData>(async (prev, formData) => {
    const result = await action(prev, formData);
    if (toastOnDone) toastResult(result);
    return result;
  }, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state?.ok) formRef.current?.reset();
  }, [state, resetOnSuccess]);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };

  return { state, pending, formProps: { ref: formRef, onSubmit } };
}

/**
 * 서버 액션 하나를 부르는 버튼 (삭제·취소처럼 누르면 그 줄이 사라지는 곳).
 * useActionState 로 결과를 받으면 줄이 사라지면서 결과도 함께 사라져 알림이 뜨지 않으므로,
 * 액션이 끝난 자리에서 바로 알림을 띄운다.
 */
export function ActionButton({
  action,
  fields,
  confirmMessage,
  children,
  pendingText = "처리 중…",
  variant,
  size,
  "aria-label": ariaLabel,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** 액션에 넘길 값 (폼의 hidden input 대신) */
  fields: Record<string, string>;
  /** 있으면 누를 때 확인을 받는다. */
  confirmMessage?: string;
  children: React.ReactNode;
  pendingText?: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  "aria-label"?: string;
}) {
  const [pending, startActionTransition] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pending}
      aria-label={ariaLabel}
      onClick={() => {
        if (confirmMessage && !confirm(confirmMessage)) return;
        const formData = new FormData();
        for (const [key, value] of Object.entries(fields)) formData.set(key, value);
        startActionTransition(async () => {
          const result = await action(undefined, formData);
          toastResult(result);
        });
      }}
    >
      {pending ? pendingText : children}
    </Button>
  );
}
