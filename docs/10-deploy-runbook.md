# คู่มือขึ้นระบบจริง (Cloudflare)

> **สถานะ: ขึ้นระบบจริงแล้ว (2026-10-05)** ที่ https://metafarm.wong-saengsurasak.workers.dev — ระบบจริงคือ **ที่เก็บข้อมูลหลัก** เจ้าของฟาร์มกรอกข้อมูลจริงที่นั่น
> ข้อ 2 เป็นบันทึกการขึ้นครั้งแรก (ทำไปแล้ว) · ขึ้นโค้ดใหม่ใช้ GitHub Actions → **Deploy production** · ข้อมูลไหลทางเดียว: ระบบจริง → เครื่อง (กู้จากไฟล์สำรอง ข้อ 4) ห้ามส่งข้อมูลในเครื่องขึ้นระบบจริง

## 0. ก่อนเริ่ม: รัน `npm run predeploy`

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
2. `npx wrangler login` (เปิดเบราว์เซอร์ให้อนุญาต)
3. สร้างฐานข้อมูล: `npx wrangler d1 create metafarm-db` → จะได้ `database_id` → ใส่ใน `wrangler.jsonc` แทน `00000000-…`
4. สร้างที่เก็บรูป: `npx wrangler r2 bucket create metafarm-media` และที่เก็บสำรอง `npx wrangler r2 bucket create metafarm-backups`
   - ให้ลบสำรองเก่าเองหลัง 30 วัน: `npx wrangler r2 bucket lifecycle add metafarm-backups expire-30d d1/ --expire-days 30` (ตรวจกับ wrangler 4.147 แล้ว: ชื่อกฎและ prefix เป็น positional)
5. สร้างตารางในฐานข้อมูลจริง: `npm run db:migrate:remote`
6. นำข้อมูลเข้า (**ทำครั้งเดียวก่อนใช้งานจริงเท่านั้น**)

   > ⛔ **ทำไปแล้ว ห้ามทำซ้ำ** — ทั้ง `snapshot.sql` และ `seed.sql` ลบข้อมูลรัง ประวัติ ออเดอร์ ลูกค้า ล็อต ทั้งหมดก่อนนำเข้า ตั้งแต่ 2026-10-09 ทั้งสองไฟล์มีตัวกัน (`scripts/local-only-guard.ts`): ถ้าฐานข้อมูลปลายทางมีบัญชีอีเมลจริง SQL จะหยุดก่อนลบ (`CHECK constraint failed: refuse_production_db_has_real_users`)

   > **เลือกที่เดียวเป็น "ที่กรอกข้อมูลหลัก"** เพื่อไม่ให้ข้อมูลสองที่ทับกัน: (ก) กรอกในเครื่องก่อนแล้วส่งขึ้นไป หรือ (ข) นำข้อมูลเริ่มต้นขึ้นก่อนแล้วกรอกบนระบบจริงเลย — ตัวเลือก (ข) ปลอดภัยกว่าถ้าเจ้าของฟาร์มจะกรอกต่อเนื่อง เพราะไม่ต้องส่งออกซ้ำ

   **ทาง (ก) แนะนำถ้าเจ้าของกรอกในเครื่องไว้แล้ว** (ตั้งค่าติดต่อ ราคา ถ่ายรูป เติมข้อมูลรัง) — ส่งออก "ข้อมูลปัจจุบัน" ไม่ใช่ไฟล์ Excel เดิม:
   ```powershell
   npm run snapshot:export    # → private/export/snapshot.sql (รัง ประวัติ รูป สินค้า การตั้งค่า) + private/export/media/ (รูป)
   # ⚠️ snapshot.sql "ล้างข้อมูลเนื้อหาในฐานข้อมูลปลายทางก่อนนำเข้า" (ไม่แตะผู้ใช้) — ใช้ครั้งแรกก่อนเริ่มใช้งานจริงเท่านั้น
   npx wrangler d1 execute metafarm-db --remote --file private/export/snapshot.sql
   npm run media:upload:remote -- --tree private/export/media            # ดูรายการก่อน (ยังไม่ส่งอะไร)
   npm run media:upload:remote -- --tree private/export/media --yes      # อัปโหลดรูปจริง
   ```
   ทดสอบแล้วว่านำเข้าลงฐานข้อมูลเปล่าได้ข้อมูลเหมือนเดิมทุกตัวอักษร (เทียบทุกตาราง รวมความเชื่อมโยงรังแม่/รังลูก) แต่ไม่ได้ลองกับ Cloudflare จริง

   **ทาง (ข) เริ่มจากข้อมูล Excel เดิม** (ไม่ได้เอาสิ่งที่กรอกในเครื่องไป):
   ```powershell
   # ⚠️ seed.sql "ล้างข้อมูลรังทั้งหมดก่อนนำเข้า" ห้ามรันซ้ำหลังเริ่มใช้งานจริง ไม่งั้นข้อมูลที่บันทึกใหม่หาย
   npx wrangler d1 execute metafarm-db --remote --file private/import/seed.sql
   # ⚠️ "> ไฟล์" ใน PowerShell 5.1 ได้ UTF-16 + หัวของ npm — รันใน Git Bash แทน: npm run -s products:seed:local -- --sql > private/products.sql
   npx wrangler d1 execute metafarm-db --remote --file private/products.sql
   npm run media:upload:remote -- --yes   # รูป 231 ไฟล์จาก Excel
   ```

   **ทั้งสองทาง — สร้างผู้ใช้เจ้าของบนระบบจริง** (ไม่ได้ส่งออกไปกับ snapshot):
   ```powershell
   npm run user:create -- --email อีเมลเจ้าของ@ตัวอย่าง.com --name "ชื่อ" --generate --print-sql   # เขียน private/owner.sql (UTF-8) ให้เอง — ห้ามใช้ "> ไฟล์" ใน PowerShell 5.1 (ได้ UTF-16 + หัวของ npm → wrangler รันไม่ได้ ผู้ใช้ไม่ถูกสร้าง)
   npx wrangler d1 execute metafarm-db --remote --file private/owner.sql
   # รหัสผ่านที่สุ่มอยู่ที่ private/prod-owner.txt → เข้าระบบแล้วไปเมนู "🔑 บัญชี" เปลี่ยนรหัสทันที จากนั้นลบ owner.sql / prod-owner.txt / private/export
   ```
