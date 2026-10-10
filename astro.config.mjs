// @ts-check
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // imageService 'passthrough': เราไม่ใช้ astro:assets (รูปย่อก่อนอัปโหลดอยู่แล้ว) จึงไม่ต้องมี Cloudflare Images binding
  adapter: cloudflare({ imageService: 'passthrough' }),
  // session false: เราเก็บ session ล็อกอินเองใน D1 (src/server/auth.ts) ไม่ใช้ Astro sessions จึงไม่ต้องสร้าง KV namespace
  session: false,
  // ฝัง CSS ลงในหน้าเลย (ทั้งไซต์ CSS เล็ก) ไม่ต้องรอโหลดไฟล์ CSS แยก ซึ่งเป็นตัวบล็อกการแสดงผล
  build: { inlineStylesheets: 'always' },

  vite: {
    plugins: [tailwindcss()]
  }
});
