import type { APIRoute } from 'astro';
import { listTraining } from '../lib/content.ts';
import { buildSitemap } from '../lib/sitemap.ts';
import { getDb } from '../server/db.ts';
import { getSitemapData } from '../server/public.ts';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const d = await getSitemapData(getDb());
  const paths = [
    '/', '/stingless-bee', '/honey', '/learn/research', '/products', '/products/hives', '/training', '/passport', '/contact', '/privacy',
    ...d.productSlugs.map((s) => `/products/${s}`),
    ...d.saleCodes.map((c) => `/products/hives/${c}`),
    ...d.hiveCodes.map((c) => `/passport/${c}`),
    ...listTraining().map((t) => `/training/${t.slug}`),
  ];
  return new Response(buildSitemap(url.origin, paths), { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