7. Deploy ครั้งแรก: `npm run build` แล้ว `npx wrangler deploy` → ได้ลิงก์ `https://metafarm.<ชื่อบัญชี>.workers.dev`
8. ตั้ง GitHub Actions (ครั้งต่อไปจะ deploy ผ่านปุ่มใน GitHub):
   - Cloudflare → My Profile → API Tokens → Create Token ใช้แม่แบบ "Edit Cloudflare Workers" แล้วเพิ่มสิทธิ์ **D1: Edit** และ **Workers R2 Storage: Edit** (ให้เฉพาะบัญชีนี้)
   - GitHub repo → Settings → Secrets and variables → Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Settings → Environments → `production` → เปิด **Required reviewers** (ให้ต้องกดอนุมัติก่อน deploy)

## 3. ตรวจหลัง deploy (ทำตามนี้ทุกครั้งที่ขึ้นใหม่)

```powershell
# 1) หัวข้อความปลอดภัย + การบีบอัด (Lighthouse ในเครื่องแจ้งว่ายังไม่บีบอัด — Cloudflare ควรบีบให้เอง)
curl.exe -sI -H "Accept-Encoding: br, gzip" https://<ลิงก์เว็บ>/ | findstr /i "content-encoding content-security strict-transport x-frame cache-control"

# 2) ไม่มีข้อมูลลับหลุด (ใช้ข้อมูลในเครื่องเป็นตัวเทียบ จึงต้องมีข้อมูลเหมือนที่นำขึ้น)
$env:BASE_URL = "https://<ลิงก์เว็บ>"; npm run check:leaks

# 3) คะแนน Lighthouse มือถือ (เป้า ≥ 90)
$env:BASE_URL = "https://<ลิงก์เว็บ>"; npm run check:lighthouse

# 4) ภาพหน้าจอ + ตรวจ error ใน console ทุกหน้า (มือถือ+คอม) — ต้องใส่บัญชีเจ้าของของระบบจริง
#    (หน้านี้ตรวจแบบอ่านอย่างเดียว ไม่บันทึกข้อมูล แต่ล็อกอินจริง)
$env:BASE_URL = "https://<ลิงก์เว็บ>"; $env:ADMIN_EMAIL = "<อีเมล>"; $env:ADMIN_PASSWORD = "<รหัสผ่าน>"; npm run check:browser
$env:ADMIN_PASSWORD = $null
```

เช็กด้วยมือ: เข้า `/admin` ด้วยบัญชีเจ้าของ → **ล็อกอินได้ไหม (ดูข้อ 5)** → เปลี่ยนรหัสผ่าน → บันทึกการเก็บน้ำหวานทดลอง 1 รายการ → เปิดหน้าสมุดพกของรังนั้น → อัปโหลดรูปจากมือถือ → ดู `/sitemap.xml` (URL ต้องเป็นโดเมนจริง)

## 4. สำรองและกู้ข้อมูล

