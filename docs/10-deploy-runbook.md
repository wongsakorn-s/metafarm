# คู่มือขึ้นระบบจริง (Cloudflare)

> **สถานะ: ขึ้นระบบจริงแล้ว (2026-10-05)** ที่ https://metafarm.wong-saengsurasak.workers.dev — ระบบจริงคือ **ที่เก็บข้อมูลหลัก** เจ้าของฟาร์มกรอกข้อมูลจริงที่นั่น
> ข้อ 2 เป็นบันทึกการขึ้นครั้งแรก (ทำไปแล้ว) · ขึ้นโค้ดใหม่ใช้ GitHub Actions → **Deploy production** · ข้อมูลไหลทางเดียว: ระบบจริง → เครื่อง (กู้จากไฟล์สำรอง ข้อ 4) ห้ามส่งข้อมูลในเครื่องขึ้นระบบจริง

## 0. ก่อนเริ่ม: รัน `bun run predeploy`

คำสั่งนี้ตรวจว่าอะไรยังไม่พร้อม แยกเป็น **ต้องแก้ก่อน (❌)** และ **ควรแก้ (⚠️)** ตอนนี้ที่ต้องแก้คือ

1. **ช่องทางติดต่อจริง** — เจ้าของฟาร์มกรอกเองที่หลังบ้าน เมนู ⚙️ ตั้งค่า (LINE / เบอร์ / Facebook / แผนที่) แล้วติ๊ก "ยืนยัน" (ไม่ต้องแก้โค้ดแล้ว และแก้ทีหลังได้เสมอ) — ค่าอยู่ในฐานข้อมูล จึงต้องส่งไปกับข้อมูล (ข้อ 2.6)
2. `wrangler.jsonc` → ใส่ `database_id` จริงของ D1 (ข้อ 2.3)

เจ้าของฟาร์มดูความคืบหน้าของข้อมูลทั้งหมดได้เองที่หลังบ้าน เมนู ✅ เตรียมเปิด (รูปรัง ข้อมูลที่ไม่ครบ ราคา รูปสินค้า)

## 1. ⚠️ เรื่องที่ต้องรู้ก่อนสมัคร (อาจกระทบ "ไม่เสียเงิน")

| เรื่อง | รายละเอียด | ทางออก |
|---|---|---|
| **R2 อาจขอบัตรเครดิต** | เท่าที่ทราบ การเปิดใช้ R2 (ที่เก็บรูป) อาจให้ผูกช่องทางชำระเงินก่อน แม้จะใช้ในโควตาฟรี (10 GB) — **ตรวจที่ dashboard ก่อนกดเปิด** | ถ้าไม่อยากผูกบัตร ต้องเปลี่ยนที่เก็บรูป (เช่นเก็บรูปที่ย่อแล้วในฐานข้อมูล D1 — ผมทำให้ได้ แต่ต้องแก้โค้ด) |
| **เพดาน CPU 10 ms ต่อคำขอ (แผนฟรี)** | การตรวจรหัสผ่าน PBKDF2 100,000 รอบใช้เวลา ~15 ms บนเครื่องผม ถ้า Cloudflare นับรวม **ล็อกอินอาจขึ้น error 1102** (ยังยืนยันไม่ได้ ต้องลองจริง) | ดูหัวข้อ 5 |
| **ขนาดโปรแกรม** | ~1.6 MB (บีบแล้ว 354 KB) ผ่านเพดานแผนฟรี (3 MB บีบแล้ว) | – |

## 2. ครั้งแรก (ทำแล้ว 2026-10-05 — เก็บไว้อ้างอิง)

1. สมัคร Cloudflare (ฟรี) และตรวจหน้า R2 ว่าขอบัตรหรือไม่ (ดูข้อ 1)
2. `bunx wrangler login` (เปิดเบราว์เซอร์ให้อนุญาต)
3. สร้างฐานข้อมูล: `bunx wrangler d1 create metafarm-db` → จะได้ `database_id` → ใส่ใน `wrangler.jsonc` แทน `00000000-…`
4. สร้างที่เก็บรูป: `bunx wrangler r2 bucket create metafarm-media` และที่เก็บสำรอง `bunx wrangler r2 bucket create metafarm-backups`
   - ให้ลบสำรองเก่าเองหลัง 30 วัน: `bunx wrangler r2 bucket lifecycle add metafarm-backups expire-30d d1/ --expire-days 30` (ตรวจกับ wrangler 4.147 แล้ว: ชื่อกฎและ prefix เป็น positional)
