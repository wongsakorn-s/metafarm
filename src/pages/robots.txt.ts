import type { APIRoute } from 'astro';
import { buildRobots } from '../lib/sitemap.ts';
import { getDb } from '../server/db.ts';
import { getSettings } from '../server/settings.ts';

export const prerender = false;

export const GET: APIRoute = async ({ url }) => {
  const { contact } = await getSettings(getDb());
  return new Response(buildRobots(url.origin, !contact.confirmed), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};
