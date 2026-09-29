type Envelope = {
  widthMin?: number | null;
  widthMax: number | null;
  depthMin?: number | null;
  depthMax: number | null;
  heightMin?: number | null;
  heightMax: number | null;
};

/** mm → "74.5" (cm, at most one decimal). */
function cm(mm: number) {
  return (Math.round(mm) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function cmRange(min: number | null | undefined, max: number) {
  return min != null && min !== max ? `${cm(min)}–${cm(max)}` : cm(max);
}

/** Catalogue-style size line: "120W x 60D x 74.5H cm" (ranges as "43–76.5H"). */
export function formatEnvelope(e: Envelope) {
  const parts = (
    [
      ["W", e.widthMin, e.widthMax],
      ["D", e.depthMin, e.depthMax],
      ["H", e.heightMin, e.heightMax],
    ] as const
  ).filter(([, , max]) => max);
  return parts.length ? parts.map(([k, min, max]) => `${cmRange(min, max!)}${k}`).join(" x ") + " cm" : "";
}

/** "44–97" or "87" in cm for a [min, max] range given in mm. */
export function formatRange([min, max]: [number, number]) {
  return cmRange(min, max);
}