- **สำรองอัตโนมัติ:** `.github/workflows/backup.yml` ทุกคืน 03:00 → R2 `metafarm-backups/d1/metafarm-YYYY-MM-DD.sql` (ข้ามเองถ้ายังไม่ตั้ง secret) — **กดรันเองครั้งแรกและเปิดไฟล์ดูว่ากู้ได้จริง**
- **สำรองรูป:** `.github/workflows/backup-media.yml` ทุกวันอาทิตย์ 04:00 → `metafarm-backups/media/<คีย์เดิม>` เพิ่มเฉพาะรูปใหม่ (รายชื่อที่สำรองแล้วอยู่ใน `media/_manifest.txt`) ไม่ลบรูปเก่าในที่สำรอง · ครั้งแรกกดรันเอง (~230 รูป ใช้เวลาราว 20 นาที) · รูปย่อ (`thumb/`) ไม่สำรอง
  - กู้รูปหนึ่งรูป: `npx wrangler r2 object get metafarm-backups/media/<คีย์> --file x --remote` แล้ว `npx wrangler r2 object put metafarm-media/<คีย์> --file x --remote` (คีย์ดูได้จาก `hive_media.r2_key`)
- **ย้อนเวอร์ชันโปรแกรม:** `npx wrangler rollback`
- **ย้อนฐานข้อมูล:** D1 Time Travel (`npx wrangler d1 time-travel info metafarm-db` / `restore … --timestamp …`) ระยะเวลาย้อนหลังตามแผนของ Cloudflare
- **กู้จากไฟล์สำรอง:** ไฟล์จาก `d1 export` เรียงตารางตามตัวอักษร (audit_logs ก่อน users) นำเข้าตรง ๆ จะขึ้น `no such table: main.users` ต้องเรียงใหม่ก่อน (ทดสอบกู้จริงแล้ว 2026-10-05 ได้ข้อมูลครบ):
  ```powershell
  npx wrangler r2 object get metafarm-backups/d1/metafarm-YYYY-MM-DD.sql --file private/backup.sql --remote
  npm run backup:prepare -- private/backup.sql            # → private/backup.restore.sql
  # ทดสอบในฐานข้อมูลแยกก่อนเสมอ (ไม่แตะเว็บจริง/ข้อมูลในเครื่อง)
  npx wrangler d1 execute metafarm-db --local --persist-to .wrangler/restore-test --file private/backup.restore.sql
  ```
  กู้ลงระบบจริงต้องใช้ฐานข้อมูลเปล่า (ไฟล์มี CREATE TABLE) — สร้าง D1 ใหม่ กู้ลงไป แล้วเปลี่ยน `database_id` ใน `wrangler.jsonc` และ deploy ใหม่ (ปลอดภัยกว่าล้างของเดิม)
- กฎ migration: **เพิ่มอย่างเดียว** (เพิ่มตาราง/คอลัมน์) ห้ามลบ/เปลี่ยนชื่อในครั้งเดียวกับการ deploy โค้ด

## 5. ถ้าล็อกอินบนระบบจริงขึ้น error 1102 ("เกินเวลา CPU")

ลองตามลำดับ (เริ่มจากถูกสุด):
1. **ลดรอบ PBKDF2** ใน `src/lib/auth/password.ts` (`ITERATIONS`) เช่นเหลือ 10,000–20,000 — รหัสผ่านเก่ายังใช้ได้เพราะจำนวนรอบเก็บอยู่ในตัว hash แต่ความทนทานต่อการเดารหัสลดลง ควรชดเชยด้วยรหัสผ่านยาว + Cloudflare Access (ข้อ 3)
2. **เพิ่ม Cloudflare Access (ฟรีไม่เกิน 50 ผู้ใช้)** คุมหน้า `/admin` อีกชั้น (ส่งรหัสทางอีเมล) แล้วลดความเข้มของรหัสผ่านในแอปได้
3. **Workers แผนเสียเงิน** ประมาณ 5 ดอลลาร์/เดือน (เพดาน CPU สูงกว่ามาก) — ขัดกับเป้า "ไม่เสียเงิน" จึงเป็นทางเลือกสุดท้าย

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
- ชันโรงขนเงินและข้อมูลฟาร์มเป็นของสาธารณะอยู่แล้ว แต่ราคาซื้อ คู่ค้า ลูกค้า หมายเหตุภายใน **ต้องไม่หลุด** → รัน `npm run check:leaks` ก่อนทุกครั้งที่แก้โค้ดส่วนสาธารณะ

## 9. ยังไม่ได้ทำ / ไม่ได้ทดสอบ

- สำรองข้อมูลอยู่บัญชี Cloudflare เดียวกับระบบจริง ใช้ token เดียวกัน เก็บ 30 วัน — ยังไม่มีสำเนานอกบัญชี และยังไม่แยก token สำรองข้อมูล
- รูปที่ลบในหลังบ้านลบจาก R2 ทันที แต่สำรองรูปสัปดาห์ละครั้ง → รูปที่อัปโหลดหลังรอบสำรองล่าสุดแล้วถูกลบ กู้ไม่ได้
- แยก environment `preview`/`production` (ตอนนี้มี production เดียว) — ทำเมื่อมีผู้ร่วมพัฒนา
- การตรวจ/แจ้งเตือนเมื่อเว็บล่ม (ใช้ Workers Logs ใน dashboard ไปก่อน)
