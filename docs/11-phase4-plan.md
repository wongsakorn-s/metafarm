# Phase 4 plan: sales, honey lots, and the production + weather dashboard

> **Status:** approved "as recommended" (2026-10-07). **4.1 done** (`/admin/production`, migration 0007, approximate coordinates, historical weather only, no forecast yet). **4.2 done** (`/admin/orders`, `/admin/customers`, migration 0008). Next: 4.3.
> Earlier status line: plan awaiting approval (2026-10-07). It is based on the answers the farm side gave in the questionnaire (Section 1).
> UI must follow `design-system/metafarm/MASTER.md`. Database migrations are add-only (see `10-deploy-runbook.md`).

## 1. What the questionnaire told us (and what it means for the design)

The answers came from a family member who helps with sales.

| Answer | Design implication |
|---|---|
| Sells on LINE, Facebook and at the farm. **Fewer than 5 orders a month.** | Keep it **light**: one-page order entry, no cart, no online payment, no complex stock system. |
| Orders are currently kept in **Excel / Google Sheets** | The system must replace the sheet. Exporting to CSV/Excel is required. Importing the old sheet is optional (if the file is sent). |
| **The owner** handles chat and orders alone, and **records after finishing the chat** | Entry must be quick on a phone: pick a customer (or create one inline) → pick items → enter amount/shipping → save, in under 1 minute. |
| Paid by **bank transfer / PromptPay**. Hives are **paid in full before shipping** | Two payment states: "รอชำระ" (awaiting payment) and "ชำระแล้ว" (paid, with date and method). Ship only after payment. No deposits. |
| "Who hasn't paid" view: **nice to have** | Show a list of awaiting-payment orders on the dashboard. No notifications. |
| Hives: **picked up at the farm / delivered by the farm / courier**. Honey: picked up / Thailand Post / Kerry, Flash, J&T | One shipping-method field per order + a tracking number for courier shipments. |
| Shipping fee **agreed per order** | A free-entry "ค่าส่ง" (shipping fee) field, default 0. No fee calculation. |
| Honey sold in **50 ml, 120 ml and other sizes** | Product sizes are added in admin (the variant table already supports this). |
| **Wants to know which harvest each bottle came from, with a lot number on the bottle** | **Honey lots**: harvest → lot code → bottling → sale. Print lot labels/QR codes. |
| Empty hive boxes: **both stocked and made to order** | Stock count per item + an order can be "ทำตามสั่ง" (made to order) even when stock is 0. |
| Regular customers exist, **same price as everyone** | No price tiers. A purchase history per customer is enough. |
| Customer data: **name, phone, shipping address, purchase history** | Customer table with these fields. No LINE ID required (optional field). |
| Reports wanted: **all 6** (monthly sales, best sellers, unpaid, regulars, honey per hive, **profit**) | Profit needs **unit costs** → a cost field per item. Hive sales use the existing purchase price. |
| The one thing they want the system to help with: **"Production dashboard + weather"** | **Do this first** (section 3.1). It already uses existing data and is the owner's top wish. |

## 2. Work order (4 sub-phases)

| # | Work | Why this order | Size |
|---|---|---|---|
| **4.1** | **Production + weather dashboard** | The owner's top wish. Uses the existing harvest data. Quick to deliver. | S–M |
| **4.2** | **Orders + customers** (replaces Excel) | Core of the sales system. Selling a hive marks it as sold automatically. | M–L |
| **4.3** | **Honey lots + stock + lot labels** | Needed to trace each bottle back to its source. Depends on 4.2 (a sale draws down a lot). | M |
| **4.4** | **Sales reports + profit + CSV export** | Needs order data from 4.2 and costs from 4.3. | M |

Each sub-phase is deployed and used for real before the next one starts.

## 3. Details for each sub-phase

### 3.1 Production + weather dashboard

- **Production:**
  - Monthly honey collected (ml), as a bar chart over 12–24 months.
  - Number of harvests.
  - Top-producing hives (ml per hive).
  - Living vs. collapsed hives by month.
- **Weather at the farm:**
  - Daily rainfall (mm), max/min temperature and humidity, aggregated monthly and plotted **over the same timeline as production**.
  - This shows whether hot or dry periods affect honey yield and hive collapses, which matches what the farm has already observed: "ระยองร้อน ฝนไม่ตกต่อเนื่องหลายเดือน" (Rayong is hot and rain can stop for months).
  - Show the coming 7-day forecast as a separate panel (to help plan harvesting).
- **Data sources** (checked 2026-10-07):
  - ❌ **Open-Meteo:** the free tier is non-commercial only, and this is a business system.
  - ✅ **NASA POWER** (power.larc.nasa.gov): daily historical weather by coordinates, built for agriculture. US-government data, free for any use, no API key needed. Delayed a few days, which is fine for comparing against harvests.
  - ✅ **Thai Meteorological Department (TMD) open-data API** for the 7-day forecast. Free, but the owner must register for a token. It is stored as a Cloudflare secret.
  - Both must be re-checked against current terms before implementation.
- **Storage:** a new `weather_daily` table (date, max/min temp, rainfall, humidity, source). Fetch only missing days, at most once a day when the dashboard is opened. No cron needed. 25 years of daily rows is still small for D1.
- **Coordinates:** the farm's exact pin. The default is approximate Pluak Daeng (12.98, 101.22); a field in ⚙️ settings lets the owner set the real one.
- **Charts:** SVG generated server-side. No chart library, so the page stays fast on a phone in the field.

