// เสิร์ฟวิดีโอจาก R2 พร้อม Range (เล่นข้ามช่วง/โหลดทีละส่วนบนมือถือ — Safari/iOS ต้องมี Range ไม่งั้นไม่เล่น)

/** เฉพาะ videos/<target>/<uuid>.mp4 (กันคีย์แปลก ๆ) */
export const isVideoKey = (key: string) => /^videos\/[A-Za-z0-9_-]{1,40}\/[0-9a-f-]{36}\.mp4$/.test(key);

/** แปลง "bytes=a-b" / "bytes=a-" / "bytes=-n" เป็นช่วงที่แน่นอน · null = รูปแบบไม่ถูก/อยู่นอกไฟล์ */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n <= 0) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

export async function serveVideo(bucket: R2Bucket, key: string, request: Request): Promise<Response> {
  if (!isVideoKey(key)) return new Response('Not found', { status: 404 });
  const head = await bucket.head(key);
  if (!head) return new Response('Not found', { status: 404 });
  const base: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    // ชื่อไฟล์มี UUID เนื้อไฟล์ไม่เปลี่ยน · ไม่นานเกินไปเพราะวิดีโอที่ถูกถอดต้องหายจากเว็บ
    'Cache-Control': 'public, max-age=86400',
    ETag: head.httpEtag,
    'X-Content-Type-Options': 'nosniff',
  };
  const head_ = request.method === 'HEAD';
  const wanted = request.headers.get('range');
  if (!wanted) {
    if (head_) return new Response(null, { headers: { ...base, 'Content-Length': String(head.size) } });
    const obj = await bucket.get(key);
    return obj ? new Response(obj.body, { headers: { ...base, 'Content-Length': String(head.size) } }) : new Response('Not found', { status: 404 });
  }
  const r = parseRange(wanted, head.size);
  if (!r) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${head.size}` } });
  const headers = { ...base, 'Content-Range': `bytes ${r.start}-${r.end}/${head.size}`, 'Content-Length': String(r.end - r.start + 1) };
  if (head_) return new Response(null, { status: 206, headers });
  const obj = await bucket.get(key, { range: { offset: r.start, length: r.end - r.start + 1 } });
  return obj ? new Response(obj.body, { status: 206, headers }) : new Response('Not found', { status: 404 });
}
