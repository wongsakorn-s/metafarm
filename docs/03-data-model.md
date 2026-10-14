# Data Model (v2)

ปรับจากข้อมูลจริงในชีต "ขนเงิน" และชีต "สินค้า" ของเจ้าของฟาร์ม ทุกตารางมี `id`, `created_at`, `updated_at` วันที่เก็บเป็น ISO (`YYYY-MM-DD`) แต่แสดงบนหน้าจอเป็น พ.ศ. ใช้เขตเวลา Asia/Bangkok

## ความสัมพันธ์

```
species ─< hives ─┬─< hive_events ──(target_hive_id)──▶ hives
                  ├─< hive_media
                  ├── queen_source_hive_id ─▶ hives   (ไข่นางจาก)
                  ├── brood_source_hive_id ─▶ hives   (ไข่อ่อนจาก)
                  └── supplier_id ─▶ suppliers        (หลังบ้านเท่านั้น)

products ─< product_variants            (รังเปล่า, น้ำผึ้งขวด 175 มล. — ขนาดเดิมซ่อนไว้)
customers ─< orders ─< order_items ─▶ product_variant | hive
users ─< sessions · audit_logs
```

## ตาราง

### hives: ทะเบียนรัง

| ฟิลด์ | ชนิด | หมายเหตุ / ที่มาจาก Excel |
|---|---|---|
| `code` | text unique | ตัวอักษร 1–3 ตัว + เลข เช่น `A1`…`A147`, `B12`, `G108` (รูปแบบกำหนดที่ `src/lib/hive-code.ts` เท่านั้น) · `id` ไม่ผูกกับรหัส — เรียงตามรหัสด้วย `byCode()` |
| `species_id` | fk | ค่าเริ่มต้น: ชันโรงขนเงิน |
| `origin` | enum | `purchased` (มีราคาซื้อ) · `queen_bred` ("Metafarm's Stingless Bee") · `split` ("ขยายรัง … ไข่อ่อนจาก") · `natural` ("ขยายรังเองตามธรรมชาติ") |
| `origin_place` | text | จังหวัด/อำเภอที่ซื้อมา เช่น "อ.สายบุรี จ.ปัตตานี" |
| `acquired_on` | date | วันที่ซื้อ / วันขยายรัง · `acquired_on_precision` บอกว่ารู้ถึงวัน/เดือน/ปี |
| `purchase_price` | int (บาท) | 🔒 หลังบ้าน |
| `supplier_id` | fk | 🔒 คอลัมน์ "คู่ค้า" |
| `queen_born_on` | date | "Queen's Birthday" |
| `queen_source_hive_id` | fk hives | "ไข่นางจาก Axx" |
| `brood_source_hive_id` | fk hives | "ไข่อ่อนจาก Axx" |
| `box_type` | enum | ป้ายที่แสดง (เจ้าของขอ 2026-10-13): `metafarm` = รัง MetaFarm (ค่าเริ่มต้นของรังใหม่) · `teak_2room` = รังไม้ 2 ห้อง · `log` = รังไม้ 1 ห้อง · `other` = อื่น ๆ (ค่าภายในเดิมคงไว้ เปลี่ยนเฉพาะป้าย) |
| `status` | enum | `active` (Exist) · `sold` (Sold) · `collapsed` (ล่ม) · `unknown` |
| `status_changed_on` | date | |
| `collapse_reason` | text | ไม่บังคับ |
| `for_sale` | bool | 🔒 ไม่แสดงในสมุดพก |
| `sale_price` | int | แสดงเฉพาะในสินค้า/รังสมบูรณ์ |
| `sold_price`, `sold_on`, `customer_id` | | 🔒 |
| `public_note` | text | แสดงในสมุดพก |
| `notes` | text | 🔒 |
| `create_key` | text | กันสร้างรังซ้ำเมื่อกดส่งฟอร์มซ้ำ |

### hive_events: เหตุการณ์ของรัง (ไม่จำกัดจำนวน)

| `type` | ฟิลด์ที่ใช้ | ใน Excel |
|---|---|---|
| `honey_harvest` | `honey_ml`, `propolis_g`, `pollen_g` | "เก็บน้ำหวานครั้งที่ n" |
| `queen_cell_taken` | `queen_cells` (ใบ), `target_hive_id` (ถ้ารู้ว่านำไปทำรังไหน) | "เก็บไข่นางพญาออกไป" |
| `brood_split` | `target_hive_id` | "แยกไข่อ่อนและตัวงานออกไป" |
| `note` | `note` | |
| `status_change` | `from_status`, `to_status` | บันทึกอัตโนมัติ |

ทุกเหตุการณ์มี `occurred_on`, `note`, `created_by`, `is_public` (ค่าเริ่มต้น true ยกเว้น note)

### hive_media

| ฟิลด์ | หมายเหตุ |
|---|---|
| `hive_id`, `kind` | `passport` (สูงสุด 6 รูป แสดงในสมุดพก + หน้าขาย) · `sale` (สูงสุด 3 รูป เฉพาะหน้าขาย) · `video` (1 คลิป) |
| `r2_key` หรือ `youtube_id` | รูปเก็บใน R2 · วิดีโอ (`kind='video'`) เป็นไฟล์ MP4 ใน R2 (`r2_key` = `videos/hive-<รหัส>/<uuid>.mp4`) หรือลิงก์ YouTube unlisted (`youtube_id`) |
| `sort_order`, `alt` | |

