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
- **Chat-app colors** are tokens (`brand-line` `#05803a`, `brand-messenger` `#0866ff`). Use them **only for the icon** of a contact button.
  - Contact buttons themselves are brand green: `btn-primary` for the primary channel, `btn-ghost` with a coloured icon for the others.
  - UX review 2026-10-08: blue Messenger buttons drowned the brand green.

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
| `scroll-fade` | A row that scrolls sideways (filter chips): fades the right edge so users can see there is more |

Components:
- `Icon`, `NotFound`, `HiveCard`, `HowToOrder` (`kind="training"` for courses), `SampleBadge`
- `Article`: Markdown content + a "ในหน้านี้" table of contents when there are ≥ 3 h2 headings (sticky sidebar on desktop, collapsible on mobile). Optional `header` slot (h1, lead, main photo) sits in the content column so its left edge lines up with the text and the TOC starts beside it. Used by the learn pages, research, training and privacy.
- `CreditPhoto`: the only way to show an illustrative (non-farm) photo; always renders author · license · source under the image.
- `FarmStats`: the farm-numbers strip (home, passport, stingless-bee). One component so it looks the same everywhere.
- Layouts: `PublicLayout` (`canonical`, `ogImage`, `jsonLd`) and `AdminLayout` (`back`)
- `ContactButtons`: the only way to show order/ask buttons on public pages. It follows the owner's primary channel.
  - Show **one set per page**: on product pages pass `HowToOrder buttons={false}`.
  - On desktop the floating contact is a single "ติดต่อเรา" pill that opens the channel list (it must not cover content).
- `Val`: admin values. `???` / empty renders as a muted "ไม่ทราบ" chip, never the raw `???`.
- `SalesTabs`: on mobile all 5 tabs are visible (icon + short label). Don't add a 6th; group it instead.

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
   - The admin bottom bar has at most 5 items (ภาพรวม · รัง · ➕ บันทึก · ขาย · เมนู; staff see ล็อต instead of ขาย).
   - Back links go in the top bar.
   - Deep links use `?do=…#form-…`.

## 8b. Public-page patterns (round 2)

