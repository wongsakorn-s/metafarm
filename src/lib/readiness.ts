// รายการ "ความพร้อมก่อนเปิดเว็บ" — สรุปสิ่งที่เจ้าของฟาร์มยังต้องเติม (ไม่ผูกกับ runtime ทดสอบได้)

export interface ReadinessInput {
  contactConfirmed: boolean;
  unconfirmedPrices: number;
  /** หลักสูตรอบรมที่ราคา/ระยะเวลายังไม่ยืนยัน */
  unconfirmedCourses: number;
  productsWithoutImage: number;
  activeHivesWithoutPhoto: number;
  incompleteHives: number;
  /** รังที่ตั้งขายแต่รูปขายไม่ครบ 3 รูป หรือไม่มีวิดีโอ */
  saleHivesNotReady: number;
  /** เลือกรูปหัวหน้าแรกแล้ว (ไม่เลือก = แสดงโลโก้) */
  heroChosen?: boolean;
}

export interface ReadinessItem {
  id: string;
  title: string;
  detail: string;
  done: boolean;
  /** จำนวนที่ยังค้าง (ถ้ามี) */
  count?: number;
  href: string;
  cta: string;
  /** must = ควรเสร็จก่อนเปิดเว็บ · should = ทำทีหลังได้ */
  level: 'must' | 'should';
}

export function buildChecklist(i: ReadinessInput): { items: ReadinessItem[]; done: number; total: number; percent: number; mustLeft: number } {
  const items: ReadinessItem[] = [
    { id: 'contact', level: 'must', done: i.contactConfirmed, title: 'ช่องทางติดต่อจริง', detail: i.contactConfirmed ? 'ยืนยันแล้ว' : 'ตอนนี้เป็นข้อมูลตัวอย่าง (เว็บขึ้นแถบเหลืองเตือนลูกค้า) — ใส่ LINE / เบอร์ / Facebook / แผนที่จริง', href: '/admin/settings', cta: 'ตั้งค่าช่องทางติดต่อ' },
    { id: 'prices', level: 'must', done: i.unconfirmedPrices === 0, count: i.unconfirmedPrices, title: 'ราคาสินค้า (รังเปล่า / น้ำผึ้ง)', detail: i.unconfirmedPrices === 0 ? 'ยืนยันครบแล้ว' : `${i.unconfirmedPrices} ตัวเลือกยังเป็นราคาตัวอย่าง — กดบันทึกราคาจริงที่แต่ละตัวเลือก`, href: '/admin/products', cta: 'ไปแก้ราคา' },
    { id: 'courses', level: 'should', done: i.unconfirmedCourses === 0, count: i.unconfirmedCourses, title: 'ราคาและระยะเวลาอบรม', detail: i.unconfirmedCourses === 0 ? 'ยืนยันครบแล้ว' : `${i.unconfirmedCourses} หลักสูตรยังเป็นค่าตัวอย่าง`, href: '/admin/settings#courses', cta: 'ไปแก้หลักสูตร' },
    { id: 'productImages', level: 'should', done: i.productsWithoutImage === 0, count: i.productsWithoutImage, title: 'รูปสินค้า (รังเปล่า / น้ำผึ้ง)', detail: i.productsWithoutImage === 0 ? 'มีรูปจริงครบแล้ว' : `${i.productsWithoutImage} สินค้ายังใช้รูปชั่วคราว`, href: '/admin/products', cta: 'อัปโหลดรูปสินค้า' },
    { id: 'hivePhotos', level: 'should', done: i.activeHivesWithoutPhoto === 0, count: i.activeHivesWithoutPhoto, title: 'รูปสมุดพกของรังที่ยังอยู่', detail: i.activeHivesWithoutPhoto === 0 ? 'ทุกรังมีรูปแล้ว' : `${i.activeHivesWithoutPhoto} รังยังไม่มีรูป (เว็บแสดงรูปชั่วคราว) — เดินถ่ายรูปทีละรังได้เลย`, href: '/admin/photos', cta: 'ไปถ่ายรูป' },
    { id: 'incomplete', level: 'should', done: i.incompleteHives === 0, count: i.incompleteHives, title: 'ข้อมูลรังที่ยังไม่ครบ (???)', detail: i.incompleteHives === 0 ? 'ไม่มีข้อมูลค้าง' : `${i.incompleteHives} รังมีข้อมูลที่ยังไม่ทราบ — เติมได้ หรือกด "ไม่ทราบจริง ๆ" เพื่อเลิกเตือน`, href: '/admin/todo', cta: 'ไปเติมข้อมูล' },
    { id: 'hero', level: 'should', done: !!i.heroChosen, title: 'รูปหัวหน้าแรก', detail: i.heroChosen ? 'เลือกแล้ว' : 'ตอนนี้แสดงโลโก้ — เลือกรังที่รูปสมุดพกสวยที่สุดมาเป็นรูปแรกที่ลูกค้าเห็น', href: '/admin/settings#hero', cta: 'เลือกรูปหน้าแรก' },
    { id: 'saleReady', level: 'should', done: i.saleHivesNotReady === 0, count: i.saleHivesNotReady, title: 'รังที่ตั้งขายมีรูปขาย 3 รูป + วิดีโอ', detail: i.saleHivesNotReady === 0 ? 'พร้อมแล้ว (หรือยังไม่มีรังตั้งขาย)' : `${i.saleHivesNotReady} รังที่ตั้งขายอยู่ยังไม่ครบ`, href: '/admin/hives?forSale=1', cta: 'ดูรังที่ตั้งขาย' },
  ];
  const done = items.filter((x) => x.done).length;
  return { items, done, total: items.length, percent: Math.round((done / items.length) * 100), mustLeft: items.filter((x) => x.level === 'must' && !x.done).length };
}
