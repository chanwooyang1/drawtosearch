---
name: drawtosearch-builder
description: Build and evolve the DrawToSearch mobile-first sketch-to-image-search service. Use when working on DrawToSearch product features, Excalidraw canvas UX, entity candidate generation, query expansion, NAVER or Google search-provider integrations, anonymous logging, AGENTS.md updates, or search-quality experiments for this repo.
---

# DrawToSearch Builder

## Overview

Use this skill when the task touches the DrawToSearch product itself rather than generic frontend work. The service turns a rough sketch plus a short hint into candidate identities, image results, and external search handoff links.

## Quick Start

- Read `references/architecture.md` before changing app structure.
- Read `references/search-playbook.md` before changing candidate generation or provider behavior.
- Keep the mobile flow in this order: sketch, text hint, candidate chips, image results, feedback.
- Prefer a working fallback path over blocking on missing API keys.

## Workflow

### 1. Preserve the product shape

- Keep the UX Korean-first.
- Preserve the anonymous-first privacy default.
- Treat raw sketch persistence as out of scope unless the user explicitly asks for it.
- Keep Google search as handoff-first unless official provider configuration is available.

### 2. Change the search pipeline safely

- Treat user text as the primary retrieval signal.
- Treat free vision inference as additive, not required.
- When adding heuristics, encode them as small, understandable rules tied to observable hints.
- When changing provider behavior, keep demo/mock results working for local development without credentials.

### 3. Keep implementation boundaries clean

- Put request validation in `src/lib/search/schema.ts`.
- Put candidate generation and ranking in `src/lib/search/`.
- Put persistence behind DB helper functions so the app still runs without `DATABASE_URL`.
- Prefer feature flags or env-based adapters over hard-coded provider branches in UI code.

### 4. Update repo instructions when behavior changes

- If the stack, privacy defaults, or provider strategy changes, update `AGENTS.md`.
- If the workflow or heuristics change materially, update the reference docs in this skill.

## References

- `references/architecture.md`: repo structure, boundaries, and default stack
- `references/search-playbook.md`: retrieval rules, provider expectations, and fallback logic

## Scripts

- `scripts/print-provider-readiness.sh`: quick check for local env readiness when debugging provider behavior
