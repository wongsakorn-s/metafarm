/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** ผู้ใช้ที่ล็อกอิน (ตั้งโดย middleware เฉพาะเส้นทางที่ต้องล็อกอิน) */
    user?: import('./server/auth.ts').SessionUser;
    /** การตั้งค่าเว็บ (ช่องทางติดต่อ, หลักสูตร) — middleware โหลดให้ทุกหน้า HTML ที่ไม่ใช่หลังบ้าน */
    settings?: import('./lib/settings.ts').SiteSettings;
  }
}
