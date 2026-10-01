"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { CLIP_DTYPE, CLIP_MODEL } from "@/lib/clip";
import { formatEnvelope } from "@/lib/format";

type Result = {
  slug: string;
  code: string;
  typeTh: string | null;
  typeEn: string | null;
  widthMin: number | null;
  widthMax: number | null;
  depthMin: number | null;
  depthMax: number | null;
  heightMin: number | null;
  heightMax: number | null;
  thumb: string | null;
  score: number;
};

export type VisualSearchText = {
  title: string;
  lead: string;
  upload: string;
  camera: string;
  dropHint: string;
  privacy: string;
  loadingModel: string;
  firstTime: string;
  analysing: string;
  searching: string;
  bestMatch: string;
  similar: string;
  noMatch: string;
  tryAnother: string;
  error: string;
  viewProduct: string;
};

type Stage = { kind: "idle" } | { kind: "model"; progress: number } | { kind: "embed" } | { kind: "search" } | { kind: "done" } | { kind: "error"; message: string };

// Loaded once per page visit; the browser caches the model files for later visits.
let modelPromise: Promise<{ embed: (img: Blob) => Promise<number[]> }> | null = null;

function loadModel(onProgress: (p: number) => void) {
  modelPromise ??= (async () => {
    const { AutoProcessor, CLIPVisionModelWithProjection, RawImage, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;
    const files = new Map<string, number>();
    const progress_callback = (e: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (e.status === "progress" && e.file && e.total) {
        files.set(e.file, (e.loaded ?? 0) / e.total);
        onProgress([...files.values()].reduce((a, b) => a + b, 0) / Math.max(files.size, 1));
      }
    };
    // Use the GPU only if the browser can actually provide one; many report WebGPU but have no adapter.
    let webgpu = false;
    try {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
      webgpu = !!(gpu && (await gpu.requestAdapter()));
    } catch {
      webgpu = false;
    }
    const processor = await AutoProcessor.from_pretrained(CLIP_MODEL, { progress_callback });
    const model = await CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, {
      dtype: CLIP_DTYPE,
      device: webgpu ? "webgpu" : "wasm",
      progress_callback,
    }).catch(() =>
      // the GPU path can still fail on some drivers; fall back to WebAssembly
      CLIPVisionModelWithProjection.from_pretrained(CLIP_MODEL, { dtype: CLIP_DTYPE, device: "wasm", progress_callback }),
    );
    return {
      embed: async (img: Blob) => {
        const { image_embeds } = await model(await processor(await RawImage.fromBlob(img)));
        return Array.from(image_embeds.data as Float32Array);
      },
    };
  })();
  modelPromise.catch(() => (modelPromise = null));
  return modelPromise;
}

/** Downscale big phone photos before analysis (faster, same result: the model works at 224 px). */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return new Promise((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));
}

