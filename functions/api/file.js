function json(data, status = 400) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function allowedMediaHost(hostname) {
  const host = hostname.toLowerCase();
  return [
    "tiktok.com",
    "tiktokcdn.com",
    "tiktokcdn-us.com",
    "tiktokv.com",
    "byteoversea.com",
    "ibytedtos.com"
  ].some(domain => host === domain || host.endsWith("." + domain));
}

export async function onRequestGet({ request }) {
  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get("url");
  const code = requestUrl.searchParams.get("code");
  if (!rawUrl || !/^\d+$/.test(code || "")) {
    return json({ error: "لینک دانلود نامعتبر است." }, 400);
  }

  let media;
  try {
    media = new URL(rawUrl);
  } catch {
    return json({ error: "آدرس ویدیو نامعتبر است." }, 400);
  }

  if (media.protocol !== "https:" || !allowedMediaHost(media.hostname)) {
    return json({ error: "میزبان ویدیو مجاز نیست." }, 403);
  }

  try {
    const upstream = await fetch(media.toString(), {
      headers: { "User-Agent": "TikTokDL/1.0", "Accept": "video/*,*/*;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(60000)
    });

    if (!upstream.ok || !upstream.body) {
      return json({ error: "دریافت فایل ویدیو ناموفق بود." }, 502);
    }

    const finalUrl = new URL(upstream.url || media.toString());
    if (finalUrl.protocol !== "https:" || !allowedMediaHost(finalUrl.hostname)) {
      return json({ error: "مسیر دریافت ویدیو مجاز نیست." }, 403);
    }

    const filename = "TikTokDL-" + Number(code) + ".mp4";
    // Do not forward upstream Content-Length: Cloudflare may transparently decompress
    // the upstream response, making the original length incorrect and corrupting downloads.
    const headers = new Headers({
      "content-type": upstream.headers.get("content-type") || "application/octet-stream",
      "content-disposition": 'attachment; filename="' + filename + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff"
    });
    return new Response(upstream.body, { status: 200, headers });
  } catch (error) {
    console.error("Video file proxy error:", error?.message || String(error));
    return json({ error: "ارتباط برای دریافت فایل برقرار نشد." }, 502);
  }
}
