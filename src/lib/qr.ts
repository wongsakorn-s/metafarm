// QR เป็น SVG สร้างฝั่งเซิร์ฟเวอร์ (qrcode-generator, MIT, ไม่มี dependency) — ไม่ต้องโหลดสคริปต์ในเบราว์เซอร์
import qrcode from 'qrcode-generator';

/** SVG ขนาดยืดตามกล่อง (viewBox) · ระดับแก้ผิด M (สติกเกอร์บนขวดอาจเปื้อนเล็กน้อย) · ขอบเงียบ 2 โมดูล */
export function qrSvg(text: string, label = 'QR code'): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = 2;
  let path = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + m} ${r + m}h1v1h-1z`;
  const size = n + m * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="${label.replace(/"/g, '')}"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
