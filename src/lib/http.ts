/** เทียบ If-None-Match กับ ETag: ไม่สนเครื่องหมายคำพูดและ W/ (dev server บางตัวตัดเครื่องหมายคำพูดทิ้ง), รับหลายค่าและ "*" */
export function etagMatches(ifNoneMatch: string | null | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const bare = (s: string) => s.trim().replace(/^W\//i, '').replace(/^"|"$/g, '');
  const want = bare(etag);
  return ifNoneMatch.split(',').some((v) => v.trim() === '*' || bare(v) === want);
}
