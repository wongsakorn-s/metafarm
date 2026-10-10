# content

เนื้อหาของเว็บสาธารณะที่แก้ได้โดยไม่ต้องแตะโค้ด (Markdown) — โหลดโดย `src/lib/content.ts`

| โฟลเดอร์ | หน้าเว็บ | หมายเหตุ |
|---|---|---|
| `pages/stingless-bee.md` | `/stingless-bee` ชันโรงขนเงิน | หน้าความรู้แบบมีรูป (ดูด้านล่าง) · ห้ามมีราคา |
| `pages/honey.md` | `/honey` น้ำผึ้งชันโรง | หน้าความรู้แบบมีรูป · ห้ามเขียนสรรพคุณรักษาโรค |
| `pages/privacy.md` | `/privacy` นโยบายความเป็นส่วนตัว | ร่าง — ควรให้เจ้าของเว็บทบทวน |
| `learn/research.md` | `/learn/research` น้ำผึ้งชันโรงในงานวิจัย | ต้องอ้างอิงทุกข้อ ไม่อ้างว่ารักษา/ป้องกันโรค ([docs/09](../docs/09-research-notes.md)) · ห้ามมีคำว่าราคา |
| `training/*.md` | `/training/<ชื่อไฟล์>` หลักสูตรอบรม | frontmatter `title`, `summary`, `duration`, `priceThb`, `order` — ราคา/ระยะเวลาจริงแก้ที่ `/admin/settings#courses` |
| `photos/`, `products/` | — | ว่าง (รูปสินค้า/รูปรังอัปโหลดจากหลังบ้าน) |

## หน้าความรู้แบบมีรูป (`pages/stingless-bee.md`, `pages/honey.md`)

ทุกหัวข้อ `## …` กลายเป็นหนึ่งช่วงของหน้า ส่วนบนของไฟล์ (frontmatter) กำหนดการจัดหน้า:

```yaml
lead: ข้อความเปิดใต้ชื่อหน้า
facts:                 # การ์ดข้อมูลน่ารู้ (ไอคอนจาก src/lib/icons.ts)
  - icon: sprout
    title: ช่วยผสมเกสร
    text: ช่วยผสมเกสรพืชในสวนผลไม้และสวนรอบ ๆ
sections:              # จับคู่กับหัวข้อ ## ด้วย "คำขึ้นต้น"
  - heading: ชันโรงคืออะไร
    photo: beeGuards   # ชื่อรูปใน src/lib/learn-photos.ts
  - heading: ทำไม MetaFarm
    style: highlight   # กรอบสีเขียว · notice = กรอบข้อควรรู้สีเหลือง
    slot: stats        # ของที่หน้าเว็บวางข้างข้อความ (ตัวเลขฟาร์ม / การ์ดรังเปล่า)
```

- แก้ชื่อหัวข้อ `##` แล้ว ต้องแก้ `heading:` ให้ขึ้นต้นตรงกันด้วย — `npm test` (`src/lib/content.test.ts`) จะเตือนถ้าไม่ตรง
- รูปประกอบตอนนี้เป็นรูปจาก Wikimedia Commons พร้อมเครดิต (ไม่ใช่รูปจากฟาร์ม) — เมื่อมีรูปจริงของฟาร์ม ให้เพิ่มใน `src/lib/learn-photos.ts` แล้วเปลี่ยน `photo:`
