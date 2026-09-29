"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the spec sheet on one A4 page: lowers --fit (which scales type, drawings and gaps)
 * until the body no longer overflows. Re-fits after fonts and drawings load, then opens the
 * print dialog when asked (?print=1), so "Save as PDF" gives a one-page file.
 */
export function SheetFit({ children, autoPrint }: { children: React.ReactNode; autoPrint: boolean }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const body = ref.current;
    const sheet = body?.closest<HTMLElement>(".sheet");
    if (!body || !sheet) return;
    let printed = false;

    const overflows = () => body.scrollHeight > body.clientHeight + 1;
    const set = (f: number) => sheet.style.setProperty("--fit", String(Math.round(f * 100) / 100));
    const fit = () => {
      let f = 1;
      set(f);
      if (overflows()) {
        // Long sheets: shrink until everything fits on the page.
        while (overflows() && f > 0.58) set((f -= 0.03));
      } else {
        // Short sheets: grow the drawing and type to use the page, then step back once too far.
        while (!overflows() && f < 1.35) set((f += 0.03));
        if (overflows()) set((f -= 0.03));
      }
      sheet.dataset.fit = String(Math.round(f * 100) / 100);
    };

    const ready = async () => {
      await document.fonts.ready;
      const imgs = [...body.querySelectorAll("img")];
      await Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => ((im.onload = r), (im.onerror = r))))));
      fit();
      sheet.dataset.ready = "1";
      if (autoPrint && !printed) {
        printed = true;
        setTimeout(() => window.print(), 150);
      }
    };
    ready();
    window.addEventListener("beforeprint", fit);
    return () => window.removeEventListener("beforeprint", fit);
  }, [autoPrint]);

  return (
    <div ref={ref} className="sheet-body">
      {children}
    </div>
  );
}
