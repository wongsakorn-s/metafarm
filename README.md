# MetaFarm

เว็บไซต์และระบบหลังบ้านของ **MetaFarm (Palm Oil & Stingless Bee Farm)**: สวนปาล์มน้ำมัน 50 ไร่ที่ ต.หนองไร่ อ.ปลวกแดง จ.ระยอง เลี้ยงชันโรงขนเงินในรังไม้สักที่ออกแบบเอง

1. **เว็บสาธารณะ:** ชันโรงขนเงิน, น้ำผึ้งชันโรง, สินค้า (รังสมบูรณ์ / รังเปล่า / น้ำผึ้ง), อบรม, สมุดพกชันโรง และติดต่อเรา
2. **หลังบ้าน:** ทะเบียนรัง, บันทึกเหตุการณ์ (เก็บน้ำหวาน, ไข่นางพญา, แยกรัง), ตั้งขายรัง, ออเดอร์/ลูกค้า, ล็อตน้ำผึ้ง + ฉลาก QR, รายงาน, ผลผลิต + สภาพอากาศ · ผู้ใช้ 3 บทบาท (เจ้าของ / แอดมิน / พนักงาน)

> สถานะ: **ขึ้นระบบจริงแล้ว (2026-10-05)** · Phase 1–5 เสร็จ (ทะเบียนรัง สมุดพก ขาย ออเดอร์ ล็อตน้ำผึ้ง รายงาน สิทธิ์ผู้ใช้ คิวรอส่งเมื่อสัญญาณไม่ดี) · งานค้างดูท้าย [docs/00-roadmap.md](docs/00-roadmap.md) · ระบบจริงคือที่เก็บข้อมูลหลัก — ข้อมูลในเครื่องเป็นข้อมูลทดสอบ ห้ามส่งขึ้นระบบจริง
> Stack: Astro 7 + React + Tailwind 4 · Cloudflare Workers · D1 + Drizzle · R2

## รันบนเครื่อง

ต้องมี Node 24 LTS (ดู `.nvmrc`)

```sh
npm install
npm run db:migrate:local      # สร้างตารางใน D1 บนเครื่อง (.wrangler/state)
npm run import:excel          # อ่าน private/ข้อมูลเบื้องต้น.xlsx → private/import/
npm run db:seed:local         # ⚠️ ล้างข้อมูลรังใน DB บนเครื่อง แล้วนำเข้าใหม่
npm run media:seed:local      # นำรูปจาก Excel เข้า R2 บนเครื่อง
npm run products:seed:local   # สินค้าตั้งต้น (รังเปล่า, น้ำผึ้ง) ราคาตัวอย่าง
npm run user:create -- --email owner@metafarm.local --generate   # สร้างผู้ใช้ (รหัสผ่านอยู่ใน private/dev-owner.txt)
npm run dev                   # http://localhost:4321  → หลังบ้านที่ /admin
```

