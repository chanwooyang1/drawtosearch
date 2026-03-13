import { z } from "zod";

export const searchInputSchema = z.object({
  hasDrawing: z.boolean().default(false),
  locale: z.string().trim().min(2).default("ko-KR"),
  sketchDataUrl: z
    .string()
    .trim()
    .regex(/^data:image\/(png|jpeg|jpg);base64,/, "PNG or JPEG data URL only")
    .nullable()
    .optional()
    .default(null),
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
