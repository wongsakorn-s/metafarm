# 🐝 MetaFarm (Palm Oil & Stingless Bee Farm)

> เว็บไซต์และระบบบริหารจัดการฟาร์มชันโรงขนเงินในสวนปาล์มน้ำมัน 50 ไร่ ต.หนองไร่ อ.ปลวกแดง จ.ระยอง  
> พัฒนาด้วย **Astro 7 + Tailwind 4 + Cloudflare Workers (D1, R2)**

[![Production Status](https://img.shields.io/badge/Production-Live-success)](https://metafarm.wong-saengsurasak.workers.dev)
[![Node](https://img.shields.io/badge/Node-24%20LTS-brightgreen)](https://nodejs.org)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%7C%20D1%20%7C%20R2-orange)](https://cloudflare.com)
[![Test Suite](https://img.shields.io/badge/Tests-406%20passed-brightgreen)](https://vitest.dev)
[![Mobile Lighthouse](https://img.shields.io/badge/Lighthouse-99--100-brightgreen)](https://pagespeed.web.dev)

---

## 📌 สารบัญ (Table of Contents)
1. [ภาพรวมของระบบ (Overview)](#-ภาพรวมของระบบ-overview)
2. [เทคโนโลยีหลัก (Tech Stack)](#-เทคโนโลยีหลัก-tech-stack)
3. [การติดตั้งและรันบนเครื่อง (Quick Start)](#-การติดตั้งและรันบนเครื่อง-quick-start)
4. [ชุดคำสั่งและการตรวจสอบคุณภาพ (Scripts & QA)](#-ชุดคำสั่งและการตรวจสอบคุณภาพ-scripts--qa)
5. [โครงสร้างโปรเจกต์ (Project Structure)](#-โครงสร้างโปรเจกต์-project-structure)
6. [สารบัญเอกสารโครงการ (Documentation Index)](#-สารบัญเอกสารโครงการ-documentation-index)
7. [ข้อควรระวังและความปลอดภัย (Safety Rules)](#-ข้อควรระวังและความปลอดภัย-safety-rules)

---

## 🌟 ภาพรวมของระบบ (Overview)

ระบบถูกออกแบบตามหลัก **Mobile-first** เพื่อให้เจ้าของฟาร์มวัย 55 ปีและพนักงานใช้งานได้สะดวกทั้งขณะเดินตรวจรังในสวนและบนคอมพิวเตอร์

### 1. เว็บไซต์สาธารณะ (Public Web)
* **หน้าแรก (`/`):** เรื่องราวฟาร์ม, จุดเด่นรังไม้สัก 2 ห้อง, ตัวเลขจริงจากฐานข้อมูล, วิดีโอแนะนำสวน, และสินค้าเด่น
* **ความรู้และงานวิจัย:**
  * ชันโรงขนเงิน (`/stingless-bee`): ลักษณะทางกายภาพ และโครงสร้างภายในรัง
  * น้ำผึ้งชันโรง (`/honey`): สรรพคุณทางโภชนาการ (ไม่โอ้อวดเกินจริงตามกฎหมายอาหาร)
  * งานวิจัย (`/learn/research`): สรุปงานวิจัยทางวิทยาศาสตร์พร้อมแหล่งอ้างอิง
* **สินค้าและบริการ (`/products`):**
  * รังพันธุ์ชันโรงสมบูรณ์ (`/products/hives/[code]`): รูปส่องทะลุพลาสติกใสโชว์ความสมบูรณ์ + วิดีโอ + ทักสั่งซื้อ
  * รังเปล่าไม้สัก (`/products/hive-box`) และน้ำผึ้งขวด 175 มล. (`/products/stingless-honey`)
* **สมุดพกชันโรง (`/passport` & `/passport/[code]`):** ค้นหาและดูประวัติย้อนหลังของรังครบ 147 รัง ตรวจสอบสายพันธุ์แม่-ลูก และดูภาพรังในสวน
* **ตรวจสอบที่มาของน้ำผึ้ง (`/lot/[code]`):** สแกน QR Code บนขวดน้ำผึ้ง เพื่อดูวันที่เก็บและรังต้นกำเนิด
* **แกลเลอรีภาพถ่าย (`/gallery`):** 4 หมวดหมู่ (ชันโรง, ส่งมอบรัง, ส่งมอบน้ำผึ้ง, ห้องงานไม้)
* **คอร์สอบรม (`/training`):** การแยกขยายรัง และการเก็บกรองน้ำผึ้ง
* **ระบบแสดงภาพพรีเมียม:** สลับดูรูปย่อได้ทันทีบนหน้าเว็บ พร้อม Lightbox ที่ซูมได้เต็มรูปแบบ (Pinch, Double-tap, Wheel, Pan)

### 2. ระบบหลังบ้าน (Admin Backoffice - `/admin`)
* **ทะเบียนรัง & เหตุการณ์:** บันทึกการเก็บน้ำหวาน (มล./กรัม), เก็บไข่นางพญา, แยกรัง, เปลี่ยนสถานะ
* **ระบบรูปถ่าย 2 ชุดแยกชัดเจน:**
  * **รูปสมุดพก (สูงสุด 6 รูป):** รูปที่ 1 เป็นมุมกว้าง 4:3 เห็นที่ตั้งในสวน เพื่อให้เดินหารังได้ง่าย
  * **รูปสำหรับขาย (สูงสุด 6 รูป):** รูปที่ 1 เป็นมุมบนส่องทะลุแผ่นพลาสติกใส เพื่อโชว์ความพร้อมในการขาย
* **การขาย & สต็อก:** บันทึกออเดอร์, จัดการลูกค้า, แบ่งขวดน้ำผึ้งตามล็อตเก่า-ใหม่, พิมพ์ฉลากพร้อม QR ติดขวด
* **เตรียมความพร้อมก่อนเปิดร้าน:**
  * `/admin/readiness`: ตรวจสอบเช็คลิสต์ 7 ข้อก่อนเปิดร้าน
  * `/admin/photos`: คิวถ่ายรูปรังที่ยังไม่มีรูปสมุดพก (เปิดถ่ายบนมือถือขณะเดินในสวนได้ทันที)
  * `/admin/todo`: เติมข้อมูลรังที่ยังไม่ครบ หรือกด "ไม่ทราบจริง ๆ" เพื่อเคลียร์รายการเตือน
* **สิทธิ์ผู้ใช้ 3 ระดับ:** เจ้าของ (Owner), แอดมิน (Admin), พนักงาน (Staff - ซ่อนข้อมูลเงินและลูกค้า)
* **รองรับการทำงานในสวน:** ติดตั้งเป็น PWA บนมือถือได้ พร้อมระบบบันทึกคิวออฟไลน์เมื่อสัญญาณเน็ตหลุด

---

## 🛠 เทคโนโลยีหลัก (Tech Stack)

| ส่วนของระบบ | เทคโนโลยีที่เลือกใช้ | เหตุผลและจุดเด่น |
|---|---|---|
| **Frontend & SSR** | **Astro 7 + Tailwind CSS 4** | ไม่มี overhead จาก React โค้ดฝั่ง Client เป็น Pure TS น้ำหนักเบา โหลดเร็วระดับ 99-100 คะแนน |
| **Edge Compute** | **Cloudflare Workers** | ทำงานบน Edge ใกล้ผู้ใช้ ตอบสนองรวดเร็ว ไร้ค่าใช้จ่ายเซิร์ฟเวอร์ |
| **Database** | **Cloudflare D1 + Drizzle ORM** | SQLite at Edge มีระบบ Migration ปลอดภัย สำรองข้อมูลอัตโนมัติทุกคืน |
| **Media Storage** | **Cloudflare R2** | เก็บรูปถ่ายและวิดีโอ ย่อรูปขนาด WebP และลบข้อมูลพิกัด GPS/EXIF ก่อนบันทึกเสมอ |
| **Testing** | **Vitest + Playwright Core** | รัน Miniflare D1 จำลองแบบสมบูรณ์ ตรวจทั้ง Unit, Browser, Mobile Touch และ Data Leaks |

---

## 🚀 การติดตั้งและรันบนเครื่อง (Quick Start)

> [!NOTE]
> ระบบต้องการ **Node.js 24 LTS** ขึ้นไป (ตรวจสอบด้วย `node -v` หรือดูที่ไฟล์ `.nvmrc`)

### 1. ติดตั้ง Dependencies และสร้างฐานข้อมูลในเครื่อง
```sh
# ติดตั้งแพ็กเกจ
npm install

# รัน Migration สร้างตารางใน D1 ในเครื่อง (.wrangler/state)
npm run db:migrate:local
```

### 2. นำเข้าข้อมูลและสร้างบัญชีผู้ใช้
```sh
# แปลงไฟล์ Excel ข้อมูลรังต้นฉบับ
npm run import:excel

# นำเข้าข้อมูลรังและรูปภาพเข้าสู่ DB/R2 บนเครื่อง
npm run db:seed:local
npm run media:seed:local
npm run products:seed:local

# สร้างผู้ใช้สำหรับล็อกอิน (รหัสผ่านจะถูกบันทึกไว้ใน private/dev-owner.txt)
npm run user:create -- --email owner@metafarm.local --generate
```

### 3. รันเซิร์ฟเวอร์สำหรับพัฒนา
```sh
npm run dev
```
* เข้าชมเว็บไซต์สาธารณะ: `http://localhost:4321`
* เข้าสู่ระบบหลังบ้าน: `http://localhost:4321/admin`

---

## 🧪 ชุดคำสั่งและการตรวจสอบคุณภาพ (Scripts & QA)

### 1. การตรวจสอบโค้ดและการทดสอบพื้นฐาน
```sh
npm run check              # ตรวจสอบ TypeScript & Astro Types (0 errors/warnings)
npm test                   # รัน Vitest ครบ 406 การทดสอบ (Unit + Integration D1)
npm run build              # จำลองการคอมไพล์โปรเจกต์สำหรับ Production
npm run preview            # พรีวิวผลลัพธ์หลัง Build
```

### 2. การตรวจสอบการแสดงผลและความปลอดภัย (Quality Assurance)
```sh
# ตรวจสอบการแสดงผลบนเบราว์เซอร์จริง (Edge/Chrome ทั้งจอมือถือและคอมพิวเตอร์)
# *ต้องเปิด `npm run dev` ทิ้งไว้ก่อนรันคำสั่งนี้*
npm run check:browser

# จำลองการใช้งานบนมือถือ (หน้าจอสัมผัส, จุดแตะ ≥44px, ฟอนต์ ≥16px, เน็ตช้า, สัญญาณหลุด)
npm run check:mobile

# ตรวจสอบว่าไม่มีข้อมูลลับ 🔒 (ราคาซื้อ, ชื่อคู่ค้า, ลูกค้า) รั่วไหลไปหน้าสาธารณะ
# *ต้องเปิด `npm run dev` ทิ้งไว้ก่อนรันคำสั่งนี้*
npm run check:leaks

# ทดสอบฟอร์มบันทึกข้อมูลหลังบ้านทั้งหมด (รันบนเครื่องเท่านั้น)
npm run check:forms

# ตรวจสอบการจำกัดสิทธิ์ของพนักงาน (ต้องไม่เห็นยอดเงิน คู่ค้า หรือลูกค้า)
npm run check:staff

# ทดสอบระบบคิวบันทึกข้อมูลเมื่อออฟไลน์ในสวน
npm run check:offline

# ตรวจสอบคะแนน Lighthouse บนมือถือ (ต้อง build และรัน preview ก่อน)
npm run check:lighthouse
```

### 3. คำสั่งจัดการสื่อและเตรียมขึ้นระบบ
```sh
npm run brand:build        # ปรับขนาดและ Optimize โลโก้/ไอคอนเว็บจากต้นฉบับ
npm run predeploy          # ตรวจสอบความพร้อมก่อนนำขึ้น Production
npm run snapshot:export    # ส่งออก Snapshot ฐานข้อมูลและรูปภาพในเครื่อง
npm run generate-types     # อัปเดต Cloudflare Wrangler Types หลังแก้ wrangler.jsonc
```

---

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```
metafarm/
├── content/               # บทความและเนื้อหา Markdown (แก้ไขได้โดยไม่ต้องแก้โค้ด)
│   ├── learn/             # งานวิจัยและองค์ความรู้
│   ├── pages/             # เนื้อหาหน้าเว็บ (ชันโรงขนเงิน, น้ำผึ้ง, ความเป็นส่วนตัว)
│   └── training/          # รายละเอียดหลักสูตรการอบรม
├── design/                # โลโก้ และภาพร่างการออกแบบ (Wireframes)
├── design-system/         # คู่มือดีไซน์ซิสเต็ม (MASTER.md: สี, ฟอนต์, กฎ UX)
├── docs/                  # เอกสารวิเคราะห์และแผนงานทางเทคนิค (ดูตารางด้านล่าง)
├── drizzle/               # D1 SQL Migrations
├── mock-data/             # ข้อมูลตัวอย่างสำหรับใช้ทดสอบ
├── private/               # ⚠️ gitignore: ไฟล์ Excel ต้นฉบับ และข้อมูลอ่อนไหว
├── scripts/               # สคริปต์อัตโนมัติ (Import, Seed, Backup, QA checks)
└── src/                   # โค้ดต้นฉบับของเว็บแอปพลิเคชัน
    ├── components/        # Astro Components (Header, Footer, Lightbox, Cards)
    ├── db/                # Drizzle Schema (`schema.ts`)
    ├── layouts/           # Page Layouts (`PublicLayout`, `AdminLayout`)
    ├── lib/               # โมดูลฟังก์ชันอรรถประโยชน์ และ Business Logic
    ├── pages/             # Astro Routing (เว็บสาธารณะ และ `/admin/*`)
    ├── scripts/           # Client-side Scripts (Lightbox, Zoom, Outbox, Resize)
    ├── server/            # ฟังก์ชันฝั่ง Server (Auth, Database queries, API)
    └── styles/            # Tailwind Global Styles
```

---

## 📚 สารบัญเอกสารโครงการ (Documentation Index)

เอกสารทั้งหมดถูกจัดเก็บอยู่ในโฟลเดอร์ [`docs/`](docs/) เพื่อใช้อ้างอิงการตัดสินใจและข้อกำหนดทางเทคนิค:

| ไฟล์เอกสาร | หัวข้อและเนื้อหาสำคัญ |
|---|---|
| [**00-roadmap.md**](docs/00-roadmap.md) | แผนการพัฒนารายเฟส (Phase 0–5), สถานะปัจจุบัน และสิ่งที่ต้องทำต่อ |
| [**01-requirements.md**](docs/01-requirements.md) | กลุ่มผู้ใช้, ข้อกำหนดการใช้งาน (Non-functional), และ User Stories |
| [**02-architecture.md**](docs/02-architecture.md) | สถาปัตยกรรมระบบ, โครงสร้าง Server/Client, และหลักการออกแบบ |
| [**03-data-model.md**](docs/03-data-model.md) | โครงสร้างฐานข้อมูล D1, ฟิลด์ข้อมูลลับ 🔒, และการแปลงข้อมูลจาก Excel |
| [**04-sitemap.md**](docs/04-sitemap.md) | แผนผังหน้าจอทั้งหมด (หน้าเว็บสาธารณะ และเมนูหลังบ้านทั้งมือถือ/คอม) |
| [**05-sales-channels.md**](docs/05-sales-channels.md) | ช่องทางการขาย, การสั่งซื้อผ่านแชต, และข้อกำหนดฉลาก/อย. |
| [**06-mock-data.md**](docs/06-mock-data.md) | สรุปข้อมูลจริงของฟาร์ม และราคาตั้งต้นสำหรับทดสอบ |
| [**07-decisions.md**](docs/07-decisions.md) | บันทึกการตัดสินใจทางสถาปัตยกรรม (ADR) และข้อตกลงกับเจ้าของฟาร์ม |
| [**08-stack-comparison.md**](docs/08-stack-comparison.md) | การเปรียบเทียบเทคโนโลยีและการเลือก Astro + Cloudflare |
| [**09-research-notes.md**](docs/09-research-notes.md) | ข้อมูลและหลักฐานอ้างอิงงานวิจัยน้ำผึ้งชันโรง (เพื่อความถูกต้องตามกฎหมาย) |
| [**10-deploy-runbook.md**](docs/10-deploy-runbook.md) | คู่มือการขึ้นระบบจริงบน Cloudflare, การสำรอง/กู้คืนข้อมูล และการแก้ปัญหา |
| [**11-phase4-plan.md**](docs/11-phase4-plan.md) | แผนและข้อกำหนดของ Phase 4 (ออเดอร์, ล็อตน้ำผึ้ง, ฉลาก QR, รายงาน) |
| [**12-phase5-plan.md**](docs/12-phase5-plan.md) | แผนและข้อกำหนดของ Phase 5 (สิทธิ์ผู้ใช้, โหมดออฟไลน์ในสวน, การจัดการข้อมูลชนกัน) |

---

## ⚠️ ข้อควรระวังและความปลอดภัย (Safety Rules)

> [!CAUTION]
> **ระบบ Production คือแหล่งเก็บข้อมูลจริง (Source of Truth):**
> 1. **ห้ามนำ `seed.sql` หรือ `snapshot.sql` ไปรันกับฐานข้อมูล Production เด็ดขาด** เพราะมีคำสั่ง `DELETE FROM` ที่จะล้างข้อมูลจริงทั้งหมด
> 2. **ห้ามนำเข้าข้อมูลส่วนบุคคล (PII) หรือข้อมูลคู่ค้าจาก `private/` ขึ้นสู่ Git หรือเปิดเผยบนหน้าสาธารณะ**
> 3. **ฟิลด์ข้อมูลลับ 🔒:** ราคาซื้อ, ชื่อคู่ค้า, รายชื่อลูกค้า และหมายเหตุส่วนตัว ต้องผ่านตัวกรองฝั่ง Server เสมอ
> 4. **ข้อกำหนดด้านสุขภาพ:** หน้าเว็บห้ามระบุว่าน้ำผึ้งชันโรง "รักษาโรค" หรือเป็น "ยา" ตามกฎหมายอาหาร ให้ใช้ถ้อยคำว่า "อาหาร ไม่ใช่ยา" เสมอ
