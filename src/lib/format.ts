type Envelope = { widthMax: number | null; depthMax: number | null; heightMax: number | null };

/** "W 600 × D 580 × H 1,200 mm" from the largest size set. */
export function formatEnvelope({ widthMax, depthMax, heightMax }: Envelope) {
  const parts = [
    ["W", widthMax],
    ["D", depthMax],
    ["H", heightMax],
  ].filter(([, v]) => v) as [string, number][];
  return parts.length ? parts.map(([k, v]) => `${k} ${v.toLocaleString("en-US")}`).join(" × ") + " mm" : "";
}

/** "440–970" or "870" for a [min, max] range in mm. */
export function formatRange([min, max]: [number, number]) {
  return min === max ? min.toLocaleString("en-US") : `${min.toLocaleString("en-US")}–${max.toLocaleString("en-US")}`;
}
