/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** ผู้ใช้ที่ล็อกอิน (ตั้งโดย middleware เฉพาะเส้นทางที่ต้องล็อกอิน) */
    user?: import('./server/auth.ts').SessionUser;
  }
}
