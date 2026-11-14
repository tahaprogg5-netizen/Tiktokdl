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
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "درخواست نامعتبر است." }, 400); }

  if (body?.consent !== true) {
    return json({ error: "برای ادامه باید اجازه دانلود این محتوا را داشته باشی." }, 403);
  }
  if (!validYoutubeUrl(body?.url)) {
    return json({ error: "لینک معتبر YouTube وارد کن." }, 400);
  }

  const base = env.YOUTUBE_API_URL;
  if (!base) {
    return json({ error: "سرویس YouTube هنوز تنظیم نشده است؛ آدرس سرور Flask را در متغیر YOUTUBE_API_URL قرار بده." }, 503);
  }

  const action = body.action;
  const paths = {
    info: "/video_info",
    resolutions: "/available_resolutions"
  };
  let endpoint;
  if (action === "info" || action === "resolutions") {
    endpoint = paths[action];
  } else if (action === "download") {
    const resolution = typeof body.resolution === "string" ? body.resolution : "";
    if (!/^\d{3,4}p$/.test(resolution)) {
      return json({ error: "کیفیت انتخاب‌شده معتبر نیست." }, 400);
    }
    endpoint = "/download/" + encodeURIComponent(resolution);
  } else {
    return json({ error: "عملیات ناشناخته است." }, 400);
  }

  try {
    const origin = new URL(base);
    if (origin.protocol !== "https:") return json({ error: "آدرس API باید HTTPS باشد." }, 500);
    const target = new URL(endpoint, origin);
    const upstream = await fetch(target.toString(), {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json" },
      body: JSON.stringify({ url: body.url }),
      signal: AbortSignal.timeout(45000)
    });
    const raw = await upstream.text();
    let data;
    try { data = JSON.parse(raw); }
    catch { return json({ error: "پاسخ سرویس YouTube معتبر نیست." }, 502); }
    if (!upstream.ok) {
      return json({ error: data.error || "سرویس YouTube درخواست را نپذیرفت." }, 502);
    }
    if (action === "download") {
      return json({
        ok: true,
        message: data.message || "درخواست پردازش شد. طبق API فعلی، فایل در پوشه downloads سرور API ذخیره می‌شود و لینک مستقیم فایل ارائه نمی‌شود."
      });
    }
    return json(data);
  } catch (error) {
    console.error("DL Hub YouTube API error:", error?.message || String(error));
    return json({ error: "ارتباط با سرور YouTube برقرار نشد." }, 502);
  }
}
