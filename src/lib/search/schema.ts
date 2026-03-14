import { z } from "zod";

const sketchSummarySchema = z.object({
  aspectBucket: z.enum(["wide", "tall", "square"]),
  complexity: z.enum(["minimal", "medium", "dense"]),
  dominantGeometry: z.enum(["round", "angular", "organic", "mixed"]),
  elementCount: z.number().int().nonnegative().max(500),
  hasClosedShapes: z.boolean(),
  repeatedMarks: z.boolean(),
  typeCounts: z.object({
    arrow: z.number().int().nonnegative().max(500),
    diamond: z.number().int().nonnegative().max(500),
    ellipse: z.number().int().nonnegative().max(500),
    freedraw: z.number().int().nonnegative().max(500),
    line: z.number().int().nonnegative().max(500),
    rectangle: z.number().int().nonnegative().max(500),
    text: z.number().int().nonnegative().max(500),
  }),
});

const retryContextSchema = z.object({
  previousSessionId: z.string().uuid().nullable().optional().default(null),
  rejectedEntities: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
});

export const searchInputSchema = z.object({
  hasDrawing: z.boolean().default(false),
  locale: z.string().trim().min(2).default("ko-KR"),
  retryContext: retryContextSchema.nullable().optional().default(null),
  sketchDataUrl: z
    .string()
    .trim()
    .regex(/^data:image\/(png|jpeg|jpg);base64,/, "PNG or JPEG data URL only")
    .nullable()
    .optional()
    .default(null),
  sketchSummary: sketchSummarySchema.nullable().optional().default(null),
  userText: z.string().trim().max(280).default(""),
});

export const clickEventSchema = z.object({
  eventType: z.enum(["candidate_click", "result_click", "handoff_click"]),
  sessionId: z.string().uuid(),
  target: z.string().trim().min(1).max(400),
  targetRank: z.number().int().positive().max(100).optional(),
});

export const feedbackEventSchema = z.object({
  feedback: z.enum(["match", "miss"]),
  sessionId: z.string().uuid(),
});
