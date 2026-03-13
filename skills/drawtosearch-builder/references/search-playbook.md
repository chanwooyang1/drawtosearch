# DrawToSearch Search Playbook

## Retrieval order

1. Use the user text as the strongest signal.
2. Add heuristic entity guesses from recognizable hints.
3. Add free vision-model guesses only when available.
4. Merge candidates, dedupe queries, then fetch provider results.

## Provider rules

- NAVER Image Search is the primary in-app provider.
- Google is handoff-first for v1.
- If credentials are missing, return deterministic mock cards instead of failing the request.

## Quality rules

- Candidate chips should be understandable labels, not raw tags.
- Query variants should stay short and user-readable.
- Confidence is directional only; do not present it as certainty.

## Logging rules

- Log session summaries, generated candidates, clicks, and feedback.
- Do not log raw sketch images by default.
