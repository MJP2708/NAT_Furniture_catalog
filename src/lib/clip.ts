/** The image model used for photo search, shared by the indexing script and the browser.
 * Both sides must use the same model and quantisation so their vectors are comparable. */
export const CLIP_MODEL = "Xenova/clip-vit-base-patch32";
export const CLIP_DTYPE = "q8" as const;
export const CLIP_DIMS = 512;