5. สร้างตารางในฐานข้อมูลจริง: `bun run db:migrate:remote`
6. นำข้อมูลเข้า (**ทำครั้งเดียวก่อนใช้งานจริงเท่านั้น**)

   > ⛔ **ทำไปแล้ว ห้ามทำซ้ำ** — ทั้ง `snapshot.sql` และ `seed.sql` ลบข้อมูลรัง ประวัติ ออเดอร์ ลูกค้า ล็อต ทั้งหมดก่อนนำเข้า ตั้งแต่ 2026-10-09 ทั้งสองไฟล์มีตัวกัน (`scripts/local-only-guard.ts`): ถ้าฐานข้อมูลปลายทางมีบัญชีอีเมลจริง SQL จะหยุดก่อนลบ (`CHECK constraint failed: refuse_production_db_has_real_users`)

   > **เลือกที่เดียวเป็น "ที่กรอกข้อมูลหลัก"** เพื่อไม่ให้ข้อมูลสองที่ทับกัน: (ก) กรอกในเครื่องก่อนแล้วส่งขึ้นไป หรือ (ข) นำข้อมูลเริ่มต้นขึ้นก่อนแล้วกรอกบนระบบจริงเลย — ตัวเลือก (ข) ปลอดภัยกว่าถ้าเจ้าของฟาร์มจะกรอกต่อเนื่อง เพราะไม่ต้องส่งออกซ้ำ

   **ทาง (ก) แนะนำถ้าเจ้าของกรอกในเครื่องไว้แล้ว** (ตั้งค่าติดต่อ ราคา ถ่ายรูป เติมข้อมูลรัง) — ส่งออก "ข้อมูลปัจจุบัน" ไม่ใช่ไฟล์ Excel เดิม:
   ```powershell
   bun run snapshot:export    # → private/export/snapshot.sql (รัง ประวัติ รูป สินค้า การตั้งค่า) + private/export/media/ (รูป)
   # ⚠️ snapshot.sql "ล้างข้อมูลเนื้อหาในฐานข้อมูลปลายทางก่อนนำเข้า" (ไม่แตะผู้ใช้) — ใช้ครั้งแรกก่อนเริ่มใช้งานจริงเท่านั้น
   bunx wrangler d1 execute metafarm-db --remote --file private/export/snapshot.sql
   bun run media:upload:remote -- --tree private/export/media            # ดูรายการก่อน (ยังไม่ส่งอะไร)
   bun run media:upload:remote -- --tree private/export/media --yes      # อัปโหลดรูปจริง
   ```
   ทดสอบแล้วว่านำเข้าลงฐานข้อมูลเปล่าได้ข้อมูลเหมือนเดิมทุกตัวอักษร (เทียบทุกตาราง รวมความเชื่อมโยงรังแม่/รังลูก) แต่ไม่ได้ลองกับ Cloudflare จริง

   **ทาง (ข) เริ่มจากข้อมูล Excel เดิม** (ไม่ได้เอาสิ่งที่กรอกในเครื่องไป):
   ```powershell
   # ⚠️ seed.sql "ล้างข้อมูลรังทั้งหมดก่อนนำเข้า" ห้ามรันซ้ำหลังเริ่มใช้งานจริง ไม่งั้นข้อมูลที่บันทึกใหม่หาย
   bunx wrangler d1 execute metafarm-db --remote --file private/import/seed.sql
   # ⚠️ "> ไฟล์" ใน PowerShell 5.1 ได้ UTF-16 + หัวของคำสั่ง bun — รันใน Git Bash แทน: bun run --silent products:seed:local -- --sql > private/products.sql
   bunx wrangler d1 execute metafarm-db --remote --file private/products.sql
   bun run media:upload:remote -- --yes   # รูป 231 ไฟล์จาก Excel
   ```

   **ทั้งสองทาง — สร้างผู้ใช้เจ้าของบนระบบจริง** (ไม่ได้ส่งออกไปกับ snapshot):
   ```powershell
   bun run user:create -- --email อีเมลเจ้าของ@ตัวอย่าง.com --name "ชื่อ" --generate --print-sql   # เขียน private/owner.sql (UTF-8) ให้เอง — ห้ามใช้ "> ไฟล์" ใน PowerShell 5.1 (ได้ UTF-16 + หัวของคำสั่ง bun → wrangler รันไม่ได้ ผู้ใช้ไม่ถูกสร้าง)
   bunx wrangler d1 execute metafarm-db --remote --file private/owner.sql
   # รหัสผ่านที่สุ่มอยู่ที่ private/prod-owner.txt → ตั้งแต่ 2026-10-10 ระบบบังคับเปลี่ยนรหัสตอนเข้าใช้ครั้งแรก (must_change_password) จากนั้นลบ owner.sql / prod-owner.txt / private/export
   ```
