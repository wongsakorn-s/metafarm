# Architecture

> Stack: **Astro 7 + React + Tailwind 4 · Cloudflare Workers · D1 + Drizzle · R2** (เหตุผลอยู่ใน [08-stack-comparison.md](08-stack-comparison.md))

## โครงสร้างระบบ

```
 ลูกค้า (มือถือ) ──▶  เว็บสาธารณะ  (HTML เร็ว, SEO)      /, /products, /passport/:code …
                          │ อ่านข้อมูลผ่าน "public queries" (ตัดฟิลด์ 🔒 ออกเสมอ)
                          ▼
                      ฐานข้อมูล + ที่เก็บรูป
                          ▲
 เจ้าของฟาร์ม  ──▶  หลังบ้าน /admin  (ต้องล็อกอิน, ใช้บนมือถือได้)
```

repo เดียว deploy ที่เดียว ใช้โดเมนเดียว

## หลักการออกแบบ

1. **แยกข้อมูลสาธารณะออกจากข้อมูลหลังบ้านตั้งแต่ชั้น query:** หน้าสาธารณะเรียกเฉพาะฟังก์ชัน `public*` ที่เลือกฟิลด์แบบ allowlist และมี test ยืนยันว่า `purchase_price`, `supplier`, `for_sale`, `customer` ไม่หลุดออกไป
2. **Business logic เป็น TypeScript ธรรมดา** ไม่ผูกกับ runtime เพื่อให้ย้ายผู้ให้บริการได้
3. **ห้ามลบประวัติ:** รังที่ล่มหรือขายแล้วเปลี่ยนแค่สถานะ และทุกการแก้ไขบันทึก audit log
4. **API บันทึกซ้ำได้อย่างปลอดภัย (idempotency key)** กันการกดซ้ำตอนเน็ตในสวนไม่ดี
5. **ย่อรูปบนเครื่องผู้ใช้ก่อนอัปโหลด** (ประมาณ 1600px, WebP) ส่วนวิดีโอใช้ YouTube
6. **แยก environment:** local / preview / production ใช้ฐานข้อมูลแยกกัน
7. **ภาษาไทยเป็นหลัก:** แสดงวันที่เป็น พ.ศ. แต่เก็บเป็น ISO, ใช้เขตเวลา Asia/Bangkok

## โครงโฟลเดอร์

```
metafarm/
├─ src/
│  ├─ pages/          หน้าสาธารณะ + /admin
│  ├─ components/     site/ และ admin/
│  ├─ server/         queries (public / admin), services, auth
│  ├─ db/schema.ts    Drizzle schema
│  ├─ lib/            โค้ดกลาง เช่น thai-date.ts
│  └─ config/site.ts  ชื่อฟาร์ม + ช่องทางติดต่อ
├─ drizzle/           ไฟล์ migration (SQL) ที่สร้างจาก schema
├─ content/           Markdown: research, training
├─ scripts/           import-excel/
├─ docs/  design/  private/ (ไม่ขึ้น git)
├─ wrangler.jsonc     binding: DB (D1), MEDIA (R2)
```

## ฐานข้อมูล: แก้ schema อย่างไร

1. แก้ `src/db/schema.ts`
2. `npm run db:generate` สร้างไฟล์ SQL ใหม่ใน `drizzle/` (commit ไฟล์นี้)
3. `npm run db:migrate:local` (Phase 3 ใช้คำสั่งเดียวกันแต่เปลี่ยนเป็น `--remote` ใน CI)

## หมายเหตุสำหรับ Phase 3 (deploy)

- adapter @astrojs/cloudflare v14 เปิด binding SESSION (KV) และ IMAGES ให้เองตอน build production ตอนนี้ยังไม่ได้ใช้ (session เก็บใน D1 เอง) ต้องตัดสินใจก่อน deploy ว่าจะปิดหรือใช้ เพื่อไม่ให้ต้องสร้าง KV ที่ไม่จำเป็น
- wrangler.jsonc ใช้ database_id ปลอมสำหรับ local ต้องเปลี่ยนเป็นค่าจริงตอนสร้าง D1 บน Cloudflare
- รูป /media/* ตอนนี้ต้องล็อกอิน ตอนทำหน้าสมุดพกสาธารณะต้องเพิ่มเส้นทางที่เสิร์ฟเฉพาะรูป passport ของรังที่เปิดสาธารณะ

## รูปและวิดีโอ

- **ชนิด/จำนวนสูงสุดต่อรัง:** รูปสมุดพก 6, รูปขาย 3, วิดีโอ 1 (ตามที่เจ้าของฟาร์มกำหนด) — ค่าอยู่ที่ `LIMITS` ใน `src/lib/media.ts`
- **อัปโหลด:** เบราว์เซอร์ย่อรูปก่อนส่ง (`src/scripts/resize-image.ts`) แล้ว server ตรวจซ้ำ: ชนิดไฟล์จาก**ไบต์จริง** (JPEG/PNG/WebP เท่านั้น ไม่รับ SVG/GIF) ไม่เชื่อชื่อไฟล์หรือ Content-Type, ขนาด ≤ 6 MB, ครั้งละ ≤ 6 ไฟล์
- **ที่เก็บ:** R2 คีย์ `hives/<รหัสรัง>/<ชนิด>-<uuid>.<นามสกุล>` ถ้าบันทึกฐานข้อมูลล้มเหลวจะลบไฟล์ที่เพิ่งเขียนทิ้ง
- **วิดีโอ:** ฝากไว้ที่ YouTube (unlisted) เก็บเฉพาะรหัส 11 ตัวอักษร ไม่เก็บไฟล์วิดีโอเอง
- **รูปสาธารณะ:** `/img/*` เสิร์ฟเฉพาะคีย์ที่อยู่ใน `hive_media` และเข้าเงื่อนไข (รูป `passport` ทุกรัง, รูป `sale` เฉพาะรังที่ตั้งขายและยังไม่ขาย) เดาชื่อไฟล์ไม่ได้ ส่วน `/media/*` ยังเป็นของหลังบ้าน (ต้องล็อกอิน)

## ข้อมูลสาธารณะ (กันข้อมูลลับรั่ว)

- หน้าสาธารณะอ่านข้อมูลผ่าน `src/server/public.ts` เท่านั้น ทุก query **เลือกคอลัมน์แบบ allowlist** (ห้าม `select()` เปล่า) และเหตุการณ์ส่ง `note` ออกไปเฉพาะชนิด `note` ที่เจ้าของฟาร์มติ๊กแสดง
- ที่มาของรังที่ซื้อแสดงแค่ **จังหวัด** (`provinceOf`) ปริมาณน้ำผึ้งไม่แสดง
- **ทุกครั้งที่แก้ `public.ts` หรือหน้าสาธารณะ ให้รัน `npm run check:leaks`** มันดึงข้อมูลลับจริง (ชื่อ/เบอร์คู่ค้า หมายเหตุภายใน ชื่ออำเภอ/ตำบลผู้ขาย) แล้วสแกนทุกหน้าสาธารณะ ตัดวลีทั่วไปออกและแสดงรายการที่ตัดให้ตรวจ