# MetaFarm Design System: MASTER

The single source of truth for colors, fonts, spacing, icons and UX rules on both the public site and the admin app. Every new page (Phase 4–5 included) must follow it. The tokens are implemented in `src/styles/global.css` under `@theme` and `@utility`.

- **Created:** 2026-10-07
- **Basis:** recommendations from the `ui-ux-pro-max` skill (`--design-system "organic farm honey local business natural"`), adjusted for Thai and for the existing brand.
- **Overrides:** a page that needs different rules gets its own file at `design-system/metafarm/pages/<page>.md`. That file wins over this one.

## 1. Style

- **Organic Biophilic.** Natural greens with honey gold, rounded corners, soft shadows, plenty of whitespace.
- **One brand across the public site and the admin app.** The admin app is denser (more information per screen), but uses the same colors, buttons and icons.
- **Avoid:**
  - purple/pink gradients
  - glassmorphism
  - heavy motion
  - mixing styles

## 2. Colors (from the logo)

| Token | Value | Use |
|---|---|---|
| `palm-600` | `#0b7a3e` | Main action button (white text, contrast 5.6:1) |
| `palm-700` | `#096232` | Links, brand text, icons |
| `palm-900` | `#053a1e` | Focus ring, strong headings |
| `palm-50` / `palm-100` | `#eaf5ee` / `#cfe8d8` | Icon backgrounds, selected state, success notices |
| `honey-400` | `#f2c230` | Sample-data banner, "for sale" badge (**text on it must be `ink`**) |
| `honey-700` | `#8a6500` | Text and icons in amber (e.g. ???, honey volume) |
| `ink` / `muted` | `#1f2a24` / `#5b6a61` | Main text / secondary text (contrast ≥ 4.5:1 on white) |
| `line`, `surface`, `canvas` | | Borders, card background, page background |
| `danger` | `#b42318` | Errors, destructive actions |

- **Never put raw hex values in components.** Use the tokens above.
- **One exception:** the LINE button `#05803a`, the brand's green adjusted for contrast.

## 3. Fonts

- **Noto Sans Thai Variable for the whole site.** It is self-hosted and loads with `font-display: swap`.
  - The skill suggested Lora/Raleway. **Neither has Thai glyphs**, so they can't be used.
  - IBM Plex Sans Thai was considered and rejected because it adds another 30–40 KB to download.
- **Body text:** at least 16px, line height 1.55. Markdown articles use `.prose-mf` at 1.0625rem / 1.8.
- **Headings:** weight 700. h1, h2 and h3 use `text-wrap: balance`.
- **Numbers compared side by side** (stats, prices): add the `data-num` attribute to get fixed-width digits.

## 4. Spacing, corners, shadows