### 3.2 Orders + customers

**Data (new tables):**
- `customers` — `name`, `phone`, `address`, `line_id?`, `note`, `created_at`.
- `orders`:
  - `code` (e.g. `S2569-001`), `customer_id`, `channel` (line / facebook / farm / other), `ordered_on`.
  - `status`: `awaiting_payment` → `paid` → `fulfilled`, or `cancelled`.
  - Payment: `paid_on`, `pay_method` (transfer / promptpay / cash).
  - Shipping: `ship_method` (pickup / farm_delivery / thaipost / courier), `ship_fee`, `tracking_no`.
  - `note` and an idempotency key (`create_key`).
- `order_items`:
  - `order_id`, `kind` (variant / hive).
  - `variant_id?`, `hive_id?`, `lot_id?` (filled in 4.3).
  - `qty`, `unit_price`, `unit_cost?`, `made_to_order` (made to order).

**Behavior:**
- **Selling a hive** (`kind = hive`):
  - Paid → the hive becomes "ขายแล้ว" (sold) automatically, with sale date and price, a `status_change` event, and it disappears from the for-sale page.
  - Cancelled → the hive goes back to its previous status.
  - A hive can be in only one active order.
- **Stock:** counted on "ชำระแล้ว" (paid), not when the order is created. The quantity returns if the order is cancelled.
- **Order screen (phone):** one page with:
  - Customer picker (search by name/phone, or create one inline).
  - Items: the products list, plus hives currently for sale.
  - Shipping and payment.
  - A "บันทึก" (save) button.

  Reuse the existing patterns: `admin-forms`, idempotency keys, and the save bar fixed to the bottom.
- **Menu:** the bottom bar changes from "สินค้า" (products) to **"ขาย"** (sales: order list + products). It keeps 5 buttons, as `MASTER.md` requires.
- **Dashboard:** the "รอชำระ" (awaiting payment) count, plus open orders not yet delivered.
- **"ส่งข้อความหาลูกค้า" button** (message the customer): copies an order summary (items, total, bank account) to paste into LINE. **No LINE API in this phase.**

### 3.3 Honey lots + stock + lot labels

**Data:**
- `honey_lots`:
  - `code`: format `H` + Buddhist-era year + month + sequence, e.g. `H2569-10-1` (short enough to fit on a label).
  - `harvested_from`, `harvested_to`, `total_ml`, `note`.
- `lot_sources` — links a lot to the `honey_harvest` events it came from (which hives, how many ml).
- `bottlings` — `lot_id`, `variant_id`, `qty`, `bottled_on`, `unit_cost`. Each bottling adds to the stock of that size.

**Behavior:**
- **Stock:** for each size, stock = bottled − sold (computed). The existing `stock_qty` field is kept and synced to the computed value, so the public pages keep working.
  - Empty hive boxes keep a directly entered stock count (made-to-order is allowed).
- **Lot labels:**
  - Printed from the browser on an A4 label sheet: product name, size, lot code, harvest date, and a QR code.
  - **The QR code opens a public lot page** (`/lot/H2569-10-1`): harvest date, harvest location (the farm), and hives that contributed. It **must not** show costs, customers or sale quantities, which is checked by `check:leaks`.
- **Selling honey:** pick a lot (default: the oldest lot that still has stock, first-in-first-out).

### 3.4 Reports + profit + CSV export

**Sales report page** (filter by month/year):
- Monthly sales (chart + table).
- Best-selling items.
- Awaiting-payment list.
- Regular customers (purchase count / total amount).

**Profit:**
- Revenue − item cost − shipping cost paid by the farm.
- Costs come from:
  - honey: the bottling cost
  - empty hive boxes: a cost field per item
  - hives: the purchase price; bred hives have a cost of 0, or one the owner enters
- Items without a cost show as "ยังไม่มีต้นทุน" (no cost yet) and are **not counted as profit**, so the figure isn't overstated.

**Other reports:**
- **Honey yield per hive:** from existing harvest data, by year.
- **CSV export:** orders, customers, and the hive register (opens in Excel/Sheets, Thai-safe UTF-8 BOM).
- **Optional import:** the old Excel/Sheets orders, if the file is sent.

## 4. Decisions needed before starting (owner / user)

1. **Order of work:** start with 4.1 (dashboard + weather)? Recommended, because it's the top wish and uses existing data.
2. **Farm coordinates:** send the farm's Google Maps pin, or use approximate Pluak Daeng for now and change it later in settings.
3. **7-day forecast:** is it wanted? If yes, the owner registers a free TMD API token. If not, use historical weather only, which needs no registration.
4. **Item costs:** for the profit report, someone needs to know the cost of the bottle + label, and of an empty hive box. They can be filled in later.
5. **Old Excel/Sheets orders:** import them? If yes, send the file (it goes in `private/`, not on git).
6. **Lot code format:** `H2569-10-1` OK? And label/sticker size: either a common A4 sticker sheet (e.g. 4×10 labels) or a label printer.

## 5. Out of scope for Phase 4 (deferred to Phase 5)

- LINE notifications / LINE Messaging API (with < 5 orders a month, copying text by hand is enough).
- Customers ordering and paying directly on the website.
- Staff user accounts (the owner records everything alone). **Owner/staff permissions must still be done before adding a second user.**
- Offline mode.
