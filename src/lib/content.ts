// เนื้อหา Markdown ในโฟลเดอร์ /content (แก้ไขได้โดยไม่ต้องแตะโค้ด)
import type { MarkdownInstance } from 'astro';

export type Md = MarkdownInstance<Record<string, any>>;

const pages = import.meta.glob('/content/pages/*.md', { eager: true }) as Record<string, Md>;
const training = import.meta.glob('/content/training/*.md', { eager: true }) as Record<string, Md>;
const learn = import.meta.glob('/content/learn/*.md', { eager: true }) as Record<string, Md>;

const slugOf = (path: string) => path.split('/').pop()!.replace(/\.md$/, '');
const find = (group: Record<string, Md>, slug: string) => Object.entries(group).find(([p]) => slugOf(p) === slug)?.[1] ?? null;

export const getPage = (slug: string) => find(pages, slug);
export const getLearn = (slug: string) => find(learn, slug);
export const getTraining = (slug: string) => find(training, slug);

export interface TrainingCourse {
  slug: string;
  title: string;
  summary: string;
  duration: string;
  priceThb: number;
  priceIsSample: boolean;
}

/** รายการหลักสูตรอบรม เรียงตาม order */
export function listTraining(): TrainingCourse[] {
  return Object.entries(training)
    .map(([p, m]) => ({ slug: slugOf(p), order: Number(m.frontmatter.order ?? 99), title: String(m.frontmatter.title), summary: String(m.frontmatter.summary ?? ''), duration: String(m.frontmatter.duration ?? ''), priceThb: Number(m.frontmatter.priceThb ?? 0), priceIsSample: m.frontmatter.priceIsSample !== false }))
    .sort((a, b) => a.order - b.order)
    .map(({ order, ...c }) => c);
}


export { sectionsOf, type MdSection } from './md-sections.ts';
