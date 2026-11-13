const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}
export async function onRequestGet({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ error: "رمز مدیر تنظیم نشده است." }, 503);
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const [payload, signature] = (token || "").split(".");
  if (!payload || !signature || signature !== await sign(payload, env.ADMIN_PASSWORD)) return json({ error: "دسترسی مدیر لازم است." }, 401);
  let claims;
  try { claims = JSON.parse(atob(payload.replace(/-/g,"+").replace(/_/g,"/"))); } catch { return json({ error: "نشست نامعتبر است." }, 401); }
  if (!claims.exp || claims.exp < Date.now()) return json({ error: "نشست منقضی شده است." }, 401);
  try {
    const [total, today, success, recent] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS count FROM downloads").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM downloads WHERE date(created_at)=date('now')").first(),
      env.DB.prepare("SELECT COUNT(*) AS count FROM downloads WHERE success=1").first(),
      env.DB.prepare("SELECT id, created_at, media_type, success FROM downloads ORDER BY id DESC LIMIT 20").all()
    ]);
    return json({ total: total?.count || 0, today: today?.count || 0, success: success?.count || 0, recent: recent?.results || [] });
  } catch { return json({ error: "خواندن آمار با خطا روبه‌رو شد." }, 500); }
}