const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function validYoutubeUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(host)
      && ["http:", "https:"].includes(url.protocol)
      && !url.username && !url.password;
  } catch { return false; }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "درخواست نامعتبر است." }, 400); }

  if (body?.consent !== true) return json({ error: "برای ادامه باید اجازه دانلود این محتوا را داشته باشی." }, 403);
  if (!validYoutubeUrl(body?.url)) return json({ error: "لینک معتبر YouTube وارد کن." }, 400);

  const base = env.YOUTUBE_API_URL;
  if (!base) return json({ error: "سرویس YouTube هنوز تنظیم نشده است." }, 503);

  const paths = { info: "/video_info", resolutions: "/available_resolutions" };
  let endpoint;
  if (body.action === "info" || body.action === "resolutions") endpoint = paths[body.action];
  else if (body.action === "download") {
    const quality = typeof body.resolution === "string" ? body.resolution : "";
    if (!/^\d{3,4}p$/.test(quality)) return json({ error: "کیفیت انتخاب‌شده معتبر نیست." }, 400);
    endpoint = "/download/" + encodeURIComponent(quality);
  } else return json({ error: "عملیات ناشناخته است." }, 400);

  try {
    const origin = new URL(base);
    if (origin.protocol !== "https:") return json({ error: "آدرس API باید HTTPS باشد." }, 500);
    const target = new URL(endpoint, origin);
    const upstream = await fetch(target.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "accept": body.action === "download" ? "video/mp4, application/json" : "application/json" },
      body: JSON.stringify({ url: body.url }),
      signal: AbortSignal.timeout(240000)
    });

    if (body.action === "download") {
      if (!upstream.ok) {
        const raw = await upstream.text();
        let data = {};
        try { data = JSON.parse(raw); } catch {}
        return json({ error: data.error || "دانلود از سرویس انجام نشد." }, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502);
      }
      const headers = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
      headers.set("content-type", upstream.headers.get("content-type") || "video/mp4");
      const disposition = upstream.headers.get("content-disposition");
      if (disposition) headers.set("content-disposition", disposition);
      const length = upstream.headers.get("content-length");
      if (length) headers.set("content-length", length);
      return new Response(upstream.body, { status: 200, headers });
    }

    const raw = await upstream.text();
    let data;
    try { data = JSON.parse(raw); }
    catch { return json({ error: "پاسخ سرویس YouTube معتبر نیست." }, 502); }
    if (!upstream.ok) return json({ error: data.error || "سرویس YouTube درخواست را نپذیرفت." }, 502);
    return json(data);
  } catch (error) {
    console.error("DL Hub YouTube API error:", error?.message || String(error));
    return json({ error: "ارتباط با سرور YouTube برقرار نشد." }, 502);
  }
}