### species · suppliers

- **species**: `name_th`, `name_sci` (ตอนนี้มีแถวเดียว: ชันโรงขนเงิน *Tetragonula pagdeni* Schwarz)
- **suppliers** 🔒: `name`, `phone`, `area`, `notes` — แก้ได้ในหน้า `/admin/hives/:code/edit` (เจ้าของ/แอดมินเท่านั้น): เลือก/เปลี่ยน/เอาออก/เพิ่มรายใหม่ และแก้ชื่อ-เบอร์-พื้นที่-หมายเหตุของรายที่เปิดมากับรังนี้ (เช็กเวอร์ชัน `updated_at` กันชน · แก้แล้วเปลี่ยนทุกรังที่ใช้รายนี้) · ข้อความในชื่อ เช่น "(ขี้โกง)" เป็นข้อมูลภายใน ไม่ขึ้นหน้าสาธารณะ

### สินค้าและการขาย (Phase 4 — รายละเอียดใน [11-phase4-plan.md](11-phase4-plan.md))

- **products**: `slug`, `name`, `category` (`hive_box` | `honey` | `other`), `description`, `published`, `image_key` (รูปปก = รูปแรกของ `product_photos` ซิงก์อัตโนมัติ · ว่าง = รูปชั่วคราว)
- **product_photos**: `product_id`, `r2_key` (unique), `sort_order` (มากก่อน = แสดงก่อน; รูปใหม่ต่อท้าย) — เพดานต่อสินค้า รังเปล่า 6 รูป · น้ำผึ้ง/อื่น ๆ 3 รูป (`src/lib/product-photos.ts`) · migration 0017 ย้ายรูปเดี่ยวเดิมเข้ามา
- **product_variants**: `product_id`, `label` (เช่น "Size เล็ก"), `size_ml`, `price_thb`, `price_confirmed` (ยังไม่ยืนยัน = ป้าย "ราคาตัวอย่าง"), `stock_qty` (เว็บแสดงแค่ มี/ไม่มี), `unit_cost` 🔒, `harvest_year_be`, `hidden` (0015: ขนาดที่เลิกขาย — ไม่ลบ ไม่แสดงบนเว็บ/ฟอร์มออเดอร์ใหม่/การบรรจุ)
- **customers** 🔒: `name`, `phone`, `line_name`, `address`
- **orders** 🔒: `code` (`S<ปี พ.ศ.>-NNN`), `customer_id`, `channel` (`line` | `facebook` | `phone` | `farm` | `other`), `ordered_on`, `status` (`awaiting_payment` → `paid` → `fulfilled` หรือ `cancelled` ก่อนส่ง), `paid_on`, `pay_method`, `ship_method`, `ship_fee`, `tracking_no`, `fulfilled_on`, `note`, `create_key` (กันสร้างซ้ำ)
- **order_items** 🔒: `order_id`, `kind` (`variant` | `hive`), `variant_id` **หรือ** `hive_id`, `label`, `qty`, `unit_price`, `stock_taken` (คืนสต็อกตามนี้เมื่อยกเลิก), `prev_for_sale`, `lot_id` (เลิกใช้ตั้งแต่ 0014 — ดู order_item_lots)
- **order_item_lots** 🔒: `order_item_id`, `lot_id`, `qty` — ขวดของบรรทัดนั้นมาจากล็อตไหนกี่ขวด (แบ่งตอนชำระ ล็อตเก่าก่อน · ลบเมื่อยกเลิก · ขวดที่ไม่มีแถว = สต็อกใส่มือ)
  - ตัดสต็อกและตั้งรังเป็น `sold` เมื่อออเดอร์เป็น **paid** เท่านั้น · รังที่อยู่ในออเดอร์ที่ยังเปิดถูกถอดจากการขาย
- **hive_holds**: รังหนึ่งอยู่ได้ในออเดอร์ที่ยังไม่ยกเลิกได้ออเดอร์เดียว (`hive_id` เป็น PK)
- **honey_lots**: `code`, `harvested_from`, `harvested_to`, `total_ml` 🔒 — หน้า `/lot/[code]` (จาก QR บนขวด) แสดงแค่รหัส ช่วงวันที่เก็บ และรหัสรัง
- **lot_sources**: `lot_id`, `event_id` (การเก็บน้ำหวานหนึ่งครั้งอยู่ในล็อตเดียว)
- **bottlings**: `lot_id`, `variant_id`, `qty`, `bottled_on`, `unit_cost` 🔒 (เพิ่มสต็อกขวด ไม่เกินปริมาณในล็อต)
- **แก้ข้อมูลที่บันทึกผิด**: ลบแล้วบันทึกใหม่ (ค่าเดิมเก็บใน audit_logs) — การเก็บน้ำหวานลบได้เมื่อยังไม่อยู่ในล็อต · ล็อตลบได้เมื่อยังไม่บรรจุ · การบรรจุลบได้เมื่อขวดชุดนั้นยังไม่ถูกขาย · เจ้าของ/แอดมินลบได้ทุกรายการ พนักงานเฉพาะของตัวเองภายใน 24 ชม.

