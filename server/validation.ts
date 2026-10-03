import { z } from "zod";
export const pagination = z.object({
  q: z.string().trim().max(100).default(""),
  sort: z.enum(["latest", "popular", "title"]).default("latest"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});
export const idParams = z.object({ id: z.string().uuid() });
export const audioSchema = z.object({
  volume: z.number().min(0).max(100),
  resonance: z.number().min(0).max(65),
  tone: z.enum(["grand", "bright", "mellow", "electric"]),
});
export const sessionSchema = z
  .object({
    id: z.string().uuid(),
    pieceId: z.string().min(1).max(200),
    title: z.string().min(1).max(160),
    mode: z.enum(["practice", "single-note"]),
    targetTrackId: z.string().max(200).nullable(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    activeMs: z.number().int().min(0).max(86400000),
    matched: z.number().int().min(0).nullable(),
    attempted: z.number().int().min(0).nullable(),
  })
  .refine(
    (v) =>
      new Date(v.endedAt).getTime() >= new Date(v.startedAt).getTime() &&
      v.activeMs <=
        new Date(v.endedAt).getTime() -
          new Date(v.startedAt).getTime() +
          1000 &&
      ((v.matched === null && v.attempted === null) ||
        (v.matched !== null &&
          v.attempted !== null &&
          v.matched <= v.attempted)),
    "Invalid practice timing or feedback",
  );
