import { isAllowedMediaUrl } from "../_lib/media-hosts.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function normalizeTikTokUrl(value) {
  if (typeof value !== "string") return null;
  let input = value.trim();
  if (!input || input.length > 4096) return null;
  if (!/^https?:\/\//i.test(input)) input = "https://" + input;

  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (!["https:", "http:"].includes(url.protocol)) return null;
    if (!(host === "tiktok.com" || host.endsWith(".tiktok.com"))) return null;
    if (url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function mediaUrl(item) {
  if (typeof item === "string") return item.trim();
  if (!item || typeof item !== "object") return "";

  for (const candidate of [
    item.url,
    item.play_addr,
    item.playAddr,
    item.downloadAddr,
    item.url_list?.[0],
    item.urlList?.[0],
    item.play_addr?.url_list?.[0],
    item.playAddr?.urlList?.[0]
  ]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
}

function videoItems(data) {
  const candidates = [
    data?.video,
    data?.data?.video,
    data?.result?.video,
    data?.data?.result?.video,
    data?.data?.links?.video
  ];
  return candidates.flatMap(value => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    if (typeof value === "string") return [value];
    return [];
  });
}

async function recordDownload(env, success) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO downloads(media_type, success) VALUES('video', ?)"
    ).bind(success ? 1 : 0).run();
  } catch (error) {
    console.error("TikTokDL stats write failed:", error?.message || String(error));
  }
}

function apiErrorMessage(status) {
  if (status === 429) return "سرویس استخراج موقتاً درخواست‌های زیادی دریافت کرده است. کمی بعد دوباره تلاش کن.";
  if (status === 404) return "مسیر API استخراج در دسترس نیست؛ تنظیمات سرویس باید بررسی شود.";
  if (status >= 500) return "سرویس استخراج فعلاً پاسخ‌گو نیست. کمی بعد دوباره تلاش کن.";
  return "سرویس استخراج نتوانست این لینک را پردازش کند. عمومی‌بودن ویدیو را بررسی کن.";
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "درخواست نامعتبر است." }, 400);
  }

  const tiktokUrl = normalizeTikTokUrl(body?.url);
  if (!tiktokUrl) {
    return json({ error: "لینک معتبر TikTok وارد کن." }, 400);
  }

  try {
    const base = new URL(env.TIKTOK_API_BASE || "https://backend1.tioo.eu.org");
    if (base.protocol !== "https:" || base.username || base.password) {
      return json({ error: "تنظیمات سرویس استخراج معتبر نیست." }, 503);
    }
    base.pathname = base.pathname.replace(/\/+$/, "") + "/ttdl";
    base.search = "";
    base.hash = "";
    base.searchParams.set("url", tiktokUrl);

    const response = await fetch(base.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "TikTokDL-Cloudflare/1.0"
      },
      signal: AbortSignal.timeout(25000)
    });

    const raw = await response.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error("upstream_invalid_json");
    }

    if (!response.ok) {
      await recordDownload(env, false);
      return json({ error: apiErrorMessage(response.status) }, response.status === 429 ? 503 : 502);
    }

    if (data?.status === false || data?.status === "error" || data?.success === false || data?.error) {
      await recordDownload(env, false);
      return json({ error: "سرویس استخراج نتوانست این ویدیو را دریافت کند. ممکن است ویدیو خصوصی یا حذف شده باشد." }, 502);
    }

    const links = [...new Set(
      videoItems(data)
        .map(mediaUrl)
        .filter(url => url && isAllowedMediaUrl(url))
    )].slice(0, 10);

    if (!links.length) {
      await recordDownload(env, false);
      return json({ error: "سرویس استخراج لینک ویدیویی معتبری برنگرداند. لینک عمومی دیگری را امتحان کن." }, 502);
    }

    let videoCode = Date.now();
    if (env.DB) {
      await env.DB.prepare(
        "INSERT OR IGNORE INTO download_sequence(id, value) VALUES(1, 0)"
      ).run();
      const sequence = await env.DB.prepare(
        "UPDATE download_sequence SET value = value + 1 WHERE id = 1 RETURNING value"
      ).first();
      const next = Number(sequence?.value);
      if (!Number.isSafeInteger(next) || next < 1) {
        throw new Error("download_sequence_unavailable");
      }
      videoCode = next;
    }

    await recordDownload(env, true);
    return json({
      ok: true,
      type: "video",
      description: data.title || data.data?.title || data.result?.title || data.title_audio || "",
      author: data.creator || data.author?.username || data.author?.nickname || data.author || "",
      code: videoCode,
      filename: "TikTokDL-" + videoCode + ".mp4",
      links
    });
  } catch (error) {
    console.error("TikTok API proxy error:", error?.message || String(error));
    await recordDownload(env, false);
    return json({
      error: "ارتباط با سرویس استخراج برقرار نشد یا پاسخ آن معتبر نبود. کمی بعد دوباره امتحان کن."
    }, 502);
  }
}
