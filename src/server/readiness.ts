import { sql } from 'drizzle-orm';
import { buildChecklist } from '../lib/readiness.ts';
import { effectiveCourse, type SiteSettings } from '../lib/settings.ts';
import { listTraining } from '../lib/content.ts';
import type { Db } from './db.ts';

/** นับสิ่งที่ยังค้างจากฐานข้อมูล แล้วสร้างรายการความพร้อมก่อนเปิดเว็บ */
export async function getReadiness(db: Db, settings: SiteSettings) {
  const one = async (q: ReturnType<typeof sql>) => {
    const r = await db.all<{ n: number }>(q);
    return r[0]?.n ?? 0;
  };
  const [unconfirmedPrices, productsWithoutImage, activeHivesWithoutPhoto, incompleteHives, saleHivesNotReady] = await Promise.all([
    one(sql`select count(*) n from product_variants v join products p on p.id = v.product_id where p.published = 1 and v.hidden = 0 and v.price_confirmed = 0`),
    one(sql`select count(*) n from products where published = 1 and image_key is null`),
    one(sql`select count(*) n from hives h where h.status = 'active' and not exists (select 1 from hive_media m where m.hive_id = h.id and m.kind = 'passport' and m.r2_key is not null)`),
    one(sql`select count(*) n from hives where notes like '%???%'`),
    one(sql`select count(*) n from hives h where h.for_sale = 1 and h.status = 'active' and ((select count(*) from hive_media m where m.hive_id = h.id and m.kind = 'sale' and m.r2_key is not null) < 3 or not exists (select 1 from hive_media m where m.hive_id = h.id and m.kind = 'video'))`),
  ]);
  const unconfirmedCourses = listTraining().filter((c) => effectiveCourse(c, settings.courses[c.slug]).priceIsSample).length;
  return buildChecklist({ contactConfirmed: settings.contact.confirmed, heroChosen: settings.heroHive !== '', unconfirmedPrices, unconfirmedCourses, productsWithoutImage, activeHivesWithoutPhoto, incompleteHives, saleHivesNotReady });
}