### ระบบ

- **users**: `email`, `name`, `password_hash`, `role` (`owner` | `admin` | `staff` — ดู [12-phase5-plan.md](12-phase5-plan.md) ข้อ 5.1), `active`, `must_change_password`
- **sessions**: `user_id`, `token_hash`, `expires_at`
- **login_attempts**: `key_hash`, `at` (จำกัดการเดารหัส 3 กุญแจ: อีเมล+IP, อีเมล, IP)
- **once_keys**: `key` (การเปลี่ยนสถานะออเดอร์ที่ต้องเกิดครั้งเดียว)
- **settings**: `key`, `value` (ช่องทางติดต่อ ราคาอบรม รังรูปหน้าแรก พิกัดฟาร์ม วิดีโอแนะนำฟาร์ม `home.videoKey` (ไฟล์ใน R2) / `home.videoYoutube` — แก้ที่ `/admin/settings`)
- **weather_daily**: `date`, `t_max`, `t_min`, `rain_mm`, `humidity`, `source` (NASA POWER — หน้าผลผลิต)
- **audit_logs**: `user_id`, `action`, `entity`, `entity_id`, `diff`, `at`

### หลักสูตรอบรม

ไม่เก็บในฐานข้อมูล ใช้ไฟล์ Markdown ใน `content/training/` เพราะเป็นหน้ารายละเอียดอย่างเดียวและแก้ไม่บ่อย

## การแสดงผลตามหน้า

| ข้อมูล | สมุดพก (สาธารณะ) | สินค้า/รังสมบูรณ์ | หลังบ้าน |
|---|:-:|:-:|:-:|
| รหัสรัง, รูป passport 2 รูป | ✅ | ✅ | ✅ |
| ที่มา (ประเภท + จังหวัด) | ✅ | ✅ | ✅ |
| วันเกิดนางพญา, รังแม่ (ไข่นาง/ไข่อ่อน), รังลูก | ✅ | ✅ | ✅ |
| ประวัติเก็บน้ำหวาน / ไข่นางพญา / แยกรัง | ✅ | ✅ | ✅ |
| ราคาขาย, รูปเพิ่ม 3 รูป, วิดีโอ | ❌ | ✅ | ✅ |
| สถานะขาย/ไม่ขาย | ❌ | (แสดงเฉพาะรังที่ขาย) | ✅ |
| ราคาซื้อ, คู่ค้า, ลูกค้า, notes | ❌ | ❌ | ✅ |
| รังที่ล่มหรือขายแล้ว | แสดงเป็นประวัติ (ป้าย "ขายแล้ว"/"ปิดรัง") | ❌ | ✅ |

## การนำเข้าจาก Excel (Phase 1)

| ปัญหาในไฟล์ | วิธีจัดการ |
|---|---|
| วันที่ปนหลายรูปแบบ: `25 มีค. 2565`, `14 มิย. 65`, `8 Aug. 2023`, `มีค. 2566` | parser รองรับเดือนไทยแบบย่อ, ปี พ.ศ. 2 หรือ 4 หลัก, เดือนภาษาอังกฤษ และวันที่ที่มีแค่เดือน (เก็บเป็นวันที่ 1 และติดธง `date_precision = month`) |
| อ้างรังแม่ที่ไม่รู้ (`AXX`, `XX`) | ปล่อยว่าง และใส่ในรายงานให้ตรวจด้วยมือ |
| ราคาซื้อเป็นทศนิยม (1266.67 = ซื้อหลายรังแบ่งเฉลี่ย) | ปัดเป็นจำนวนเต็ม |
| สถานะว่าง (A37, A97) | `unknown` |
| ช่องที่จำกัดจำนวนครั้ง (6/10 ครั้ง) | แปลงทุกครั้งเป็น `hive_events` |
| รูปฝังในชีต | ดึงจาก `xl/media` โดยใช้ตำแหน่ง anchor ใน `drawing7.xml` เพื่อจับคู่กับแถวของรัง |

สคริปต์จะรันซ้ำได้ (idempotent) และสร้างรายงาน `private/import-report.md` ให้ตรวจก่อนใช้งาน

## แกลเลอรี (0016)

- **gallery_photos**: `category` (`farm` ชันโรงของ MetaFarm | `hive_delivery` ส่งมอบรังชันโรง | `honey_delivery` ส่งมอบน้ำผึ้ง | `woodshop` ห้องงานไม้), `r2_key` (unique, `gallery/<หมวด>/…`), `caption`, `sort_order` (มากก่อน = แสดงก่อน · หลังบ้านเลื่อนรูปด้วยปุ่ม ระบบเรียงเลขใหม่ทั้งหมวด), `created_by` — หน้าสาธารณะอ่านแค่หมวด คีย์ และคำบรรยาย (`getGallery`) · หมวดละไม่เกิน 60 รูป
