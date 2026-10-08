# Phase 5 — multiple users and hardening

> **Status:** **5.1 done** (2026-10-08): owner/staff roles, `/admin/users`, migration 0011. **5.2 done** (2026-10-08): three-key login throttle, unlock on `/admin/users`. **5.3 done** (2026-10-08): version check on hive edit and product rows, once-keys on order transitions, migration 0012. **5.4 done** (2026-10-08): contact buttons LINE / Messenger / phone (replaces LINE notifications). Next: 5.5.

## Work order

| # | Item | Why |
|---|---|---|
| **5.1** | **Owner / staff roles** | Must exist before a second user is added. |
| 5.2 | Per-email login throttle | Lockout was keyed only by email + IP; rotating IPs gave unlimited guesses. |
| 5.3 | Optimistic concurrency (two people editing the same hive/order) | Needed once there is more than one user. |
| ~~5.4~~ | ~~LINE notifications~~ | Dropped (2026-10-08): the owner talks to buyers on Facebook or by phone, so nobody would read them. |
| 5.4 | Contact buttons: LINE · Messenger · phone | Public buttons were LINE-only; buyers actually use Facebook and phone. |
| 5.5 | Offline mode for the field | Weak signal in the garden; large piece of work, last. |
| — | Palm module | Scope still to be agreed with the owner. |

## 5.1 Roles (as built)

Decisions (user, 2026-10-08, "as recommended"): staff have **no** access to sales; staff **may** edit basic hive info without money fields; temporary passwords **must** be changed at first login.

| Area | Owner | Staff |
|---|---|---|
| Dashboard | everything | hive work only; no order rows, sales totals or readiness link |
| Hive: view history, record work (honey, split, queen cells, note, collapse) | ✅ | ✅ |
| Hive: purchase price, supplier, sale price, sold price | ✅ | ❌ hidden; server ignores submitted values |
| Hive: list for sale / mark sold | ✅ | ❌ (status only active ↔ collapsed; a sold hive cannot be changed) |
| Add hive / edit hive info | ✅ | ✅ without purchase price |
| Hive internal notes | ✅ | ✅ (needed for work — free text, may mention who a hive was bought from) |
| Order codes in hive history ("ขายตามออเดอร์ S…") | ✅ | masked (`maskOrderCodes`) |
| Photos, photo queue, incomplete data | ✅ | ✅ |
| Production + weather | ✅ | ✅ (no link to settings) |
| Honey lots: create, bottle, print labels | ✅ | ✅ without bottling cost or bottles sold |
| Sales: orders, customers, products/prices, reports, CSV | ✅ | ❌ 403 |
| Settings, readiness | ✅ | ❌ 403 |
| Users (`/admin/users`) | ✅ | ❌ 403 |
| Own account / password | ✅ | ✅ |

**Enforcement (three layers):**
1. `src/middleware.ts` + `ownerOnlyPath()` — staff get the "no permission" page (403) on owner paths; POSTs and file downloads get a bare 403.
2. Server functions ignore or refuse money/sales input from staff: `updateHive`/`createHive` (purchase price), `updateSale`, `changeStatus`/`fillMissing` (`statusTargets`), `addBottling` (unit cost).
3. Pages hide menus, fields and columns (`isOwner`).

**Users page:** the owner adds staff (name + email); the system generates a temporary password, shown once, with a copy-to-LINE button. Submitting the same form twice issues a fresh password for the same account instead of a duplicate. Disable (ends all sessions at once, reversible) and reset password (new temporary password, ends sessions). Owner accounts are never managed from this page, so the owner cannot lock themselves out. Owners are still created with `scripts/create-owner.ts`.

**Tests:** `check:forms` section 15 — real staff login, forced password change, menus, 403s, tampered POSTs (sale, sold status, purchase price), "recorded by", disable/enable. `check:staff` — logs in as that staff user and scans every staff-reachable page (all hives, edit pages, lots, labels) for real supplier/customer/order/payment data, money amounts and links to owner pages, and checks owner paths return 403.

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

## 5.3 Concurrent edits (as built)

**Overwrite forms (optimistic concurrency).** The hive edit form and product variant rows send the row's `updated_at` (hidden `version`). The server updates `WHERE id = ? AND updated_at = version` (`src/server/versioned.ts`, `src/lib/concurrency.ts`).
- If no row matches, someone saved first. Nothing is written, and the audit row is skipped too: `auditIfChanged` uses `insert … select … where changes() > 0` in the same batch.
- The page keeps what the user typed and shows `ConflictNotice`: who saved first (from `audit_logs`) and when, plus each field where the user's value differs from the latest. A **"ใช้ค่าล่าสุด"** button per field copies the latest value in. The version moves to latest, so saving again is a deliberate overwrite.
- Product rows: stock changes from orders also bump `updated_at`. So a tab left open on the products page can no longer write an old stock number back after a sale. That was a real bug even with one user.
- Forms rendered before the deploy (no `version`) save without the check.

**Order transitions (real bug fixed).** `applyPaid` only guarded the order row (`stock_applied = 0`). The stock statements after it in the same batch still ran, so two concurrent "ชำระแล้ว" requests deducted stock twice. Two concurrent cancels restocked twice.
- Now paid, fulfilled and cancelled each start their batch with `once(db, key)`: an insert into `once_keys` (primary key `order:<id>:<created_at>:<status>`). The second concurrent request hits the PK, its whole batch rolls back, and it returns ok.
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
  - LINE pre-fills the message. Messenger sends `?text=` as well, but because m.me often ignores it, the click copies the message first (`scripts/contact-copy.ts`), shows "วางในแชตได้เลย", then opens the chat.
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
