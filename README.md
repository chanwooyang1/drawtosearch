# DrawToSearch

DrawToSearch is a mobile-first web experience for sketch-to-image discovery. Users draw a rough memory, add a short hint, and the app turns that into search-ready entity candidates, in-app image cards, and Google/Naver handoff links.

## Stack

- Next.js 16 App Router
- TypeScript + Tailwind CSS 4
- Excalidraw for sketch capture
- Drizzle ORM targeting Supabase Postgres
- Optional NAVER Image Search live provider
- Optional Hugging Face vision inference fallback
- Optional LiteLLM gateway for LLM routing and provider fallback
- Local reference corpus + hybrid reranker for evidence-first retrieval

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` on a phone-sized viewport to see the intended layout.

### Local Postgres

If you want anonymous policy logs and rewards to persist locally, boot the bundled Postgres helper:

```bash
chmod +x scripts/start_local_db.sh scripts/stop_local_db.sh
./scripts/start_local_db.sh
npm run db:push
```

The helper starts a project-local Postgres instance on `127.0.0.1:54322` and prints the `DATABASE_URL` it expects.

## Environment

Only `NAVER_CLIENT_ID` and `NAVER_CLIENT_SECRET` are required for live image results. Without them, the app still works in demo mode with generated mock cards.

Optional variables:

- `HUGGINGFACE_API_KEY`: enables free external vision-assisted candidate generation
- `HUGGINGFACE_VISION_MODEL`: defaults to `Qwen/Qwen2.5-VL-3B-Instruct`
- `LITELLM_API_BASE`, `LITELLM_MODEL`, `LITELLM_API_KEY`: route the LangGraph reasoning agent through a LiteLLM proxy instead of calling Upstage directly
- `GOOGLE_CUSTOM_SEARCH_API_KEY` and `GOOGLE_CUSTOM_SEARCH_CX`: enable Google Custom Search image cards behind the feature hook
- `DATABASE_URL`: enables anonymous search session logging with Drizzle

If `LITELLM_API_BASE` is set, the app treats LiteLLM as the primary OpenAI-compatible gateway for reasoning. This is the easiest way to configure an `Upstage -> Gemini fallback` chain outside the app while keeping the in-repo LangGraph flow unchanged.

Example `.env` snippet:

```bash
LITELLM_API_BASE=http://127.0.0.1:4000
LITELLM_API_KEY=sk-your-proxy-key
LITELLM_MODEL=drawtosearch-reasoner
```

Without LiteLLM, the app falls back to direct Upstage calls:

```bash
UPSTAGE_API_KEY=...
UPSTAGE_MODEL=solar-pro2
```

## Scripts

```bash
npm run dev
npm run corpus:build
npm run lint
npm run build
npm run test
npm run test:e2e
npm run db:push
npm run db:generate
```

## Architecture notes

- Search stays evidence-first. The app converts sketch structure, text hints, clarification answers, and OCR-like vision cues into a shared `EvidenceBundle`.
- Retrieval is hybrid: a local reference corpus is scanned exactly and merged with web image results before reranking.
- The UI only shows final cards and a single clarification question when ambiguity remains after two automatic retrieval passes.
- `npm run corpus:build` rebuilds the local reference artifact. It tries Transformers.js text embeddings first and falls back to heuristic vectors when model download or inference is unavailable.
- The internal LangGraph reasoner can call Upstage directly or go through LiteLLM. When LiteLLM is present, provider fallback such as Gemini should be configured on the proxy side.
- Raw sketches are not persisted in v1. Only derived metadata and anonymous interaction events are stored when `DATABASE_URL` is configured.
- The tracked project skill lives at `skills/drawtosearch-builder/` and is referenced by the repo `AGENTS.md`.
