import { z } from "zod";

const optionalEnvString = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}, z.string().min(1).optional());

const envSchema = z.object({
  DATABASE_URL: optionalEnvString,
  GOOGLE_CUSTOM_SEARCH_API_KEY: optionalEnvString,
  GOOGLE_CUSTOM_SEARCH_CX: optionalEnvString,
  HUGGINGFACE_API_KEY: optionalEnvString,
  HUGGINGFACE_VISION_MODEL: z
    .string()
    .min(1)
    .default("Qwen/Qwen2.5-VL-3B-Instruct"),
  LITELLM_API_BASE: optionalEnvString,
  LITELLM_API_KEY: optionalEnvString,
  LITELLM_MODEL: z.string().min(1).default("drawtosearch-reasoner"),
  NAVER_CLIENT_ID: optionalEnvString,
  NAVER_CLIENT_SECRET: optionalEnvString,
  UPSTAGE_API_KEY: optionalEnvString,
  UPSTAGE_MODEL: z.string().min(1).default("solar-pro2"),
});

export const env = envSchema.parse({
  ...process.env,
  HUGGINGFACE_VISION_MODEL:
    process.env.HUGGINGFACE_VISION_MODEL ?? "Qwen/Qwen2.5-VL-3B-Instruct",
  LITELLM_MODEL: process.env.LITELLM_MODEL ?? "drawtosearch-reasoner",
  UPSTAGE_MODEL: process.env.UPSTAGE_MODEL ?? "solar-pro2",
});