7. Deploy ครั้งแรก: `bun run build` แล้ว `bunx wrangler deploy` → ได้ลิงก์ `https://metafarm.<ชื่อบัญชี>.workers.dev`
8. ตั้ง GitHub Actions (ครั้งต่อไปจะ deploy ผ่านปุ่มใน GitHub):
   - Cloudflare → My Profile → API Tokens → Create Token ใช้แม่แบบ "Edit Cloudflare Workers" แล้วเพิ่มสิทธิ์ **D1: Edit** และ **Workers R2 Storage: Edit** (ให้เฉพาะบัญชีนี้)
   - GitHub repo → Settings → Secrets and variables → Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Settings → Environments → `production` → เปิด **Required reviewers** (ให้ต้องกดอนุมัติก่อน deploy)

## 3. ตรวจหลัง deploy (ทำตามนี้ทุกครั้งที่ขึ้นใหม่)

```powershell
# 1) หัวข้อความปลอดภัย + การบีบอัด (Lighthouse ในเครื่องแจ้งว่ายังไม่บีบอัด — Cloudflare ควรบีบให้เอง)
curl.exe -sI -H "Accept-Encoding: br, gzip" https://<ลิงก์เว็บ>/ | findstr /i "content-encoding content-security strict-transport x-frame cache-control"

# 2) ไม่มีข้อมูลลับหลุด (ใช้ข้อมูลในเครื่องเป็นตัวเทียบ จึงต้องมีข้อมูลเหมือนที่นำขึ้น)
$env:BASE_URL = "https://<ลิงก์เว็บ>"; bun run check:leaks

# 3) คะแนน Lighthouse มือถือ (เป้า ≥ 90)
$env:BASE_URL = "https://<ลิงก์เว็บ>"; bun run check:lighthouse

# 4) ภาพหน้าจอ + ตรวจ error ใน console ทุกหน้า (มือถือ+คอม) — ต้องใส่บัญชีเจ้าของของระบบจริง
#    (หน้านี้ตรวจแบบอ่านอย่างเดียว ไม่บันทึกข้อมูล แต่ล็อกอินจริง)
$env:BASE_URL = "https://<ลิงก์เว็บ>"; $env:ADMIN_EMAIL = "<อีเมล>"; $env:ADMIN_PASSWORD = "<รหัสผ่าน>"; bun run check:browser
$env:ADMIN_PASSWORD = $null
```

เช็กด้วยมือ: เข้า `/admin` ด้วยบัญชีเจ้าของ → **ล็อกอินได้ไหม (ดูข้อ 5)** → เปลี่ยนรหัสผ่าน → บันทึกการเก็บน้ำหวานทดลอง 1 รายการ → เปิดหน้าสมุดพกของรังนั้น → อัปโหลดรูปจากมือถือ → ดู `/sitemap.xml` (URL ต้องเป็นโดเมนจริง)

## 3.1 แก้ข้อมูลบนระบบจริงด้วยไฟล์ SQL (`scripts/prod-data/`)

ใช้เมื่อต้องแก้ข้อมูลหลายจุดพร้อมกันแทนการกดในหลังบ้าน (เช่นตามที่เจ้าของขอ) — ไม่ใช่ migration (ไม่อยู่ใน `drizzle/`)
- ทุกไฟล์: รันซ้ำได้ (ไม่เพิ่มซ้ำ) · ไม่ลบข้อมูล · บันทึก `audit_logs` · หัวไฟล์บอกว่าต้อง deploy ถึง migration ไหนก่อน
- ลองกับเครื่องตัวเองก่อนเสมอ: `bunx wrangler d1 execute metafarm-db --local --file scripts/prod-data/<ไฟล์>.sql`
- แล้วผู้ดูแลรันกับระบบจริง: `bunx wrangler d1 execute metafarm-db --remote --file scripts/prod-data/<ไฟล์>.sql` (ท้ายไฟล์มี SELECT แสดงผลให้ตรวจ)

