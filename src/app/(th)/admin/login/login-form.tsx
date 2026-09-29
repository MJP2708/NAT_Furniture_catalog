"use client";

import { useActionState } from "react";

import { login } from "@/app/(th)/admin/actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} className="mt-6 space-y-3">
      <input
        type="password"
        name="password"
        required
        autoFocus
        autoComplete="current-password"
        placeholder="รหัสผ่าน · Password"
        className="w-full rounded border border-line bg-surface px-3 py-2 outline-none focus:border-accent"
      />
      {state?.error && <p className="text-sm text-red-700">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-accent py-2 text-sm font-medium text-accent-ink disabled:opacity-60"
      >
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ · Sign in"}
      </button>
    </form>
  );
}
