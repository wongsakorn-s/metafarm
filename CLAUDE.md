## Project: MetaFarm

Website + back office for a stingless bee (ชันโรงขนเงิน) farm. Plans and decisions live in `docs/` (Thai); read `docs/07-decisions.md` and `docs/03-data-model.md` before changing data or features.

- Stack: Astro 7 + React islands + Tailwind 4 on Cloudflare Workers, D1 (Drizzle, `src/db/schema.ts`), R2. Package manager: npm.
- Local only for now — never use `--remote` wrangler commands unless asked.
- `private/` is gitignored and contains supplier PII; never copy its contents into tracked files, tests, or public pages.
- Fields marked 🔒 in `docs/03-data-model.md` (purchase price, supplier, for_sale, customer, notes) must never reach public pages.
- Dates: store ISO `YYYY-MM-DD`, display Buddhist Era via `src/lib/thai-date.ts`.
- Checks: `npm run check`, `npm test`, `npm run build`.
- Back office lives under `src/pages/admin/` (SSR, `prerender = false`); auth in `src/server/auth.ts` + `src/middleware.ts`; all DB access for hives in `src/server/hives.ts`; form validation in `src/lib/validation.ts` (Zod).
- Tailwind 4: shared classes (`btn`, `card`, `field`…) are `@utility` in `src/styles/global.css`, not `@layer components`.
- Local login: `npm run user:create -- --email owner@metafarm.local --generate` (password written to `private/dev-owner.txt`).
- PowerShell 5.1 gotchas when scripting: save scripts with a UTF-8 BOM, and `-WebSession` keeps `-Headers` from earlier calls (use a fresh session to test missing-Origin/CSRF).

- Browser checks use `playwright-core` with the installed Edge/Chrome (`npm run check:browser`); no browser download. Installing packages or running `astro build/check` while `astro dev` runs breaks Vite's dep cache (see below), so stop the dev server first.
- Image uploads: client resize in `src/scripts/resize-image.ts`, server validation by magic bytes in `src/lib/media.ts` + `src/server/media.ts`. Limits: passport 6, sale 3, video 1 (YouTube id only).
- Public pages (`src/pages/index.astro`, `passport/`) read data ONLY through `src/server/public.ts` (explicit column allowlist). After touching it or any public page, run `npm run check:leaks` (needs `npm run dev`). Public images are served from `/img/*` (only keys allowed by `isPublicMediaKey`); `/media/*` is admin-only.
- Products: for-sale hives are read via `getSaleHives/getSaleHive` (forSale + active + price); hive-box/honey come from `products` tables. Real stock is never exposed (only `inStock`); `price_confirmed = 0` shows a "ราคาตัวอย่าง" badge.
- Editable prose lives in `content/` as Markdown (`pages/`, `training/`, `learn/`), loaded by `src/lib/content.ts` and styled with `.prose-mf`. Health-related text (`content/learn/research.md`) must stay cited and claim-free: never write that honey treats/prevents disease; `check:leaks` forbids price words on the research/contact pages. Do not put prose in HTML comments in pages (they ship in the page source) — use `{/* */}`.
- `sitemap.xml`/`robots.txt` are dynamic routes (use the request origin). Training price/duration and course outlines are samples until the owner confirms.
- Deploy prep: `docs/10-deploy-runbook.md`; `npm run predeploy` lists blockers (sample contact info, placeholder D1 id). CSP/HSTS apply only to production builds (`src/lib/security-headers.ts`) — verify changes against `astro preview`, not the dev server. Nothing has been run against real Cloudflare; never run `--remote` wrangler commands, `media:upload:remote -- --yes`, or deploy workflows unless the user asks.
- Password change lives at `/admin/account`; PBKDF2 iteration count is stored inside each hash (lowering `ITERATIONS` keeps old hashes valid).
- Owner-editable settings (contact channels, course price/duration) live in the `settings` table (`src/lib/settings.ts` validation, `src/server/settings.ts`), loaded per request by the middleware into `Astro.locals.settings`; public pages must read contact info from there, never from `site.ts`. Hrefs from settings are validated (https + facebook/google-maps hosts only).
- Pre-launch data work (owner): `/admin/readiness` (checklist), `/admin/photos`, `/admin/todo`, `/admin/settings`. "ไม่ทราบ: topic" notes = owner confirmed unknown. To move local data to production use `npm run snapshot:export`, NOT `seed.sql` (which would discard local edits).
- PowerShell gotchas in test scripts: `$home`, `$pid`, `$host`, `$args` are reserved and a function named `H` collides with the `h` alias (Get-History) — a comparison helper silently returned empty on both sides and "passed"; always print the values you compare.
- Mobile: `npm run check:mobile` emulates devices on Chromium (touch, 44px tap targets, 16px inputs, throttled network/CPU, offline, session expiry). It is emulation only — never WebKit/iOS Safari or a real camera/HEIC. Client uploads go through `src/scripts/upload.ts` (`postUpload` + `describeUploadError`): a redirect to `/admin/login` counts as FAILURE (expired session), network errors show Thai text. Keep interactive elements `min-h-11`. In Playwright mobile emulation `locator.tap()/click()` can hang near the fold; log in with `press(Enter)` and tap by coordinates. Do not mix `ctx.setOffline` with a CDP `Network.emulateNetworkConditions` session (they override each other). Reuse of the same `DataTransfer.files` after the app clears the input yields 0 files — create a fresh one per attempt.
- Admin forms: `src/scripts/admin-forms.ts` (loaded by `AdminLayout`) handles `<form data-confirm="… {field}">` (+ `data-confirm-when="field"`), locks submit buttons after submit, and links `.error` text to its field — so put each `<p class="error">` inside the same wrapper as its input (or add `data-for="id"`), never at form level. Don't add per-page confirm/lock handlers. Event forms must each get their own `idem` (reuse the submitted one only for the form whose `intent` matched); server keys are `ui:{user}:{type}:{idem}` and a repeated key returns ok without writing. New hives dedupe on `hives.create_key`. Uploads: send `Accept: application/json` (done by `postUpload`) so the server returns `{ok, message}` (422 when every file was skipped) instead of a redirect, resize with `resizeAll` (sequential), and send a `batch` id kept across retries — R2 keys become `{batch}-{i}` and repeats are not stored twice. Run `npm run check:forms` (localhost only, writes test data) after touching admin forms/uploads.
- Do not run `astro build` / `astro check` while a dev server is running: it invalidates Vite's dep cache and the running server then 500s (e.g. "file does not exist ... deps_ssr/zod.js"). Stop the dev server first, or restart it afterwards (`astro dev --force`).

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
