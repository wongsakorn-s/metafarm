import { sql } from 'drizzle-orm';
import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// วันที่เก็บเป็น ISO 'YYYY-MM-DD' (text), เวลาเก็บเป็น ISO datetime UTC (text)
const timestamps = {
  createdAt: text('created_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
};

export const HIVE_ORIGINS = ['purchased', 'queen_bred', 'split', 'natural', 'unknown'] as const;
export const HIVE_STATUSES = ['active', 'sold', 'collapsed', 'unknown'] as const;
export const BOX_TYPES = ['teak_2room', 'log', 'other', 'unknown'] as const;
export const DATE_PRECISIONS = ['day', 'month', 'year'] as const;
export const EVENT_TYPES = [
  'honey_harvest',
  'queen_cell_taken',
  'brood_split',
  'note',
  'status_change',
] as const;
export const MEDIA_KINDS = ['passport', 'sale', 'video'] as const;
export const USER_ROLES = ['owner', 'staff'] as const;

export const species = sqliteTable('species', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  nameTh: text('name_th').notNull(),
  nameSci: text('name_sci'),
  ...timestamps,
});

/** 🔒 คู่ค้า — หลังบ้านเท่านั้น */
export const suppliers = sqliteTable('suppliers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone'),
  area: text('area'),
  notes: text('notes'),
  ...timestamps,
});

/** 🔒 ลูกค้า — หลังบ้านเท่านั้น */
export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  phone: text('phone'),
  lineName: text('line_name'),
  address: text('address'),
  notes: text('notes'),
  ...timestamps,
});

export const hives = sqliteTable(
  'hives',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    code: text('code').notNull(),
    speciesId: integer('species_id')
      .notNull()
      .references(() => species.id),
    origin: text('origin', { enum: HIVE_ORIGINS }).notNull().default('unknown'),
    originPlace: text('origin_place'),
    acquiredOn: text('acquired_on'),
    acquiredOnPrecision: text('acquired_on_precision', { enum: DATE_PRECISIONS }),
    queenBornOn: text('queen_born_on'),
    queenSourceHiveId: integer('queen_source_hive_id').references(
      (): AnySQLiteColumn => hives.id,
    ),
    broodSourceHiveId: integer('brood_source_hive_id').references(
      (): AnySQLiteColumn => hives.id,
    ),
    boxType: text('box_type', { enum: BOX_TYPES }).notNull().default('unknown'),
    status: text('status', { enum: HIVE_STATUSES }).notNull().default('active'),
    statusChangedOn: text('status_changed_on'),
    collapseReason: text('collapse_reason'),
    publicNote: text('public_note'),
    // 🔒 ฟิลด์หลังบ้าน
    purchasePrice: integer('purchase_price'),
    supplierId: integer('supplier_id').references(() => suppliers.id),
    forSale: integer('for_sale', { mode: 'boolean' }).notNull().default(false),
    salePrice: integer('sale_price'),
    soldPrice: integer('sold_price'),
    soldOn: text('sold_on'),
    customerId: integer('customer_id').references(() => customers.id),
    notes: text('notes'),
    /** คีย์กันสร้างรังซ้ำจากฟอร์ม "เพิ่มรัง" (กดสองครั้ง/ส่งซ้ำตอนเน็ตช้า) — ว่างได้ */
    createKey: text('create_key'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('hives_code_uq').on(t.code),
    uniqueIndex('hives_create_key_uq').on(t.createKey),
    index('hives_status_idx').on(t.status),
    index('hives_for_sale_idx').on(t.forSale),
    // หารังลูก (สมุดพก/หน้ารัง): WHERE queen_source_hive_id = ? OR brood_source_hive_id = ?
    index('hives_queen_src_idx').on(t.queenSourceHiveId),
    index('hives_brood_src_idx').on(t.broodSourceHiveId),
  ],
);

