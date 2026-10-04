// วัดคะแนน Lighthouse (มือถือ) ของหน้าสาธารณะหลัก
//   npm run build && npx astro preview --port 4500     (วัดกับตัว build จริง ไม่ใช่ dev server ที่ไม่ย่อไฟล์)
//   npm run check:lighthouse                            ต้องมี Chrome ติดตั้ง ใช้ npx lighthouse ไม่เพิ่มแพ็กเกจในโปรเจกต์
// เกณฑ์ตาม docs/00-roadmap.md: Performance ≥ 90 บนมือถือ
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4500';
const OUT = 'private/lighthouse';
mkdirSync(OUT, { recursive: true });
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!chrome) throw new Error('ไม่พบ Chrome/Edge — ตั้ง CHROME_PATH');

const PAGES = (process.env.PAGES ?? '/,/passport/A25,/passport,/products,/stingless-bee,/contact').split(',');
const MIN = { performance: 0.9, accessibility: 0.9, 'best-practices': 0.9, seo: 0.9 };
let failed = 0;

for (const path of PAGES) {
  const file = `${OUT}/${path.replace(/\W+/g, '_') || 'home'}.json`;
  execFileSync('npx', ['--yes', 'lighthouse@12', BASE + path, '--output=json', `--output-path=${file}`, '--quiet', '--chrome-flags=--headless=new --no-sandbox', '--only-categories=performance,accessibility,best-practices,seo'], {
    env: { ...process.env, CHROME_PATH: chrome }, stdio: ['ignore', 'ignore', 'inherit'], shell: process.platform === 'win32',
  });
  const r = JSON.parse(readFileSync(file, 'utf8'));
  const sc = Object.fromEntries(Object.entries(r.categories).map(([k, v]) => [k, v.score]));
  const a = r.audits;
  const bad = Object.entries(MIN).filter(([k, m]) => (sc[k] ?? 0) < m).map(([k]) => k);
  if (bad.length) failed++;
  console.log(`${bad.length ? 'FAIL' : 'PASS'} ${path.padEnd(18)} perf ${Math.round(sc.performance * 100)} · a11y ${Math.round(sc.accessibility * 100)} · best ${Math.round(sc['best-practices'] * 100)} · seo ${Math.round(sc.seo * 100)}  | LCP ${(a['largest-contentful-paint'].numericValue / 1000).toFixed(1)}s · CLS ${a['cumulative-layout-shift'].numericValue.toFixed(3)} · TBT ${Math.round(a['total-blocking-time'].numericValue)}ms`);
  for (const [id, au] of Object.entries(a)) if (au.score !== null && au.score < 0.9 && au.scoreDisplayMode !== 'notApplicable' && !['largest-contentful-paint', 'first-contentful-paint', 'speed-index', 'interactive', 'max-potential-fid'].includes(id) && !au.id?.startsWith('metric')) if (au.details?.type !== 'debugdata' && au.weight !== 0 || au.scoreDisplayMode === 'binary') console.log(`      · ${id}: ${au.title}`);
}
process.exit(failed ? 1 : 0);
