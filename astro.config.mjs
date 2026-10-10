// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import { satteri } from '@astrojs/markdown-satteri';

// https://astro.build/config
export default defineConfig({
  // imageService 'passthrough': เราไม่ใช้ astro:assets (รูปย่อก่อนอัปโหลดอยู่แล้ว) จึงไม่ต้องมี Cloudflare Images binding
  adapter: cloudflare({ imageService: 'passthrough' }),
  // session false: เราเก็บ session ล็อกอินเองใน D1 (src/server/auth.ts) ไม่ใช้ Astro sessions จึงไม่ต้องสร้าง KV namespace
  session: false,
  // ฝัง CSS ลงในหน้าเลย (ทั้งไซต์ CSS เล็ก) ไม่ต้องรอโหลดไฟล์ CSS แยก ซึ่งเป็นตัวบล็อกการแสดงผล
  build: { inlineStylesheets: 'always' },
  // เชิงอรรถ Markdown ([^id]) = แหล่งอ้างอิงท้ายหน้าเนื้อหา (หน้าน้ำผึ้ง) — หัวข้อภาษาไทย (ค่าเริ่มต้น "Footnotes")
  // Astro 7 ใช้ Sätteri เป็นตัวแปลง Markdown (ตัวเลือก remarkRehype เดิมใช้ไม่ได้) · ระบุเวอร์ชันตรงกับที่ astro ใช้
  markdown: {
    processor: satteri({ features: { gfm: { footnotes: { label: 'แหล่งอ้างอิง', backLabel: 'กลับไปที่ข้อความ' } } } }),
  },

  vite: {
    plugins: [tailwindcss()]
  }
});