export function VisualSearch({ lang, text, productBase }: { lang: "th" | "en"; text: VisualSearchText; productBase: string }) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [preview, setPreview] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [dragging, setDragging] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const run = useCallback(async (file: File) => {
    setPreview(URL.createObjectURL(file));
    setResults([]);
    try {
      setStage({ kind: "model", progress: 0 });
      const model = await loadModel((p) => setStage({ kind: "model", progress: p }));
      setStage({ kind: "embed" });
      const embedding = await model.embed(await shrink(file));
      setStage({ kind: "search" });
      const res = await fetch("/api/visual-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedding }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setResults((await res.json()).results);
      setStage({ kind: "done" });
    } catch (e) {
      console.error(e);
      setStage({ kind: "error", message: text.error });
    }
  }, [text.error]);

  const pick = (files: FileList | null) => {
    const f = files?.[0];
    if (f && f.type.startsWith("image/")) run(f);
  };
  const busy = stage.kind === "model" || stage.kind === "embed" || stage.kind === "search";
  const typeOf = (r: Result) => (lang === "en" && r.typeEn ? r.typeEn : r.typeTh) ?? "";
  const [best, ...rest] = results;

  return (
    <div>
      {/* Drop zone / buttons */}
      <div
        onDragOver={(e) => (e.preventDefault(), setDragging(true))}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => (e.preventDefault(), setDragging(false), pick(e.dataTransfer.files))}
        className={`wash grid gap-6 rounded-tr-[3rem] p-6 sm:p-10 md:grid-cols-[1fr_auto] md:items-center ${dragging ? "ring-2 ring-accent" : ""}`}
      >
        <div>
          <p className="max-w-lg">{text.lead}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" disabled={busy} onClick={() => cameraRef.current?.click()} className="rounded-full bg-ink px-6 py-2.5 text-sm text-canvas hover:bg-accent disabled:opacity-50">
              {text.camera}
            </button>
            <button type="button" disabled={busy} onClick={() => uploadRef.current?.click()} className="rounded-full border border-ink px-6 py-2.5 text-sm hover:border-accent hover:text-accent disabled:opacity-50">
              {text.upload}
            </button>
          </div>
          <p className="mt-3 hidden text-xs text-muted sm:block">{text.dropHint}</p>
          <p className="mt-2 text-xs text-muted">{text.privacy}</p>
          <input ref={uploadRef} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (pick(e.target.files), (e.target.value = ""))} />
        </div>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- local preview of the visitor's photo
          <img src={preview} alt="" className="max-h-56 w-auto justify-self-center rounded-lg border border-line bg-surface object-contain shadow-sm" />
        )}
      </div>

      {/* Progress */}
      {busy && (
        <div className="mt-8 max-w-md" aria-live="polite">
          <div className="text-sm">
            {stage.kind === "model" ? text.loadingModel : stage.kind === "embed" ? text.analysing : text.searching}
          </div>
          {stage.kind === "model" && (
            <>
              <div className="mt-2 h-1 overflow-hidden rounded bg-line">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(stage.progress * 100)}%` }} />
              </div>
              <div className="mt-1 text-xs text-muted">{text.firstTime}</div>
            </>
          )}
        </div>
      )}
      {stage.kind === "error" && <p className="mt-8 text-red-700">{stage.message}</p>}

      {/* Results */}
      {stage.kind === "done" && !best && <p className="mt-8 text-muted">{text.noMatch}</p>}
      {stage.kind === "done" && best && (
        <div className="mt-12">
          <h2 className="eyebrow text-muted">{text.bestMatch}</h2>
          <Link href={`${productBase}/${best.slug}`} className="group mt-3 grid gap-6 border-t border-ink/60 pt-6 sm:grid-cols-[minmax(0,22rem)_1fr]">
            <div className="flex aspect-4/3 items-center justify-center bg-panel/60 p-4">
              {best.thumb && (
                // eslint-disable-next-line @next/next/no-img-element -- product image
                <img src={best.thumb} alt={best.code} className="max-h-full max-w-full object-contain mix-blend-multiply" />
              )}
            </div>
            <div>
              <div className="display text-4xl group-hover:text-accent">{best.code}</div>
              <div className="mt-1 text-lg font-light">{typeOf(best)}</div>
              {formatEnvelope(best) && <div className="font-num mt-3 tabular-nums">{formatEnvelope(best)}</div>}
              <span className="mt-6 inline-block rounded-full bg-ink px-5 py-2 text-sm text-canvas group-hover:bg-accent">{text.viewProduct} →</span>
            </div>
          </Link>

          {rest.length > 0 && (
            <>
              <h2 className="eyebrow mt-14 text-muted">{text.similar}</h2>
              <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {rest.map((r) => (
                  <li key={r.slug}>
                    <Link href={`${productBase}/${r.slug}`} className="group block">
                      <div className="flex aspect-4/3 items-end justify-center overflow-hidden pb-3">
                        {r.thumb && (
                          // eslint-disable-next-line @next/next/no-img-element -- product image
                          <img src={r.thumb} alt={r.code} loading="lazy" className="max-h-full max-w-full object-contain" />
                        )}
                      </div>
                      <div className="border-t border-ink/60 pt-2">
                        <div className="display text-base font-normal group-hover:text-accent">{r.code}</div>
                        <div className="line-clamp-1 text-sm text-muted">{typeOf(r)}</div>
                        {formatEnvelope(r) && <div className="font-num mt-0.5 text-xs tabular-nums text-muted">{formatEnvelope(r)}</div>}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" onClick={() => uploadRef.current?.click()} className="mt-12 text-sm text-accent hover:underline">
            {text.tryAnother}
          </button>
        </div>
      )}
    </div>
  );
}
