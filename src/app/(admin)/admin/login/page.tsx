import { notFound } from "next/navigation";

import { Logo } from "@/components/logo";
import { isCustomerSite } from "@/lib/site";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  if (isCustomerSite) notFound();
  return (
    <main className="mx-auto max-w-sm px-4 py-24">
      <Logo className="h-12" />
      <h1 className="mt-6 text-2xl">ผู้ดูแลระบบ</h1>
      <p className="mt-1 text-sm text-muted">Admin · แก้ไขข้อมูลสินค้า</p>
      <LoginForm />
    </main>
  );
}
