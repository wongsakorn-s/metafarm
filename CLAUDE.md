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