- **Drag to reorder** (gallery admin, 2026-10-11): 44 px grip handle on the photo corner, `touch-none`, floating copy follows the pointer, the original dims as the drop slot, page auto-scrolls near the screen edge, saves on drop and reverts with a message if it fails; keyboard: Space to pick up, arrows to move, Space/Enter to drop, Esc to cancel.
- **Image preview** (2026-10-11): tap any photo → full-screen dark viewer on the same page (counter, caption + credit, prev/next, swipe, ← →, Esc/✕/tap outside closes, zoom to full size, thumbnail shows instantly then swaps to the full image, buttons ≥ 44 px). Public and admin use the same component (`lightbox.ts`).
- **Page heading** (2026-10-10): every menu page except home uses `PageHeader` — h1 `text-3xl md:text-4xl font-bold text-palm-900`, optional italic `sub`, lead `text-lg text-muted leading-relaxed max-w-2xl` (passport: `center`). Same size and colour on every page.
- **Home hero on mobile** mirrors desktop (owner, 2026-10-10): text left-aligned, round logo small at the right of the tagline/h1 (desktop: right column), then lead, buttons, stats (the mobile-only price rows were removed at the owner's request 2026-10-10; prices show in "สินค้าจากฟาร์ม").
- **Home page** follows the Trust & Authority pattern: hero → real numbers from the hive register → story → highlights → learn/buy cards → passport CTA.
- **Card lists on mobile:** icon on the left, text on the right, with a `>` arrow if clickable. On desktop (`md:`), switch to columns with the icon on top.
- **Detail pages with photos** (passport, for-sale hive): photos on the left (main photo + thumbnails), details on the right on desktop. Stacked on mobile.
- **Empty states:** icon in a dashed-border box + a short explanation + next-step buttons (e.g. "จองคิวทางไลน์", "ดูสมุดพกรัง").
- **Footer:** brand · menu (2 columns) · contact (with icons). Links are 44px tall on mobile and 36px on desktop.
- **Learn pages** (round 4, 2026-10-10 — the owner preferred the article layout over a sectioned landing page): `Article` header slot (h1, scientific name if any, one-line lead, main `CreditPhoto` at content width) → Markdown with the TOC on the right → next-step cards (stingless bee) (the full-width photo gallery under the article was removed at the owner's request 2026-10-10) or a research link card (honey — the sizes/prices panel was removed at the owner's request 2026-10-10; prices live on /products).
- **Illustrative photos:** only CC0 / CC BY / CC BY-SA (never NC/ND), via `CreditPhoto` (author · licence · source under every photo — required by the licence). The section-level "not farm photos" note was removed at the owner's request (2026-10-10). Replace them with farm photos when available.
- **Contact page:** the primary channel in a large full-width green panel with one `btn-primary`; other channels in a 2-column list under it on desktop (app colour on the icon only); then the farm location card. The "อยากถามเรื่องไหน" topic list was removed at the owner's request (2026-10-10).
- **Browse without a code** (passport): a photo grid of 8 random hives whose photo and data are complete (`getSampleHives`: active, passport photo, origin/acquired/queen-born known, no ??? notes; uploaded photo preferred), re-picked on every load (`no-cache`), under the search box — no farm-stats strip on this page (owner, 2026-10-10); the search box does not autofocus, so phones don't open the keyboard over the grid.

## 8c. Admin patterns (round 3)

- **Lists:** cards on mobile/tablet; a **table from `lg`** with sortable column headers (`?sort=`) and rows clickable across the whole row (a stretched link on the code cell).
- **Detail pages with a lot of content** (hive page): two columns from **`xl` (≥ 1280px)**. Data and history on the left; record/manage panel on the right, sticky. On mobile, use `display: contents` + `order-*` to keep the field-work order.
- **Long forms:** on mobile, the save button bar sticks above the bottom menu (see the edit/add hive pages).
- **One primary button per screen:** the rest use `btn-ghost` (e.g. readiness highlights the most important pending task).
- **File inputs** use `field-file`.
- **Admin content width:** `max-w-6xl`.
- **Forms use the full content width** (owner, 2026-10-10): long forms are `grid lg:grid-cols-2` with notes/save bar `lg:col-span-2`; no narrow centred column. Hints are one short line — the owner found long explanations confusing.
- **Dashboard:** "เดือนนี้" stat cards each compare with last month (▲/▼ + %, never colour alone), then 12-month `MonthChart`s (one axis each), top hives, recent events. Money cards only for owner/admin.

## 9. Checklist before shipping a new page

- [ ] Checked at 375, 768, 1024 and 1440px. No horizontal scroll.
- [ ] No emoji used as icons (`<Icon>` only).
- [ ] Every clickable element is at least 44px, has a pointer cursor, and responds when pressed.
- [ ] Text contrast is at least 4.5:1. The focus ring shows when tabbing with the keyboard.
- [ ] Images have width/height and alt text.
- [ ] Empty states have a message and a next step for the user.
- [ ] `bun run check:mobile`, `check:browser` and `check:forms` (admin pages) all pass.

## 9. UX review 2026-10-08 (rounds 1–2 applied)

- **One primary action per screen** applies to the quick-record page too. Honey is primary; ordering is secondary.
- **Readability in the field:** badges and stat labels are at least 13px (`text-[0.8125rem]`).
- **Hive page:**
  - a hive that is no longer active shows a notice above the record forms (back-dating is still allowed)
  - on xl screens the honey form opens by default
- **Round 3 (applied 2026-10-09):**
  - **Desktop sidebar:**
    - grouped into งานรัง / ขาย (น้ำผึ้ง for staff) / เว็บไซต์และบัญชี
    - the item list scrolls on its own, and account + logout stay pinned at the bottom
    - desktop items are `min-h-9` (mouse); mobile tap targets stay ≥ 44px
  - **Hive list:** a quick filter chip row (all / active / for sale / sold / collapsed / incomplete) is always visible. Origin stays in the collapsible "ตัวกรองเพิ่มเติม".
  - **Home page:**
    - a "สินค้าจากฟาร์ม" section with "เริ่ม …" prices
    - the hero photo is chosen by the owner (`site.heroHive` in settings → first passport photo of that hive; blank = logo; never chosen automatically)
    - readiness lists it as a "should" item
  - **Mobile footer:** no logo or menu (they duplicate the header); contacts in 2 columns.
