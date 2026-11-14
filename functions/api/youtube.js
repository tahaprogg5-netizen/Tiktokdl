const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function normalizeYoutubeUrl(value) {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    const host = url.hostname.toLowerCase();
    if (!["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(host)
      || !["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    let videoId = "";
    if (host.includes("youtu.be")) videoId = url.pathname.split("/").filter(Boolean)[0] || "";
    else if (url.pathname === "/watch") videoId = url.searchParams.get("v") || "";
    else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "embed", "live"].includes(parts[0])) videoId = parts[1] || "";
    }
    if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;
    return "https://www.youtube.com/watch?v=" + videoId;
  } catch { return null; }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "درخواست نامعتبر است." }, 400); }

  if (body?.consent !== true) return json({ error: "برای ادامه باید اجازه دانلود این محتوا را داشته باشی." }, 403);
  const youtubeUrl = normalizeYoutubeUrl(body?.url);\n  if (!youtubeUrl) return json({ error: "لینک معتبر ویدیوی YouTube وارد کن." }, 400);

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
      body: JSON.stringify({ url: youtubeUrl }),
      signal: AbortSignal.timeout(240000)
    });

    if (body.action === "download") {
      if (!upstream.ok) {
        const raw = await upstream.text();
        let data = {};
        try { data = JSON.parse(raw); } catch {}
        return json({ error: data.error || "دانلود از سرویس انجام نشد." }, upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502);
      }
      const contentType = (upstream.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json") || contentType.includes("text/")) {
        const raw = await upstream.text();
        let data = {};
        try { data = JSON.parse(raw); } catch {}
        console.error("YouTube backend returned a non-file success response:", raw.slice(0, 1200));
        return json({
          error: data.error || "سرور YouTube فایل ویدیو برنگرداند؛ نسخه فعلی بک‌اند فقط پیام موفقیت می‌دهد و باید اصلاح شود.",
          diagnostic: "backend_did_not_return_video"
        }, 502);
      }
      const headers = new Headers({ "cache-control": "no-store", "x-content-type-options": "nosniff" });
      headers.set("content-type", contentType || "video/mp4");
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