export const hiveEvents = sqliteTable(
  'hive_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    hiveId: integer('hive_id')
      .notNull()
      .references(() => hives.id),
    type: text('type', { enum: EVENT_TYPES }).notNull(),
    occurredOn: text('occurred_on').notNull(),
    occurredOnPrecision: text('occurred_on_precision', { enum: DATE_PRECISIONS })
      .notNull()
      .default('day'),
    honeyMl: integer('honey_ml'),
    propolisG: integer('propolis_g'),
    pollenG: integer('pollen_g'),
    queenCells: integer('queen_cells'),
    targetHiveId: integer('target_hive_id').references(() => hives.id),
    fromStatus: text('from_status', { enum: HIVE_STATUSES }),
    toStatus: text('to_status', { enum: HIVE_STATUSES }),
    note: text('note'),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(true),
    createdBy: integer('created_by').references(() => users.id),
    /** กันบันทึกซ้ำเมื่อกดซ้ำ/เน็ตหลุด และใช้กับ import ที่รันซ้ำได้ */
    idempotencyKey: text('idempotency_key'),
    ...timestamps,
  },
  (t) => [
    index('hive_events_hive_idx').on(t.hiveId, t.occurredOn),
    // หน้าภาพรวม: กิจกรรมล่าสุด (เรียงตามวันที่) และยอดน้ำผึ้งปีนี้ (type + วันที่)
    index('hive_events_occurred_idx').on(t.occurredOn, t.id),
    index('hive_events_type_occurred_idx').on(t.type, t.occurredOn),
    index('hive_events_target_idx').on(t.targetHiveId),
    uniqueIndex('hive_events_idem_uq').on(t.idempotencyKey),
    check(
      'hive_events_amounts_nonneg',
      sql`coalesce(${t.honeyMl},0) >= 0 and coalesce(${t.propolisG},0) >= 0 and coalesce(${t.pollenG},0) >= 0 and coalesce(${t.queenCells},0) >= 0`,
    ),
  ],
);

export const hiveMedia = sqliteTable(
  'hive_media',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    hiveId: integer('hive_id')
      .notNull()
      .references(() => hives.id),
    kind: text('kind', { enum: MEDIA_KINDS }).notNull(),
    r2Key: text('r2_key'),
    youtubeId: text('youtube_id'),
    width: integer('width'),
    height: integer('height'),
    alt: text('alt'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('hive_media_hive_idx').on(t.hiveId, t.kind, t.sortOrder),
    // /img/* ตรวจสิทธิ์ด้วย r2_key ทุกครั้ง และใช้กันอัปโหลดซ้ำ (ว่างได้สำหรับวิดีโอ)
    uniqueIndex('hive_media_r2_key_uq').on(t.r2Key),
  ],
);

export const products = sqliteTable(
  'products',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    category: text('category', { enum: ['hive_box', 'honey', 'other'] }).notNull(),
    description: text('description'),
    published: integer('published', { mode: 'boolean' }).notNull().default(false),
    /** รูปสินค้าใน R2 (เจ้าของฟาร์มอัปโหลดจากหลังบ้าน) — ว่าง = เว็บแสดงรูปชั่วคราว */
    imageKey: text('image_key'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('products_slug_uq').on(t.slug), index('products_image_key_idx').on(t.imageKey)],
);

export const productVariants = sqliteTable('product_variants', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  productId: integer('product_id')
    .notNull()
    .references(() => products.id),
  label: text('label').notNull(),
  sizeMl: integer('size_ml'),
  priceThb: integer('price_thb').notNull(),
  /** false = ราคาตัวอย่าง (เว็บจะแสดงป้าย "ราคาตัวอย่าง") — กลายเป็น true เมื่อเจ้าของฟาร์มบันทึกราคาในหลังบ้าน */
  priceConfirmed: integer('price_confirmed', { mode: 'boolean' }).notNull().default(false),
  stockQty: integer('stock_qty').notNull().default(0),
  harvestYearBe: integer('harvest_year_be'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role', { enum: USER_ROLES }).notNull().default('staff'),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash)],
);

/** การตั้งค่าที่เจ้าของฟาร์มแก้เองจากหลังบ้าน (ช่องทางติดต่อ, หลักสูตรอบรม) — ดู src/lib/settings.ts */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});

/** บันทึกการล็อกอินผิด เพื่อจำกัดจำนวนครั้ง (เก็บเฉพาะ hash ของ email+IP) */
export const loginAttempts = sqliteTable(
  'login_attempts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    keyHash: text('key_hash').notNull(),
    at: text('at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
  },
  (t) => [index('login_attempts_key_idx').on(t.keyHash, t.at)],
);

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: integer('entity_id'),
  diff: text('diff', { mode: 'json' }),
  at: text('at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`),
});
