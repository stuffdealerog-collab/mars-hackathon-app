# Mercat — hackathon repo rules

Mercat (formerly "Uslub AI"; internal paths still use `uslub`) — AI marketing department for small businesses in Uzbekistan (built at the MARS AI Hackathon, Techstars Startup Week Tashkent 2026).

## Stack
Next.js 16 App Router · React 19 · TypeScript · Tailwind 4 · @xyflow/react (node canvas) · motion · lucide-react · zustand · Neon Postgres (`src/lib/db.ts`, tagged-template SQL only) · grammY bot · Anthropic SDK (`src/lib/ai.ts`) · Vercel (fra1).

## File ownership (parallel agents — edit only your paths)
Current sprint (2026-11-25 client demo): plan, decisions and streams in `docs/sprint/2026-11-25-plan.md`.
- **Engine session (`engine`):** `src/lib/uslub/**` except `contract.ts`, `media/**`, `visual/**`, `publish.ts`; `src/app/api/uslub/**` except `media/**`, `visual/**`; `src/lib/bot.ts`, `src/lib/i18n.ts`, `tests/**`, `docs/brain/**`, `docs/quality/**`.
- **Images session (`images`):** `src/lib/uslub/media/**`, `src/lib/uslub/visual/**`, `src/lib/uslub/publish.ts`, `src/app/api/uslub/media/**`, `src/app/api/uslub/visual/**`, `src/components/media/**` (self-contained components the Studio imports), `docs/creative/media-pipeline.md`.
- **Studio UX session (`studio-ux`):** `src/app/**` except `src/app/api/**` and `src/app/tg/**`; `src/components/**` except `src/components/media/**`; `src/app/globals.css`, `public/**`, `DESIGN.md`, `PRODUCT.md`, `.impeccable/**`.
- **Mini App session (`miniapp`):** `src/app/tg/**`, `src/components/miniapp/**` (imports the shared studio/lamp/ui pieces, never edits them).
- **Pitch film session (`pitch-film`):** `docs/video/film/**`.
- Desktop Studio + Mini App spec: `docs/sprint/product-spec.md`.
- **Lead (main session) only:** `package.json`, `pnpm-lock.yaml`, `src/lib/uslub/contract.ts`, `src/lib/env.ts`, `db/schema.sql`, `next.config.ts`, `vercel.json`, `CLAUDE.md`, `docs/sprint/**`, merges and production deploys. Ask the lead for new dependencies, contract or schema changes — do not run `pnpm add`, do not edit those files.

## Rules
- The contract is `src/lib/uslub/contract.ts`. Code against it; do not change it.
- Never commit or print secrets. `.env.local` is gitignored.
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; commit only your own paths.
- Copy must not sound machine-written: no "neuro-words" (see the editor/anti-cliché filter).
- UI languages: Uzbek (Latin) first, Russian, English.
