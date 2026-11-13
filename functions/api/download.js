import TikTok from "tiktokapi-src";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});

function validTikTokUrl(value) {
  try {
    const u = new URL(value);
    return ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(u.hostname.toLowerCase())
      && u.protocol === "https:";
  } catch { return false; }
}

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: "درخواست نامعتبر است." }, 400); }
  if (body?.authorized !== true) return json({ error: "ابتدا تأیید کن که مالک محتوا هستی یا اجازه دانلود داری." }, 400);
  if (typeof body.url !== "string" || body.url.length > 500 || !validTikTokUrl(body.url)) {
    return json({ error: "لینک معتبر TikTok وارد کن." }, 400);
  }

  try {
    const response = await TikTok.Downloader(body.url, { version: "v1" });
    if (response?.status !== "success" || !response.result) {
      await env.DB?.prepare("INSERT INTO downloads(media_type, success) VALUES('unknown', 0)").run();
      return json({ error: response?.message || "دریافت اطلاعات ویدیو ناموفق بود. کمی بعد دوباره امتحان کن." }, 502);
    }

    const item = response.result;
    const candidates = item.type === "image"
      ? (item.images || []).filter(x => typeof x === "string" && x.startsWith("https://"))
      : (item.video?.downloadAddr || item.video?.playAddr || []).filter(x => typeof x === "string" && x.startsWith("https://"));

    if (!candidates.length) {
      await env.DB?.prepare("INSERT INTO downloads(media_type, success) VALUES(?, 0)").bind(item.type || "unknown").run();
      return json({ error: "لینک رسانه از سرویس دریافت نشد." }, 502);
    }

    await env.DB?.prepare("INSERT INTO downloads(media_type, success) VALUES(?, 1)").bind(item.type || "video").run();
    return json({
      ok: true,
      type: item.type || "video",
      description: item.description || "",
      author: item.author?.nickname || item.author?.username || "",
      cover: item.video?.cover?.[0] || "",
      links: candidates.slice(0, 12)
    });
  } catch (error) {
    await env.DB?.prepare("INSERT INTO downloads(media_type, success) VALUES('unknown', 0)").run().catch(() => {});
    return json({ error: "سرویس موقتاً پاسخ نمی‌دهد. دوباره تلاش کن." }, 502);
  }
}