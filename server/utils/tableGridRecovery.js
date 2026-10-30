import sharp from "sharp";
import { validateTablesAgainstImageGrid } from "./tableImageGrid.js";

export const MAX_GRID_REPAIR_CALLS = 4;

// Reuse a part only when both the answer and the independent grid identify it
// uniquely. Never infer identity from a caption or the model's array position.
export function planGridRecovery(tables, map) {
  if (map.status !== "detected") return null;
  // More returned tables may mean our independent detector missed a grid.
  // Do not silently discard a possibly real table to satisfy the detector.
  if (tables.length > map.tables.length) return null;
  const matches = tables.map(table => map.tables.flatMap((grid, index) => (
    validateTablesAgainstImageGrid([table], { ...map, tables: [grid] }).valid ? [index] : []
  )));
  const kept = map.tables.map((_, index) => {
    const candidates = matches.flatMap((match, t) => match.length === 1 && match[0] === index ? [t] : []);
    return candidates.length === 1 ? tables[candidates[0]] : null;
  });
  const pending = kept.flatMap((table, index) => table ? [] : [index]);
  return pending.length <= MAX_GRID_REPAIR_CALLS ? { kept, pending } : null;
}

export async function cropTableGrid(image, grid) {
  const source = sharp(image, { limitInputPixels: 40_000_000, failOn: "error" });
  const metadata = await source.metadata();
  if (metadata.orientation && metadata.orientation !== 1) throw new Error("GRID_CROP_ORIENTATION");
  const bounds = [grid.xs?.[0], grid.ys?.[0], grid.xs?.at(-1), grid.ys?.at(-1)];
  if (!bounds.every(Number.isFinite)) throw new Error("GRID_CROP_BOUNDS");
  const left = Math.max(0, Math.floor(bounds[0]) - 2), top = Math.max(0, Math.floor(bounds[1]) - 2);
  const right = Math.min(metadata.width, Math.ceil(bounds[2]) + 3);
  const bottom = Math.min(metadata.height, Math.ceil(bounds[3]) + 3);
  if (right <= left || bottom <= top) throw new Error("GRID_CROP_BOUNDS");
  return source.extract({ left, top, width: right - left, height: bottom - top }).png().toBuffer();
}
