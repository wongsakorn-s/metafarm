// ภาพประกอบหน้าความรู้ (ชันโรงขนเงิน / น้ำผึ้ง) — จาก Wikimedia Commons ใช้ตามสัญญาอนุญาตที่ให้ใช้เชิงพาณิชย์ได้ (CC0 / CC BY / CC BY-SA)
// ต้องแสดงชื่อผู้ถ่าย + สัญญาอนุญาต + ลิงก์ต้นทางใต้ภาพเสมอ (เงื่อนไข CC BY/BY-SA) และบอกว่าเป็นภาพประกอบ ไม่ใช่ภาพจากฟาร์ม
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
  beeGuards: {
    id: 'bee-guards', w: 1200, h: 802,
    alt: 'ชันโรงงานหลายตัวเฝ้าอยู่ที่ปากทางเข้ารัง',
    caption: 'ชันโรงงานเฝ้าปากทางเข้ารัง คอยกันศัตรูไม่ให้เข้ารัง',
    author: 'Fah Lertkulvanich', license: 'CC BY-SA 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Nest_Protector.jpg',
  },
  beeEntrance: {
    id: 'bee-entrance', w: 1200, h: 1600,
    alt: 'ปากทางเข้ารังชันโรงบนลำต้นไม้',
    caption: 'ปากทางเข้ารังชันโรงในโพรงต้นไม้ — แต่ละชนิดสร้างปากทางต่างกัน',
    author: 'Ggandrea', license: 'CC BY 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:KELULUT_ENTRANCE.jpg',
  },
  beeNest: {
    id: 'bee-nest', w: 1200, h: 900,
    alt: 'โครงสร้างภายในรังชันโรง มีถ้วยเก็บอาหารและเสาค้ำสีน้ำตาล',
    caption: 'ภายในรังชันโรง: ถ้วยเก็บอาหารและโครงรังที่สร้างจากชันผสมไข',
    author: 'Marufish from Alor Setar, Malaysia', license: 'CC BY-SA 2.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Ladang_Kelulut_%E9%93%B6%E8%9C%82%E5%9B%AD_(31503489571).jpg',
  },
  honeyPots: {
    id: 'honey-pots', w: 1200, h: 800,
    alt: 'ถ้วยเก็บน้ำผึ้งและเกสรสีน้ำตาลภายในรังชันโรง',
    caption: 'ถ้วยเก็บน้ำผึ้งในรังชันโรง — เก็บในถ้วยเล็ก ๆ ไม่ใช่รวงหกเหลี่ยมแบบผึ้งทั่วไป',
    author: 'Nelynnnnn', license: 'CC0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Gombizau_Honey_Bee_Farm_(20).jpg',
  },
  honeyBox: {
    id: 'honey-box', w: 1200, h: 800,
    alt: 'กล่องรังชันโรงที่เปิดฝาออก เห็นรังด้านใน',
    caption: 'เปิดกล่องรังชันโรงเพื่อเก็บน้ำผึ้ง',
    author: 'Nelynnnnn', license: 'CC0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Gombizau_Honey_Bee_Farm_(18).jpg',
  },
  honeyHarvest: {
    id: 'honey-harvest', w: 1200, h: 1600,
    alt: 'การเก็บน้ำผึ้งชันโรงจากรังในขอนไม้ลงภาชนะ',
    caption: 'การเก็บน้ำผึ้งชันโรงจากรังในขอนไม้',
    author: 'Gaurav Dhwaj Khadka', license: 'CC BY-SA 4.0',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Meliponini_Honey.jpg',
  },
} satisfies Record<string, LearnPhoto>;
