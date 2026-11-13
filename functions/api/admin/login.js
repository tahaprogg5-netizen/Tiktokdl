const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const enc = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function sign(value, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(value)));
}
export async function onRequestPost({ request, env }) {
  if (!env.ADMIN_PASSWORD) return json({ error: "رمز مدیر هنوز در تنظیمات Cloudflare ثبت نشده است." }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: "درخواست نامعتبر است." }, 400); }
  if (typeof body.password !== "string" || body.password.length > 256) return json({ error: "رمز اشتباه است." }, 401);
  const supplied = await sign(body.password, "tiktokdl-login-check");
  const expected = await sign(env.ADMIN_PASSWORD, "tiktokdl-login-check");
  if (supplied.length !== expected.length || !crypto.subtle.timingSafeEqual) {
    if (supplied !== expected) return json({ error: "رمز اشتباه است." }, 401);
  } else if (!crypto.subtle.timingSafeEqual(enc.encode(supplied), enc.encode(expected))) {
    return json({ error: "رمز اشتباه است." }, 401);
  }
  const payload = b64(enc.encode(JSON.stringify({ exp: Date.now() + 8 * 60 * 60 * 1000 })));
  const token = payload + "." + await sign(payload, env.ADMIN_PASSWORD);
  return json({ ok: true, token });
}