- **Spacing:** a 4px grid (Tailwind's scale).
  - Cards: `p-4`.
  - Between sections: `mt-12` on the public site, `mt-6` in the admin app.
- **Corners:**
  - Buttons and inputs: `rounded-xl` (12px).
  - Cards: `rounded-2xl` (16px).
  - Large panels and the hero: `rounded-3xl`.
- **Shadows** (two levels only):
  - `shadow-card` for normal cards.
  - `shadow-raised` for hover and for floating bars.
- **Container widths:**
  - Main content: `max-w-5xl`.
  - Body text: 46rem (`.prose-mf`).

## 5. Ready-made components (`@utility`)

| Class | Use |
|---|---|
| `btn-primary` | One main action per screen |
| `btn-ghost` | Secondary actions |
| `btn-danger` | Delete, and status changes that can't be undone (must use `data-confirm`) |
| `btn-honey` | Selling-related actions (list for sale) |
| `card` | Content box |
| `card-link` | A whole card that is clickable. Lifts on hover, presses down on tap |
| `field`, `label`, `hint`, `error` | Forms. Put `error` in the same box as its field (`admin-forms.ts` links it to the field with aria) |
| `badge` | Short status label |
| `disclosure` | Header of a collapsible `<details>`, with an arrow that rotates |
| `skip-link` | "ข้ามไปเนื้อหาหลัก" link. Already in both layouts |

Components:
- `Icon`, `NotFound`, `HiveCard`, `HowToOrder`, `SampleBadge`
- Layouts: `PublicLayout` (`canonical`, `ogImage`, `jsonLd`) and `AdminLayout` (`back`)

## 6. Icons

- **Never use emoji as icons.** Use `<Icon name="…" />` (Lucide, outline style, stroke width 2).
- **Names are semantic,** e.g. `honey`, `queen`, `passport`. The table is in `src/lib/icons.ts`.
- **A new icon** must be added in both places:
  - the table in `src/lib/icons.ts`
  - the glob list in `Icon.astro`

  The `icons.test.ts` test checks they match.
- **Decorative icons next to text:** don't pass `label` (they are `aria-hidden`).
- **An icon that stands alone with meaning:** pass `label="…"`.
- **Size:**
  - `size-5` in menus and buttons.
  - `size-6`/`size-7` for large icons.
  - Inside running text: `inline-block size-[1.15em] align-[-0.2em]`.
- **Feature icons:** put them in a box `grid size-12 place-items-center rounded-2xl bg-palm-50 text-palm-700`.

## 7. Motion

- **Tokens:**
  - `--duration-fast` (150ms): press and hover.
  - `--duration-base` (220ms): open and close.
  - `--ease-out-soft` for easing.
- **Only animate** `transform`, `opacity` and colors. Never animate width/height directly.
  - The one exception is `<details>`, which uses the `::details-content` block-size transition.
- **Every animation must respect** `prefers-reduced-motion`. A global rule in `global.css` already handles this.

## 8. UX rules (from the skill, priority 1–9)

1. **Accessibility:**
   - Contrast ≥ 4.5:1.
   - The two-tone focus ring must never be removed.
   - Alt text on images.
   - Headings go in order h1 → h2 → h3.
   - Never convey meaning with color alone (add an icon or text).
2. **Touch:**
   - Tap targets ≥ 44×44px (`min-h-11`), with at least 8px between them.
   - Visual feedback within 100ms (`active:`).
   - `touch-action: manipulation`.
3. **Performance:**
   - Images in WebP with `srcset` (`photoSrcset`/`thumbUrl`).
   - Declare width/height on images.
   - Lazy-load images below the fold.
4. **Style:** one icon set, one main action per screen, consistent shadows and corners.
5. **Layout:**
   - Mobile first. Breakpoints: `sm` 640, `md` 768, `lg` 1024.
   - No horizontal scrolling.
   - Fixed bars must reserve padding underneath (`scroll-padding`).
6. **Fonts and color:** see sections 2–3.
7. **Motion:** see section 7.
8. **Forms:**
   - Every field has a label (no placeholder-only fields).
   - Errors appear under the field.
   - The button is locked while saving (`admin-forms.ts`).
   - Ask for confirmation before anything that can't be undone.
9. **Navigation:**
   - The admin bottom bar has at most 5 items (ภาพรวม · รัง · ➕ บันทึก · สินค้า · เมนู).
   - Back links go in the top bar.
   - Deep links use `?do=…#form-…`.

## 9. Checklist before shipping a new page

- [ ] Checked at 375, 768, 1024 and 1440px. No horizontal scroll.
- [ ] No emoji used as icons (`<Icon>` only).
- [ ] Every clickable element is at least 44px, has a pointer cursor, and responds when pressed.
- [ ] Text contrast is at least 4.5:1. The focus ring shows when tabbing with the keyboard.
- [ ] Images have width/height and alt text.
- [ ] Empty states have a message and a next step for the user.
- [ ] `npm run check:mobile`, `check:browser` and `check:forms` (admin pages) all pass.
