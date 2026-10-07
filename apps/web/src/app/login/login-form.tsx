"use client";

import { Field, FormMessage, SubmitButton, useFormAction } from "@/components/form-parts";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { login, signup } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const loginForm = useFormAction(login);
  const signupForm = useFormAction(signup);

  return (
    <Tabs defaultValue="login">
      <TabsList className="w-full">
        <TabsTrigger value="login">로그인</TabsTrigger>
        <TabsTrigger value="signup">회원가입</TabsTrigger>
      </TabsList>

      <TabsContent value="login">
        <form {...loginForm.formProps} className="grid gap-4 pt-2">
          <input type="hidden" name="next" value={next} />
          <Field label="이메일" htmlFor="login-email">
            <Input id="login-email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="비밀번호" htmlFor="login-password">
            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          <FormMessage state={loginForm.state} />
          <SubmitButton className="w-full" pending={loginForm.pending} pendingText="로그인 중…">
            로그인
          </SubmitButton>
        </form>
      </TabsContent>

      <TabsContent value="signup">
        <form {...signupForm.formProps} className="grid gap-4 pt-2">
          <input type="hidden" name="next" value={next} />
          <Field label="이름" htmlFor="signup-name" hint="매장 구성원에게 보이는 이름입니다.">
            <Input id="signup-name" name="displayName" autoComplete="name" maxLength={30} required />
          </Field>
          <Field label="이메일" htmlFor="signup-email">
            <Input id="signup-email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="비밀번호" htmlFor="signup-password" hint="6자 이상">
            <Input
              id="signup-password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
            />
          </Field>
          <FormMessage state={signupForm.state} />
          <SubmitButton className="w-full" pending={signupForm.pending} pendingText="가입 중…">
            가입하기
          </SubmitButton>
        </form>
      </TabsContent>
    </Tabs>
  );
}