ตรวจคุณภาพ: `npm run check` · `npm test` · `npm run build`
ตรวจในเบราว์เซอร์จริง (Edge/Chrome ในเครื่อง, มือถือ + คอม, เก็บภาพไว้ใน `private/screenshots/`): เปิด `npm run dev` ค้างไว้ แล้วรัน `npm run check:browser`
ทดสอบแบบ **จำลองมือถือ** (โปรไฟล์ Pixel 7 / iPhone 13 / iPhone SE, สัมผัส, จุดแตะ ≥ 44px, ช่องกรอก ≥ 16px, หมุนจอ, เน็ตช้า + CPU ช้า + สัญญาณหลุด + ล็อกอินหมดอายุระหว่างอัปโหลดรูป): `npm run check:mobile` (`MOBILE_FLOWS=0` ข้ามขั้นตอนที่เขียนข้อมูล — ขั้นตอนอัปโหลดเพิ่มรูปทดสอบ 1 รูป ให้ล้างด้วย `npm run db:seed:local && npm run media:seed:local -- --prune`)
ตรวจข้อมูลลับไม่หลุดในหน้าสาธารณะ (ต้องเปิด `npm run dev` ไว้): `npm run check:leaks`
ตรวจฟอร์มหลังบ้านทั้งหมด (เขียนข้อมูลทดสอบ — ใช้กับเครื่องตัวเองเท่านั้น): `npm run check:forms` · แล้วตามด้วย `npm run check:staff` (พนักงานไม่เห็นเงิน/ลูกค้า) · คิวรอส่งเมื่อสัญญาณหลุด: `npm run check:offline`
สร้างโลโก้/ไอคอนขนาดเว็บจาก `design/logo/`: `npm run brand:build`
ส่งออกข้อมูลในเครื่อง (ฐานข้อมูล + รูป): `npm run snapshot:export` — ⛔ ห้ามนำ `snapshot.sql`/`seed.sql` ไปรันกับระบบจริง (ล้างข้อมูลทั้งหมด มีตัวกันในไฟล์ ดู docs/10-deploy-runbook.md ข้อ 2.6)
เจ้าของฟาร์มดูความพร้อมของข้อมูลที่หลังบ้าน เมนู ✅ เตรียมเปิด
ตรวจความพร้อมขึ้นออนไลน์ (ผู้ดูแลระบบ): `npm run predeploy` · คะแนน Lighthouse (ต้อง build + `npx astro preview --port 4500` ก่อน): `npm run check:lighthouse`
ล้างรูปทดสอบใน R2 บนเครื่อง: `npm run media:seed:local -- --prune`
หลังแก้ `wrangler.jsonc` ให้รัน `npm run generate-types`

## เอกสาร

| ไฟล์ | เนื้อหา |
|---|---|
| [docs/00-roadmap.md](docs/00-roadmap.md) | แผนงานทีละเฟส |
| [docs/01-requirements.md](docs/01-requirements.md) | ผู้ใช้ ฟีเจอร์ และ user stories |
| [docs/02-architecture.md](docs/02-architecture.md) | หลักการออกแบบ (ใช้ได้กับทุก stack) |
| [docs/03-data-model.md](docs/03-data-model.md) | โครงสร้างข้อมูล + วิธี import Excel |
| [docs/04-sitemap.md](docs/04-sitemap.md) | หน้าเว็บและหน้าจอหลังบ้าน |
| [docs/05-sales-channels.md](docs/05-sales-channels.md) | ช่องทางขาย และเรื่องที่ต้องเตรียม |
| [docs/06-mock-data.md](docs/06-mock-data.md) | สรุปข้อมูลฟาร์มจริง + ราคาตัวอย่าง |
| [docs/07-decisions.md](docs/07-decisions.md) | บันทึกการตัดสินใจ + วิเคราะห์ข้อมูล |
| [docs/08-stack-comparison.md](docs/08-stack-comparison.md) | เปรียบเทียบ stack และวิธี deploy |
| [docs/09-research-notes.md](docs/09-research-notes.md) | ผลตรวจเนื้อหางานวิจัย (ภายใน) |
| [docs/10-deploy-runbook.md](docs/10-deploy-runbook.md) | คู่มือขึ้นระบบจริง (Cloudflare) + สำรอง/กู้ข้อมูล + ข้อควรระวัง |
| [docs/11-phase4-plan.md](docs/11-phase4-plan.md) | Phase 4: ผลผลิต ออเดอร์ ล็อตน้ำผึ้ง รายงาน |
| [docs/12-phase5-plan.md](docs/12-phase5-plan.md) | Phase 5: สิทธิ์ผู้ใช้ (เจ้าของ/แอดมิน/พนักงาน) กันเดารหัส ข้อมูลทับกัน ปุ่มติดต่อ คิวรอส่ง |

## โครงโฟลเดอร์

```
metafarm/
├─ docs/        เอกสารวางแผน
├─ content/     เนื้อหาเว็บที่แก้ได้ (pages/, learn/, training/) — ดู content/README.md
├─ design/      โลโก้ wireframe
├─ design-system/metafarm/MASTER.md   สี ฟอนต์ ส่วนประกอบ และกติกา UX
├─ mock-data/   ข้อมูลตัวอย่างสำหรับ seed
└─ private/     ⚠️ ไม่ขึ้น git: ไฟล์ต้นฉบับจากเจ้าของฟาร์ม (มีข้อมูลคู่ค้า)
```
