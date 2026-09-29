"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="no-print rounded-full border border-ink px-5 py-2 text-sm hover:border-accent hover:text-accent"
    >
      พิมพ์สเปก · Print spec sheet
    </button>
  );
}
