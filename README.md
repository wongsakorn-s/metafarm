# MetaFarm

เว็บไซต์และระบบหลังบ้านของ **MetaFarm (Palm Oil & Stingless Bee Farm)**: สวนปาล์มน้ำมัน 50 ไร่ที่ ต.หนองไร่ อ.ปลวกแดง จ.ระยอง เลี้ยงชันโรงขนเงินในรังไม้สักที่ออกแบบเอง

1. **เว็บสาธารณะ:** ชันโรงขนเงิน, น้ำผึ้งชันโรง, สินค้า (รังสมบูรณ์ / รังเปล่า / น้ำผึ้ง), อบรม, สมุดพกชันโรง และติดต่อเรา
2. **หลังบ้าน:** ทะเบียนรัง 147 รัง, บันทึกเหตุการณ์ (เก็บน้ำหวาน, ไข่นางพญา, แยกรัง), ตั้งขายรัง และออเดอร์

> สถานะ: **Phase 1 เสร็จ + Phase 2 เริ่มแล้ว (local)**: หลังบ้านครบ (ล็อกอิน, รัง, แก้ไข, รูป/วิดีโอ) และเว็บสาธารณะมี หน้าแรก + สมุดพกชันโรง แล้ว ยังไม่มี สินค้า / อบรม / น้ำผึ้ง / ติดต่อเรา
> Stack: Astro 7 + React + Tailwind 4 · Cloudflare Workers · D1 + Drizzle · R2

## รันบนเครื่อง

ต้องมี Node 24 LTS (ดู `.nvmrc`)

```sh
npm install
npm run db:migrate:local      # สร้างตารางใน D1 บนเครื่อง (.wrangler/state)
npm run import:excel          # อ่าน private/ข้อมูลเบื้องต้น.xlsx → private/import/
npm run db:seed:local         # ⚠️ ล้างข้อมูลรังใน DB บนเครื่อง แล้วนำเข้าใหม่
npm run media:seed:local      # นำรูปจาก Excel เข้า R2 บนเครื่อง
npm run user:create -- --email owner@metafarm.local --generate   # สร้างผู้ใช้ (รหัสผ่านอยู่ใน private/dev-owner.txt)
npm run dev                   # http://localhost:4321  → หลังบ้านที่ /admin
```

ตรวจคุณภาพ: `npm run check` · `npm test` · `npm run build`
ตรวจในเบราว์เซอร์จริง (Edge/Chrome ในเครื่อง, มือถือ + คอม, เก็บภาพไว้ใน `private/screenshots/`): เปิด `npm run dev` ค้างไว้ แล้วรัน `npm run check:browser`
ตรวจข้อมูลลับไม่หลุดในหน้าสาธารณะ (ต้องเปิด `npm run dev` ไว้): `npm run check:leaks`
สร้างโลโก้/ไอคอนขนาดเว็บจาก `design/logo/`: `npm run brand:build`
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

## โครงโฟลเดอร์

```
metafarm/
├─ docs/        เอกสารวางแผน
├─ content/     เนื้อหาเว็บ (learn/, training/, products/, photos/)
├─ design/      โลโก้ wireframe
├─ mock-data/   ข้อมูลตัวอย่างสำหรับ seed
└─ private/     ⚠️ ไม่ขึ้น git: ไฟล์ต้นฉบับจากเจ้าของฟาร์ม (มีข้อมูลคู่ค้า)
```
