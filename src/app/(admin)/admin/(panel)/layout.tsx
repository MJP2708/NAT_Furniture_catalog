import Link from "next/link";

import { Logo } from "@/components/logo";

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
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 sm:px-6 md:flex-nowrap">
          <Link href="/admin" className="flex items-baseline gap-2">
            <Logo className="h-6" />
            <span className="eyebrow text-muted">Admin</span>
          </Link>
          <nav className="scrollbar-none -mx-4 order-last flex w-[calc(100%+2rem)] items-center gap-1 overflow-x-auto px-3 text-sm whitespace-nowrap md:order-none md:mx-0 md:w-auto md:px-0">
            {NAV.map(([href, th, en]) => (
              <Link key={href} href={href} className="rounded-full px-3 py-1 hover:bg-panel">
                {th} <span className="hidden text-xs text-muted sm:inline">{en}</span>
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-4 text-sm whitespace-nowrap">
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
