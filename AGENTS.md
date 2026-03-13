# AGENTS.md

## Project

- Build DrawToSearch as a mobile-first sketch-to-image-search service.
- Keep Korean UX and query generation first.
- Default stack: Next.js App Router, TypeScript, Excalidraw, Supabase Postgres via Drizzle.
- Prefer anonymous metadata logging. Do not store raw sketches unless the user explicitly asks for it.

## Skills

### Available skills

- drawtosearch-builder: Build or evolve the DrawToSearch service, including the mobile sketch flow, query expansion, search-provider integration, anonymous feedback logging, and repo-specific AGENTS updates. (file: /Users/chanwooyang/workspace/drawtosearch/skills/drawtosearch-builder/SKILL.md)

### How to use skills

- Trigger rules: If the user mentions `$drawtosearch-builder` or asks to build, refine, debug, or document DrawToSearch features, use this skill.
- Context hygiene: Read only the references needed for the requested task.
- Fallback: If provider credentials are missing, preserve the mock/demo path instead of blocking the flow.

## Guardrails

- Keep the main branch deployable.
- Use Conventional Commits in the form `type(scope): summary`.
- Commit only green, meaningful units.
