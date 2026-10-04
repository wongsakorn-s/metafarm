import type { APIRoute } from 'astro';
import { buildRobots } from '../lib/sitemap.ts';

export const prerender = false;

export const GET: APIRoute = ({ url }) =>
  new Response(buildRobots(url.origin), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
