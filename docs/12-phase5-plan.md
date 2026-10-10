# Phase 5 — multiple users and hardening

> **Status:** **5.1 done** (2026-10-08): owner/staff roles, `/admin/users`, migration 0011; **admin role + role changes added 2026-10-10** (no migration — `role` is a text enum). **5.2 done** (2026-10-08): three-key login throttle, unlock on `/admin/users`. **5.3 done** (2026-10-08): version check on hive edit and product rows, once-keys on order transitions, migration 0012. **5.4 done** (2026-10-08): contact buttons LINE / Messenger / phone (replaces LINE notifications). **5.5 done** (2026-10-08): outbox for hive records and photos, installable app. Phase 5 complete apart from the palm module.

## Work order

| # | Item | Why |
|---|---|---|
| **5.1** | **Owner / staff roles** | Must exist before a second user is added. |
| 5.2 | Per-email login throttle | Lockout was keyed only by email + IP; rotating IPs gave unlimited guesses. |
| 5.3 | Optimistic concurrency (two people editing the same hive/order) | Needed once there is more than one user. |
| ~~5.4~~ | ~~LINE notifications~~ | Dropped (2026-10-08): the owner talks to buyers on Facebook or by phone, so nobody would read them. |
| 5.4 | Contact buttons: LINE · Messenger · phone | Public buttons were LINE-only; buyers actually use Facebook and phone. |
| 5.5 | "Saved even if the signal drops" (outbox) | Signal at the hives is slow and drops often (owner, 2026-10-08); records are made at the hive. |
| — | Palm module | Scope still to be agreed with the owner. |

## 5.1 Roles (as built)

Decisions (user, 2026-10-08, "as recommended"): staff have **no** access to sales; staff **may** edit basic hive info without money fields; temporary passwords **must** be changed at first login.

