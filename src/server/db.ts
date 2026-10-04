import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema.ts';

export const getDb = () => drizzle(env.DB, { schema });
export type Db = ReturnType<typeof getDb>;
export const getMedia = () => env.MEDIA;
