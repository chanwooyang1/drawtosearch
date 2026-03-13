import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  GOOGLE_CUSTOM_SEARCH_API_KEY: z.string().min(1).optional(),
  GOOGLE_CUSTOM_SEARCH_CX: z.string().min(1).optional(),
  HUGGINGFACE_API_KEY: z.string().min(1).optional(),
  HUGGINGFACE_VISION_MODEL: z
    .string()
    .min(1)
    .default("Qwen/Qwen2.5-VL-3B-Instruct"),
  NAVER_CLIENT_ID: z.string().min(1).optional(),
  NAVER_CLIENT_SECRET: z.string().min(1).optional(),
});

export const env = envSchema.parse({
  ...process.env,
  HUGGINGFACE_VISION_MODEL:
    process.env.HUGGINGFACE_VISION_MODEL ?? "Qwen/Qwen2.5-VL-3B-Instruct",
});
