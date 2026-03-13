# DrawToSearch Architecture

## Product shape

- Mobile-first web app
- Sketch canvas using Excalidraw
- Korean-first query generation
- Anonymous interaction logging only

## Default stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Drizzle ORM with Supabase Postgres

## Boundaries

- UI state and user interaction stay in client components.
- Search orchestration stays in route handlers plus `src/lib/search`.
- Persistence stays behind DB helper functions and must no-op cleanly when DB env is missing.

## Non-goals for v1

- No raw sketch persistence
- No mandatory login
- No MCP runtime inside the app yet
- No Google in-app image cards unless explicit API configuration is present
