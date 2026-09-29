import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto max-w-sm py-12">
      <h1 className="text-3xl">ผู้ดูแลระบบ</h1>
      <p className="mt-1 text-sm text-muted">Admin · แก้ไขข้อมูลสินค้า</p>
      <LoginForm />
    </main>
  );
}