| ไฟล์ | ต้อง deploy ก่อน | ทำอะไร |
|---|---|---|
| `2026-10-10-honey-175-hive-box-750.sql` | migration 0015 | น้ำผึ้ง: เพิ่ม "ขวด" 175 มล. 350 บาท ซ่อน 50/120 มล. ตัดคำ "มีสองขนาด" · รังเปล่า 750 บาท — ✅ รันแล้ว 2026-10-10 |
| `2026-10-18-queen-bred-to-split.sql` | ไม่ต้อง (แนะนำให้ deploy รอบ 1 ของคอมเมนต์ 2026-10-18 ก่อน เพื่อให้วันเกิดนางพญายังแสดงบนสมุดพก) | รัง "เพาะนางพญาเอง" ที่เหลือ 9 รัง (A100, A103–A110) → "ขยายรังโดย MetaFarm" ตามที่เจ้าของยืนยัน · ตรวจ `queen_bred_left = 0` — ✅ รันแล้ว 2026-10-18 (ตรวจหน้าสมุดพกทั้ง 9 รังแล้ว) |

**migration รอบ 2026-10-10** (เพิ่มอย่างเดียว ไม่ลบข้อมูล — `deploy.yml` apply ให้ก่อน deploy): 0014 `order_item_lots` (+ ย้ายล็อตของออเดอร์ที่ชำระแล้ว), 0015 `product_variants.hidden`, 0016 `gallery_photos`

## 4. สำรองและกู้ข้อมูล

- **สำรองอัตโนมัติ:** `.github/workflows/backup.yml` ทุกคืน 03:00 → R2 `metafarm-backups/d1/metafarm-YYYY-MM-DD.sql` (ข้ามเองถ้ายังไม่ตั้ง secret) — **กดรันเองครั้งแรกและเปิดไฟล์ดูว่ากู้ได้จริง**
- **สำรองรูป:** `.github/workflows/backup-media.yml` ทุกวันอาทิตย์ 04:00 → `metafarm-backups/media/<คีย์เดิม>` เพิ่มเฉพาะรูปใหม่ (รายชื่อที่สำรองแล้วอยู่ใน `media/_manifest.txt`) ไม่ลบรูปเก่าในที่สำรอง · ครั้งแรกกดรันเอง (~230 รูป ใช้เวลาราว 20 นาที) · รูปย่อ (`thumb/`) ไม่สำรอง
  - กู้รูปหนึ่งรูป: `bunx wrangler r2 object get metafarm-backups/media/<คีย์> --file x --remote` แล้ว `bunx wrangler r2 object put metafarm-media/<คีย์> --file x --remote` (คีย์ดูได้จาก `hive_media.r2_key`)
- **วิดีโอ:** ไฟล์วิดีโอ (รัง/หน้าแรก) อยู่ใน R2 เดียวกับรูป (`videos/…`) และอยู่ในรายการสำรองรูปด้วย (ใช้เวลาสำรองนานขึ้นตามขนาดไฟล์) · อัปโหลดวิดีโอแนะนำสวนขึ้นระบบจริง: เข้า `/admin/settings` บนเว็บจริง → "วิดีโอแนะนำฟาร์ม" → เลือกไฟล์ MP4 (H.264 ไม่เกิน 90 MB) — ทำผ่านหน้าเว็บจริงเท่านั้น (ไม่ผ่าน wrangler)
- **ย้อนเวอร์ชันโปรแกรม:** `bunx wrangler rollback`
- **ย้อนฐานข้อมูล:** D1 Time Travel (`bunx wrangler d1 time-travel info metafarm-db` / `restore … --timestamp …`) ระยะเวลาย้อนหลังตามแผนของ Cloudflare
- **กู้จากไฟล์สำรอง:** ไฟล์จาก `d1 export` เรียงตารางตามตัวอักษร (audit_logs ก่อน users) นำเข้าตรง ๆ จะขึ้น `no such table: main.users` ต้องเรียงใหม่ก่อน (ทดสอบกู้จริงแล้ว 2026-10-05 ได้ข้อมูลครบ):
  ```powershell
  bunx wrangler r2 object get metafarm-backups/d1/metafarm-YYYY-MM-DD.sql --file private/backup.sql --remote
  bun run backup:prepare -- private/backup.sql            # → private/backup.restore.sql
  # ทดสอบในฐานข้อมูลแยกก่อนเสมอ (ไม่แตะเว็บจริง/ข้อมูลในเครื่อง)
  bunx wrangler d1 execute metafarm-db --local --persist-to .wrangler/restore-test --file private/backup.restore.sql
  ```
  กู้ลงระบบจริงต้องใช้ฐานข้อมูลเปล่า (ไฟล์มี CREATE TABLE) — สร้าง D1 ใหม่ กู้ลงไป แล้วเปลี่ยน `database_id` ใน `wrangler.jsonc` และ deploy ใหม่ (ปลอดภัยกว่าล้างของเดิม)