Added 2026-10-10 (owner's request, "as recommended"): an **admin** role that can do everything the owner can **except manage users**, and the owner can **change roles** (staff ↔ admin ↔ owner).

| Area | Owner | Admin | Staff |
|---|---|---|---|
| Dashboard | everything | everything | hive work only; no order rows, sales totals or readiness link |
| Hive: view history, record work (honey, split, queen cells, note, collapse) | ✅ | ✅ | ✅ |
| Hive: purchase price, supplier, sale price, sold price | ✅ | ✅ | ❌ hidden; server ignores submitted values |
| Hive: list for sale / mark sold | ✅ | ✅ | ❌ (status only active ↔ collapsed; a sold hive cannot be changed) |
| Add hive / edit hive info | ✅ | ✅ | ✅ without purchase price |
| Hive internal notes | ✅ | ✅ | ✅ (needed for work — free text, may mention who a hive was bought from) |
| Order codes in hive history ("ขายตามออเดอร์ S…") | ✅ | ✅ | masked (`maskOrderCodes`) |
| Photos, photo queue, incomplete data | ✅ | ✅ | ✅ |
| Production + weather | ✅ | ✅ | ✅ (no link to settings) |
| Honey lots: create, bottle, print labels | ✅ | ✅ | ✅ without bottling cost or bottles sold |
| Sales: orders, customers, products/prices, reports, CSV | ✅ | ✅ | ❌ 403 |
| Settings, readiness | ✅ | ✅ | ❌ 403 |
| Users (`/admin/users`) | ✅ | ❌ 403 (owner only) | ❌ 403 |
| Own account / password | ✅ | ✅ | ✅ |

**Enforcement (three layers):**
1. `src/middleware.ts` + `pathAllowed()` (`src/lib/permissions.ts`) — `MANAGER_ONLY` paths (sales, products, reports, settings, readiness) need owner or admin (`canManageFarm`); `OWNER_ONLY` (`/admin/users`) needs owner (`canManageUsers`). Others get the "no permission" page (403); POSTs and file downloads get a bare 403.
2. Server functions ignore or refuse money/sales input from staff: `updateHive`/`createHive` (purchase price), `updateSale`, `changeStatus`/`fillMissing` (`statusTargets`), `addBottling` (unit cost).
3. Pages hide menus, fields and columns (`canManageFarm`; the users menu item uses `canManageUsers`).

**Users page:** the owner adds staff (name + email); the system generates a temporary password, shown once, with a copy-to-LINE button. Submitting the same form twice issues a fresh password for the same account instead of a duplicate. Disable (ends all sessions at once, reversible) and reset password (new temporary password, ends sessions). When adding a user the owner picks **staff** or **admin**. Each row has a role select ("เปลี่ยนบทบาท", with a confirm): staff ↔ admin ↔ owner. A role change ends that user's sessions and is written to the audit log (`user.role` {from, to}). Nobody can change, disable or reset their **own** account here, and another owner must first be demoted before it can be disabled or reset — so the farm always keeps at least one owner. The first owner is still created with `scripts/create-owner.ts`.

**Tests:** `src/server/users.test.ts` (admin cannot manage users; staff → admin → owner → admin; no self change; owners not disabled directly) and `src/lib/permissions.test.ts` (`pathAllowed` per role). `check:forms` section 15 — real staff login, forced password change, menus, 403s, tampered POSTs (sale, sold status, purchase price), "recorded by", disable/enable. `check:staff` — logs in as that staff user and scans every staff-reachable page (all hives, edit pages, lots, labels) for real supplier/customer/order/payment data, money amounts and links to owner pages, and checks owner paths return 403.

## 5.2 Login throttle (as built)

`src/lib/auth/throttle.ts` — failed logins in a rolling 15-minute window, counted under three hashed keys in `login_attempts` (no migration):

| Key | Limit | Stops |
|---|---|---|
| email + IP (unchanged format) | 5 | one person or bot guessing from one place |
| email, any IP | 10 | a bot rotating IPs against one account |
| IP, any email | 30 | password spraying many accounts from one place (30 leaves room for staff sharing the farm's internet) |

- When locked, the login page answers "ลองผิดหลายครั้งเกินไป" **without checking the password**, so locked attempts tell an attacker nothing.
- A successful login clears only its own email + IP key. The per-email and per-IP counts stay, so the owner logging in does not hand a guessing bot a fresh allowance.
- Reaching the per-email limit on a real account writes `login.locked` to `audit_logs`.
- `/admin/users` shows failed attempts per account in the last 15 minutes. The owner can **unlock** a staff account, which deletes its per-email key.
- **Trade-off (accepted):** someone deliberately guessing the owner's password can stop the owner logging in *on a new device* for about 15 minutes. Devices already logged in keep working, since sessions last 30 days. The owner row on `/admin/users` explains this when it happens.
- IP comes from `cf-connecting-ip`, which Cloudflare sets in production. Locally, `check:forms` section 16 uses the same header to simulate rotating IPs.
- **Review round 3 (2026-10-10):** the attempt is now recorded *before* the password check (`claimAttempt`), then counted. Before, many simultaneous requests all read the old count and every one was checked (25 parallel requests → 25 checks against a limit of 10). Locked attempts and successful logins delete their own rows, so locks still expire 15 minutes after the last real failure. IPv6 addresses count per /64 (`ipBucket`). The current-password check on `/admin/account` is counted per user (it was per user + IP). Tests: `src/server/auth.test.ts`.

## 5.3 Concurrent edits (as built)

**Overwrite forms (optimistic concurrency).** The hive edit form and product variant rows send the row's `updated_at` (hidden `version`). The server updates `WHERE id = ? AND updated_at = version` (`src/server/versioned.ts`, `src/lib/concurrency.ts`).
- If no row matches, someone saved first. Nothing is written, and the audit row is skipped too: `auditIfChanged` uses `insert … select … where changes() > 0` in the same batch.
- The page keeps what the user typed and shows `ConflictNotice`: who saved first (from `audit_logs`) and when, plus each field where the user's value differs from the latest. A **"ใช้ค่าล่าสุด"** button per field copies the latest value in. The version moves to latest, so saving again is a deliberate overwrite.
- Product rows: stock changes from orders also bump `updated_at`. So a tab left open on the products page can no longer write an old stock number back after a sale. That was a real bug even with one user.
- Forms rendered before the deploy (no `version`) save without the check.

**Order transitions (real bug fixed).** `applyPaid` only guarded the order row (`stock_applied = 0`). The stock statements after it in the same batch still ran, so two concurrent "ชำระแล้ว" requests deducted stock twice. Two concurrent cancels restocked twice.
- Now paid, fulfilled and cancelled each start their batch with `once(db, key)`: an insert into `once_keys`. The second concurrent request hits the PK and its whole batch rolls back.
- **Review round 2 (2026-10-09):** the key was per *target* status (`…:paid`), so two *different* buttons pressed together (pay + cancel, or cancel + fulfil) both committed: a cancelled order came back as paid, or a cancel left stock deducted. The key is now per *source* status (`order:<id>:<created_at>:from:<status>`), so every transition out of the same state collides. The losing request re-reads the order: it returns ok only if the order already has the status it wanted, otherwise an error naming the current status.
- **Orders and hives (round 2):** `hive_holds` (migration 0013, PK `hive_id`) ties a hive to one order, inserted in the create batch (two orders for the same hive at once → one fails) and deleted on cancel. While held, a hive cannot be marked sold by hand or listed for sale; once sold through an order its status cannot be changed by hand (cancel the order instead). Collapsing a held hive is allowed (it happens) and blocks payment. `order_items.stock_taken = 1` marks hives the order really sold, so cancel reverts only those. "Paid now" orders are created as awaiting and then paid by the normal step, so a failed payment step leaves a payable order, and resubmitting the form finishes it.
- Tests: `src/server/orders.test.ts` runs these against a temporary D1 with the real migrations (`src/server/test-d1.ts`), including the 0013 backfill of existing orders.
- `created_at` is in the key because local resets reuse ids. `import:excel` clears `once_keys`.
- `check:forms` section 17 fires 4 simultaneous pay and cancel requests. With the guard removed it reproduced the bug (stock 7 → 3); with it, 7 → 5 → 7.

**Not covered (single-owner pages, last write wins):** customer edit, order note, settings, hive "list for sale". Concurrent bottling of the same lot could slightly exceed the lot's remaining ml; that is rare and visible on the lot page.

## 5.4 Contact buttons (as built)

Decision (user, 2026-10-08): plain links that open a chat or a call. No LINE Official Account and no Messaging API. Facebook may be a Page **or** a personal profile.

- **Settings** (`/admin/settings`):
  - optional Messenger link (`contact.messengerUrl`)
  - **primary channel** (`contact.primary`: messenger · line · phone, default messenger)
  - a blank channel is hidden; test links for each channel
- **Messenger link** (`messengerBase` in `src/lib/contact.ts`):
  - the explicit m.me link wins
  - otherwise derived from the Facebook URL: `facebook.com/<name>` · `fb.me/<name>` → `m.me/<name>`; `profile.php?id=` and `people/<name>/<id>` → `m.me/<id>`
  - share links cannot be converted, so the settings page tells the owner to paste an m.me link
- **Buttons:** `components/ContactButtons.astro` and the layout's floating button / mobile bottom bar use `contactActions()`.
  - The primary channel is the big button; the other filled channels are smaller.
  - Labels follow the context (ask / order / training / queue).
  - LINE pre-fills the message. Messenger sends `?text=` as well, but because m.me often ignores it, the click copies the message first (`scripts/contact-copy.ts`) and opens a dialog with the copied text, three steps (open → long-press → paste) and a "เปิด Messenger" button (2026-10-10; it used to show a hint for 0.6 s and leave). On product/training pages the bottom contact bar slides away while the in-page buttons are on screen.
  - Phone buttons show what to mention ("บอกว่าสนใจรัง A25").
- **Public pages:** "How to order" text, the contact page (primary first, labelled), and the footer (Messenger link added) are no longer LINE-specific.
- **Back office:**
  - order channel "โทรศัพท์" added (text enum, no migration); a new order's default channel follows the primary channel
  - summary/copy wording says "chat" instead of LINE
  - customer "chat name" label
- `predeploy-check` needs at least one real channel, and requires the primary channel to be real. A LINE ID is no longer mandatory.
- **Tests:**
  - `src/lib/contact.test.ts`
  - `check:forms` section 18 — Messenger primary, copy then open m.me, phone primary with LINE hidden, contact page order, unconvertible share link warning, settings restored
  - section 5 also scans Messenger links and copied text for sample prices

## 5.5 Outbox for weak signal (as built)

Owner's answers (2026-10-08):
- signal at the hives is **slow and drops often** (not absent)
- records are usually made at the hive, sometimes later at home
- the owner uses **Android**; the admin uses **iPhone**

So there is no offline page viewing and no service worker. Instead, saving goes through a local queue that behaves the same on both platforms.

- **Hive record forms** (`data-outbox` on honey / queen cells / split / note / status):
  - `src/scripts/outbox.ts` stores the submission in IndexedDB first, then sends it with `Accept: application/json` (15 s timeout). The hive page answers JSON.
  - **Sent:** go to the result page as before (reloads when only the `#hash` differs).
  - **Server rejects** (422): the item is dropped from the queue and the form is submitted natively, so the server shows field errors as usual.
  - **Network fails / timeout / session expired:** the item stays queued. The form is cleared for the next record (date kept), and the user is told "เก็บไว้ในเครื่องแล้ว".
  - **Storing on the device fails:** the user is told the truth ("ยังไม่ได้บันทึก"), and the form keeps its values.
- **Photos** (hive media page, photo queue page) go through the same queue. Resized files are stored as ArrayBuffer, because WebKit cannot store Blob/File in IndexedDB reliably. The existing `batch` id prevents duplicates.
- **Retry triggers:** page load, the `online` event, returning to the tab, and every 30 s while items remain. Items run in order and stop at the first network or session failure. Web Locks prevent two tabs sending at once. Re-sending is safe (`idem` / `batch`).
  - Items belong to the user who made them, and are sent only while that user is logged in.
  - Failed items (bad data) wait on **`/admin/outbox`** with the reason, plus buttons to send again, delete, or open the hive.
  - A **"รอส่ง N"** badge sits above the bottom bar; it turns red when something needs action.
  - Logging out with items pending shows a warning; the items stay on the device.
- **Installable:** `public/manifest.webmanifest` and icons (192/512 from the brand logo), plus "add to home screen" instructions on the menu page (hidden when already installed). This matters for iPhone, which keeps site storage longer for installed apps.
- **Not built:** offline page viewing, editing or adding hives offline, background sending after the app is closed (Android Background Sync). Revisit only if field use shows a need.
- **Tests:**
  - `src/scripts/outbox-core.test.ts`
  - **`npm run check:offline`** (Chromium) and **`-- --webkit`** (iPhone engine) cover: 3 records offline → all sent once; reply lost after the server saved → no duplicate; >15 s slow → queued then one record; bad hive code online (field error) and offline (waits with reason, deletable); session expired → sent after login; photo offline → exactly one photo.
  - WebKit simulates the dropped signal by aborting server requests, because Playwright's WebKit offline mode also blocks reading local files.
  - `check:forms` section 4 and `check:mobile` field flow now expect queue behaviour.
- **Found while building:** a toast covering the next form's button for 6 s would have swallowed the next tap. It is now `pointer-events-none`.
- **Review round 3 (2026-10-10):**
  - **Order and pacing:** records are sent before photos. A server error (5xx, 408/425/429) on one item no longer stops the run; network/timeout/session failures still do. Photos that time out (or drop after ≥ 5 s, so data was spent) and server errors back off per item: 30 s → 1 → 2 → 4 → 8 → 10 min (`nextAt`, `afterSend` in `outbox-core.ts`). Records and instant network failures are retried every round. The `online` event, "ส่งตอนนี้" and "ส่งอีกครั้ง" ignore the backoff. After 8 server errors an item becomes "ต้องแก้".
  - **Truncated replies:** a JSON reply that cannot be read (signal dropped mid-response) is retried instead of being marked "ต้องแก้" — the server may already have saved it, and re-sending is safe.
  - **Runs:** a request that arrives while a run is in progress queues another run (the "ส่งตอนนี้" button used to do nothing then). Forced requests always run; timer requests are dropped if the run stopped on a bad network; duplicate `online` events within 1.5 s of a forced run merge into it.
  - **IndexedDB:** every operation has an 8 s timeout. A failed transaction drops the cached connection and retries once (iPhone loses the connection after the app is backgrounded, without a `close` event). Results are written back only if the item still exists. If the list cannot be read, the badge keeps its state and the outbox page says so instead of "sent".
  - **Pages:** form and photo-queue errors restore the buttons; the photo queue keeps resized photos with a "ส่งอีกครั้ง" button; 403 items link to `/admin/account`; pending items show the next automatic try; a saved record shows "บันทึกแล้ว — กำลังโหลดหน้า…" before navigating (weak signal may fail the reload); the toast stays in the DOM (`role=status`) and only its text changes; the install tip warns that an installed iPhone app does not see items queued in Safari.
  - `check:offline` sections 9–11 (truncated reply, server error does not block + backoff + send now, lost IndexedDB connection) fail on the previous code.
