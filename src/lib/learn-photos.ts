// ภาพประกอบหน้าความรู้ (ชันโรงขนเงิน / น้ำผึ้ง) — จาก Wikimedia Commons ใช้ตามสัญญาอนุญาตที่ให้ใช้เชิงพาณิชย์ได้ (CC0 / CC BY / CC BY-SA)
// ต้องแสดงชื่อผู้ถ่าย + สัญญาอนุญาต + ลิงก์ต้นทางใต้ภาพเสมอ (เงื่อนไข CC BY/BY-SA)
// เหลือรูปหลักหน้าละ 1 รูป — ชุดภาพใต้บทความตัดออกตามที่เจ้าของขอ (2026-10-10)
// ไฟล์อยู่ใน public/photos/learn/<id>-1200.webp และ -640.webp (ย่อและแปลงเป็น WebP แล้ว — ไม่ได้แก้เนื้อหาภาพ)
// ข้อมูลผู้ถ่าย/สัญญาอนุญาตตรวจจากหน้าไฟล์ของ Wikimedia Commons เมื่อ 2026-10-10 — เปลี่ยนเป็นรูปจริงของฟาร์มเมื่อมี

export interface LearnPhoto {
  id: string;
  w: number;
  h: number;
  alt: string;
  caption: string;
  author: string;
  license: 'CC0' | 'CC BY 4.0' | 'CC BY-SA 2.0' | 'CC BY-SA 4.0';
  sourceUrl: string;
}

export const LICENSE_URL: Record<LearnPhoto['license'], string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY 4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC BY-SA 2.0': 'https://creativecommons.org/licenses/by-sa/2.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
};

export const learnPhotos = {
  beePagdeni: {
    id: 'bee-pagdeni', w: 1200, h: 900,
    alt: 'ชันโรงขนเงินสองตัวกำลังเก็บเกสรในดอกบัว',
    caption: 'ชันโรงขนเงิน (Tetragonula pagdeni) เก็บเกสรในดอกบัว — ตัวเล็กกว่าผึ้งทั่วไปมาก',
    author: 'Peterwchen', license: 'CC BY-SA 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Nelumbo_nucifera-Tetragonula_pagdeni.jpg',
  },
} satisfies Record<string, LearnPhoto>;