- กฎ migration: **เพิ่มอย่างเดียว** (เพิ่มตาราง/คอลัมน์) ห้ามลบ/เปลี่ยนชื่อในครั้งเดียวกับการ deploy โค้ด

## 5. ถ้าล็อกอินบนระบบจริงขึ้น error 1102 ("เกินเวลา CPU")

ลองตามลำดับ (เริ่มจากถูกสุด):
1. **ลดรอบ PBKDF2** ใน `src/lib/auth/password.ts` (`ITERATIONS`) เช่นเหลือ 10,000–20,000 — รหัสผ่านเก่ายังใช้ได้เพราะจำนวนรอบเก็บอยู่ในตัว hash แต่ความทนทานต่อการเดารหัสลดลง ควรชดเชยด้วยรหัสผ่านยาว + Cloudflare Access (ข้อ 3)
2. **เพิ่ม Cloudflare Access (ฟรีไม่เกิน 50 ผู้ใช้)** คุมหน้า `/admin` อีกชั้น (ส่งรหัสทางอีเมล) แล้วลดความเข้มของรหัสผ่านในแอปได้
3. **Workers แผนเสียเงิน** ประมาณ 5 ดอลลาร์/เดือน (เพดาน CPU สูงกว่ามาก) — ขัดกับเป้า "ไม่เสียเงิน" จึงเป็นทางเลือกสุดท้าย

## 5.1 สร้างรูปขนาดกลางให้รูปเก่า (ทำครั้งเดียวหลัง deploy เวอร์ชันที่มีรูปกลาง — 2026-10-18)

รูปที่อัปโหลดหลังเวอร์ชันนี้มีรูปกลาง 800px ให้เองอยู่แล้ว ส่วนรูปเก่าใช้รูปเต็มไปก่อน (ไม่พัง แค่โหลดช้ากว่าบนมือถือ) สร้างรูปกลางให้รูปเก่าด้วย:

```sh
bun run media:medium -- --remote            # ดูก่อนว่ากี่รูปที่ยังไม่มี (ไม่เขียนอะไร)
bun run media:medium -- --remote --yes      # สร้างจริง (ต้อง wrangler login แล้ว) รันซ้ำได้ ข้ามรูปที่มีแล้ว
```

- ไม่แตะรูปเต็ม/รูปย่อ · รูปที่ด้านยาวไม่เกิน 800px (เช่นรูปที่ย่อมาจาก Excel) จะถูกข้าม ไม่ต้องมีรูปกลาง
- ถ้าขึ้น "ไม่พบรูปเต็มใน R2" แปลว่าฐานข้อมูลอ้างถึงรูปที่ไม่มีใน R2 — ตรวจรายการนั้น (สคริปต์จบด้วยสถานะผิดพลาด)
- แต่ละรูปเรียก wrangler 2–3 ครั้ง (รูปหลายร้อยรูปใช้เวลาหลายนาที) · ใช้ `--limit 20` ทดลองก่อนได้
- รูปกลางไม่อยู่ใน backup รายสัปดาห์ (สร้างใหม่จากรูปเต็มได้เสมอ เหมือนรูปย่อ)

## 6. โดเมนจริง (ค่าใช้จ่ายเดียว ~400 บาท/ปี)

ซื้อผ่าน Cloudflare Registrar (ราคาทุน) → Workers → metafarm → Settings → Domains & Routes → Add Custom Domain → จากนั้น `sitemap.xml`/`robots.txt`/canonical ใช้โดเมนใหม่เองอัตโนมัติ ต้องทำต่อ: อัปเดตช่องทางติดต่อ, Google Business Profile, ส่ง sitemap เข้า Google Search Console

