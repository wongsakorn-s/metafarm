import { defineConfig } from 'drizzle-kit';

// ใช้ drizzle-kit สร้างไฟล์ migration (SQL) เท่านั้น
// การ apply ใช้ `wrangler d1 migrations apply` เพื่อให้เหมือนกันทั้ง local และ production
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
