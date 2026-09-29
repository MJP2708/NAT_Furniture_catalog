import Form from "next/form";

/** Plain GET form to /search, so it works before any JavaScript loads. */
export function SearchBox({ className = "", defaultValue = "" }: { className?: string; defaultValue?: string }) {
  return (
    <Form action="/search" className={`flex items-center border-b border-ink/70 ${className}`} role="search">
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="ค้นหารหัสหรือประเภทสินค้า"
        aria-label="ค้นหาสินค้า"
        className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted"
      />
      <button type="submit" className="eyebrow px-1 py-2 hover:text-accent" aria-label="ค้นหา">
        Search
      </button>
    </Form>
  );
}
