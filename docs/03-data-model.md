# Data Model (v2)

ปรับจากข้อมูลจริงในชีต "ขนเงิน" และชีต "สินค้า" ของเจ้าของฟาร์ม ทุกตารางมี `id`, `created_at`, `updated_at` วันที่เก็บเป็น ISO (`YYYY-MM-DD`) แต่แสดงบนหน้าจอเป็น พ.ศ. ใช้เขตเวลา Asia/Bangkok

## ความสัมพันธ์

```
species ─< hives ─┬─< hive_events ──(target_hive_id)──▶ hives
                  ├─< hive_media
                  ├── queen_source_hive_id ─▶ hives   (ไข่นางจาก)
                  ├── brood_source_hive_id ─▶ hives   (ไข่อ่อนจาก)
                  └── supplier_id ─▶ suppliers        (หลังบ้านเท่านั้น)

products ─< product_variants            (รังเปล่า, น้ำผึ้ง Size เล็ก/ใหญ่)
customers ─< orders ─< order_items ─▶ product_variant | hive
users ─< sessions · audit_logs
```

## ตาราง

### hives: ทะเบียนรัง

| ฟิลด์ | ชนิด | หมายเหตุ / ที่มาจาก Excel |
|---|---|---|
| `code` | text unique | `A1`…`A147` |
| `species_id` | fk | ค่าเริ่มต้น: ชันโรงขนเงิน |
| `origin` | enum | `purchased` (มีราคาซื้อ) · `queen_bred` ("Metafarm's Stingless Bee") · `split` ("ขยายรัง … ไข่อ่อนจาก") · `natural` ("ขยายรังเองตามธรรมชาติ") |
| `origin_place` | text | จังหวัด/อำเภอที่ซื้อมา เช่น "อ.สายบุรี จ.ปัตตานี" |
| `acquired_on` | date | วันที่ซื้อ / วันขยายรัง |
| `purchase_price` | int (บาท) | 🔒 หลังบ้าน |
| `supplier_id` | fk | 🔒 คอลัมน์ "คู่ค้า" |
| `queen_born_on` | date | "Queen's Birthday" |
| `queen_source_hive_id` | fk hives | "ไข่นางจาก Axx" |
| `brood_source_hive_id` | fk hives | "ไข่อ่อนจาก Axx" |
| `box_type` | enum | `teak_2room` (รังไม้สัก Metafarm) · `log` (ขอนไม้) · `other` |
| `status` | enum | `active` (Exist) · `sold` (Sold) · `collapsed` (ล่ม) · `unknown` |
| `status_changed_on` | date | |
| `collapse_reason` | text | ไม่บังคับ |
| `for_sale` | bool | 🔒 ไม่แสดงในสมุดพก |
| `sale_price` | int | แสดงเฉพาะในสินค้า/รังสมบูรณ์ |
| `sold_price`, `sold_on`, `customer_id` | | 🔒 |
| `public_note` | text | แสดงในสมุดพก |
| `notes` | text | 🔒 |

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
| `hive_id`, `kind` | `passport` (สูงสุด 2 รูป แสดงในสมุดพก + หน้าขาย) · `sale` (สูงสุด 3 รูป เฉพาะหน้าขาย) · `video` (1 คลิป) |
| `r2_key` หรือ `youtube_id` | รูปเก็บใน R2 ส่วนวิดีโอใช้ YouTube unlisted |
| `sort_order`, `alt` | |

### species · suppliers

- **species**: `name_th`, `name_sci` (ตอนนี้มีแถวเดียว: ชันโรงขนเงิน *Tetragonula pagdeni* Schwarz)
- **suppliers** 🔒: `name`, `phone`, `area`, `notes`

### สินค้าและการขาย

- **products**: `slug`, `name`, `category` (`hive_box` | `honey` | `other`), `description`, `published`
- **product_variants**: `product_id`, `label` (เช่น "Size เล็ก"), `size_ml`, `price_thb`, `stock_qty`, `harvest_year` (น้ำผึ้งปี 2569)
- **customers** 🔒: `name`, `phone`, `line_name`, `address`
- **orders**: `customer_id`, `channel`, `status` (`pending` → `paid` → `shipped` → `completed` | `cancelled`), `total_thb`, `shipping_thb`, `tracking_no`
- **order_items**: `order_id`, `product_variant_id` **หรือ** `hive_id` (ขายรังสมบูรณ์), `qty`, `unit_price_thb`
  - เมื่อออเดอร์ที่มีรังเปลี่ยนเป็น `paid` ระบบจะตั้ง `hives.status = sold` และบันทึก `sold_price` / `sold_on` อัตโนมัติ

### ระบบ

- **users**: `email`, `name`, `password_hash`, `role` (`owner` | `staff`), `active`
- **sessions**: `user_id`, `token_hash`, `expires_at`
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
