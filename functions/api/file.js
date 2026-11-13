import { isAllowedMediaUrl } from "../_lib/media-hosts.js";

function json(data, status = 400) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export async function onRequestGet({ request }) {
  const requestUrl = new URL(request.url);
  const rawUrl = requestUrl.searchParams.get("url");
  const rawCode = requestUrl.searchParams.get("code");
  const inline = requestUrl.searchParams.get("inline") === "1";
  const code = Number(rawCode);

  if (!rawUrl || !/^\d{1,16}$/.test(rawCode || "") || !Number.isSafeInteger(code)) {
    return json({ error: "لینک دانلود نامعتبر است." }, 400);
  }

  let currentUrl;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    return json({ error: "آدرس ویدیو نامعتبر است." }, 400);
  }

  const requestHeaders = {
    "User-Agent": "TikTokDL/1.0",
    "Accept": "video/*,application/octet-stream;q=0.9,*/*;q=0.8"
  };
  const range = request.headers.get("Range");
  if (range) requestHeaders.Range = range;

  try {
    let upstream = null;

    // Validate every redirect target before requesting it. Checking only the final
    // URL after automatic redirects would allow the proxy to contact arbitrary hosts.
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!isAllowedMediaUrl(currentUrl.toString())) {
        return json({ error: "میزبان ویدیو مجاز نیست." }, 403);
      }

      upstream = await fetch(currentUrl.toString(), {
        method: "GET",
        headers: requestHeaders,
        redirect: "manual",
        signal: AbortSignal.timeout(60000)
      });

      if (![301, 302, 303, 307, 308].includes(upstream.status)) break;

      const location = upstream.headers.get("location");
      if (!location || redirects === 5) {
        return json({ error: "مسیر دریافت ویدیو معتبر نیست." }, 502);
      }
      currentUrl = new URL(location, currentUrl);
    }

    if (!upstream || (!upstream.ok && upstream.status !== 206) || !upstream.body) {
      return json({ error: "دریافت فایل ویدیو ناموفق بود." }, 502);
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    if (/^text\/html\b/i.test(contentType)) {
      return json({ error: "سرویس میزبان به‌جای فایل ویدیو صفحه خطا برگرداند." }, 502);
    }

    const filename = "TikTokDL-" + code + ".mp4";
    const headers = new Headers({
      "content-type": contentType,
      "content-disposition": (inline ? "inline" : "attachment") +
        '; filename="' + filename + '"; filename*=UTF-8\'\'' + encodeURIComponent(filename),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff"
    });

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers.set("content-range", contentRange);
    const acceptRanges = upstream.headers.get("accept-ranges");
    if (acceptRanges) headers.set("accept-ranges", acceptRanges);

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers
    });
  } catch (error) {
    console.error("Video file proxy error:", error?.message || String(error));
    return json({ error: "ارتباط برای دریافت فایل برقرار نشد." }, 502);
  }
}
