import Link from "next/link";

import { logout } from "@/app/(admin)/admin/actions";

const NAV = [
  ["/admin", "สินค้า", "Products"],
  ["/admin/review", "รอตรวจสอบ", "Review"],
  ["/admin/categories", "หมวดหมู่", "Categories"],
] as const;

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-20 border-b border-line bg-canvas">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link href="/admin" className="flex items-baseline gap-2">
            <span className="display text-xl tracking-[0.3em]">NAT</span>
            <span className="eyebrow text-muted">Admin</span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            {NAV.map(([href, th, en]) => (
              <Link key={href} href={href} className="rounded-full px-3 py-1 hover:bg-panel">
                {th} <span className="hidden text-xs text-muted sm:inline">{en}</span>
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm">
            <a href="/" target="_blank" className="text-muted hover:text-accent">
              ดูเว็บไซต์ ↗
            </a>
            <form action={logout}>
              <button className="text-muted hover:text-accent">ออกจากระบบ</button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</div>
    </>
  );
}
