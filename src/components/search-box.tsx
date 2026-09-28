import Form from "next/form";

/** Plain GET form to /search, so it works before any JavaScript loads. */
export function SearchBox({ className = "", defaultValue = "" }: { className?: string; defaultValue?: string }) {
  return (
    <Form action="/search" className={`flex ${className}`} role="search">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="ค้นหารหัสสินค้า หรือประเภท เช่น FG 1, โซฟา"
        aria-label="ค้นหาสินค้า"
        className="min-w-0 flex-1 rounded-l-full border border-r-0 border-line bg-surface px-4 py-2 text-sm outline-none focus:border-accent"
      />
      <button type="submit" className="rounded-r-full bg-accent px-4 text-sm font-medium text-accent-ink">
        ค้นหา
      </button>
    </Form>
  );
}
