# Uslub AI — hackathon repo rules

AI marketing department for small businesses in Uzbekistan (MARS hackathon, Techstars Startup Week Tashkent). Deploy deadline: 16:30 Tashkent time, 24 Nov 2026.

## Stack
Next.js 16 App Router · React 19 · TypeScript · Tailwind 4 · @xyflow/react (node canvas) · motion · lucide-react · zustand · Neon Postgres (`src/lib/db.ts`, tagged-template SQL only) · grammY bot · Anthropic SDK (`src/lib/ai.ts`) · Vercel (fra1).

## File ownership (parallel agents — edit only your paths)
- **Studio UI agent:** `src/app/page.tsx`, `src/app/concept/**`, `src/app/studio/**`, `src/app/pitch/**`, `src/components/**`, `src/app/globals.css`, `src/app/layout.tsx`, `public/**` except `public/generated/**`.
- **Engine agent:** `src/lib/uslub/**` (except `contract.ts`), `src/app/api/uslub/**`, `src/lib/bot.ts`, `db/schema.sql`, `tests/**`, `docs/quality/**`.
- **Assets agent:** `public/generated/**`, `docs/marketing/**`.
- **Brain agent:** `src/lib/uslub/brain/**`, `src/app/api/uslub/analyze/**`, `src/app/api/uslub/strategy/**`, `tests/brain/**`, `docs/brain/**`.
- **Lead (main session) only:** `package.json`, `pnpm-lock.yaml`, `src/lib/uslub/contract.ts`, `src/lib/env.ts`, `CLAUDE.md`, merges and production deploys. Ask the lead for new dependencies — do not run `pnpm add`.

## Rules
- The contract is `src/lib/uslub/contract.ts`. Code against it; do not change it.
- Never commit or print secrets. `.env.local` is gitignored.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; commit only your own paths.
- Copy must not sound machine-written: no "neuro-words" (see the editor/anti-cliché filter).
- UI languages: Uzbek (Latin) first, Russian, English.
