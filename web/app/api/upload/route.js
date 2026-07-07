// POST /api/upload — hands the browser a presigned R2 PUT URL so it can upload the bid-set PDF
// directly to R2, bypassing Vercel's ~4.5MB function-body cap (real bid sets run ~44MB). The
// bytes never transit this function; it only signs. The browser then PUTs to the returned url
// with Content-Type application/pdf (the same header the signature covers) and afterwards starts
// a run with pdfSource "r2:<key>".
import { createPresignedUploadUrl } from '../../../../src/lib/r2.js';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const { filename } = await request.json().catch(() => ({}));
    const safe = String(filename || 'upload.pdf').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
    const key = `uploads/${Date.now()}-${safe}`;
    const url = await createPresignedUploadUrl(key, { contentType: 'application/pdf' });
    return Response.json({ url, key, pdfSource: `r2:${key}` });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