> ⚠️ **ตัดสินใจเรื่องโดเมนก่อนพิมพ์ฉลากล็อตจริง** — QR บนฉลากใช้โดเมนของหน้าที่เปิดพิมพ์ (`lots/[code]/labels.astro`) ฉลากที่พิมพ์จากลิงก์ workers.dev จะชี้ workers.dev ตลอดไป ถ้าย้ายโดเมนทีหลัง ต้องเปิด workers.dev ไว้ต่อ (หรือ redirect) ไม่งั้นขวดที่ขายไปแล้วสแกนไม่ได้

## 7. ค่าใช้จ่ายที่คาด (ข้อมูลทั่วไป ตรวจหน้า pricing อีกครั้งก่อนใช้)

| บริการ | โควตาฟรี (โดยประมาณ) | การใช้งานของเรา |
|---|---|---|
| Workers | 100,000 คำขอ/วัน | น้อยกว่า 1% |
| D1 | 5 GB, อ่าน 5 ล้านแถว/วัน | ข้อมูลหลักไม่กี่ MB |
| R2 | 10 GB | รูปปัจจุบัน ~4 MB (แต่ดูข้อ 1 เรื่องบัตร) |
| GitHub private repo + Actions | ฟรี | CI ไม่กี่นาทีต่อครั้ง |

## 8. ความปลอดภัย (สรุป)

- API token ให้สิทธิ์เท่าที่จำเป็น เก็บเป็น GitHub secret เท่านั้น ห้ามใส่ในไฟล์ในโปรเจกต์
- `private/` ไม่ขึ้น git (มีรายชื่อคู่ค้า, รหัสผ่านเริ่มต้น, ไฟล์ SQL ที่มี hash) — ลบ `prod-owner.txt` / `owner.sql` หลังใช้
- หัวข้อ CSP/HSTS เปิดเฉพาะ build จริง (`src/lib/security-headers.ts`) ทดสอบแล้วว่าบล็อกสคริปต์/เฟรมจากเว็บอื่น แต่วิดีโอ YouTube และการอัปโหลดรูปยังใช้ได้
- ชันโรงขนเงินและข้อมูลฟาร์มเป็นของสาธารณะอยู่แล้ว แต่ราคาซื้อ คู่ค้า ลูกค้า หมายเหตุภายใน **ต้องไม่หลุด** → รัน `bun run check:leaks` ก่อนทุกครั้งที่แก้โค้ดส่วนสาธารณะ

## 9. ยังไม่ได้ทำ / ไม่ได้ทดสอบ

- สำรองรูปรายสัปดาห์ (`backup-media.yml`) รันสำเร็จแล้ว (2026-10-11 และ 10-17 ตามผลใน GitHub Actions) แต่ยังไม่ได้เปิดดูไฟล์ใน `metafarm-backups/media/` ว่ามีครบ — ดูด้วย `bunx wrangler r2 object get metafarm-backups/media/_manifest.txt --file m.txt --remote` แล้วนับบรรทัดเทียบกับจำนวนรูป
- สำรองข้อมูลอยู่บัญชี Cloudflare เดียวกับระบบจริง ใช้ token เดียวกัน เก็บ 30 วัน — ยังไม่มีสำเนานอกบัญชี และยังไม่แยก token สำรองข้อมูล
- รูปที่ลบในหลังบ้านลบจาก R2 ทันที แต่สำรองรูปสัปดาห์ละครั้ง → รูปที่อัปโหลดหลังรอบสำรองล่าสุดแล้วถูกลบ กู้ไม่ได้
- แยก environment `preview`/`production` (ตอนนี้มี production เดียว) — ทำเมื่อมีผู้ร่วมพัฒนา
- ตรวจเว็บล่ม: `.github/workflows/uptime.yml` ทุก 30 นาที GET 7 หน้า (`/`, `/passport`, `/products`, `/gallery`, `/contact`, `/admin/login`, `/sitemap.xml`) ลองซ้ำ 3 ครั้ง ไม่ได้ 200 → งานล้ม GitHub ส่งอีเมลแจ้ง · ไม่ตรวจการล็อกอินจริง (ไม่มีรหัสในระบบ) ล็อกอินล้มแบบสุ่มยังต้องดูจาก Workers Logs (`observability` เปิดแล้วใน `wrangler.jsonc`) · GitHub หยุด workflow ตามเวลาเองถ้า repo ไม่มี push นาน 60 วัน ต้องกดเปิดใหม่ที่หน้า Actions
