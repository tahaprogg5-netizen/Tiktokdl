import { isAllowedMediaUrl } from "../_lib/media-hosts.js";

const TIKTOK_API = "https://tdownv4.sl-bjs.workers.dev/";

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

function extractDownloadUrl(payload) {
  const candidates = [
    payload?.download_url,
    payload?.data?.download_url,
    payload?.video?.download_url,
    payload?.video?.url,
    payload?.data?.video?.download_url
  ];
  return candidates.find(value => typeof value === "string" && value.trim())?.trim() || "";
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
    const apiUrl = new URL(TIKTOK_API);
    apiUrl.searchParams.set("down", tiktokUrl);

    const upstream = await fetch(apiUrl.toString(), {
      method: "GET",
      headers: {
        "accept": "application/json",
        "user-agent": "TikTokDL/1.0"
      },
      signal: AbortSignal.timeout(30000)
    });

    if (!upstream.ok) {
      throw new Error("upstream_http_" + upstream.status);
    }

    const payload = await upstream.json();
    const mediaUrl = extractDownloadUrl(payload);

    if (payload?.error || !mediaUrl || !isAllowedMediaUrl(mediaUrl)) {
      await recordDownload(env, false);
      return json({
        error: "برای این ویدیو لینک دریافت معتبری پیدا نشد. عمومی‌بودن ویدیو و اجازه دریافت آن را بررسی کن."
      }, 502);
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

    const author = payload?.author || payload?.data?.author || {};
    await recordDownload(env, true);
    return json({
      ok: true,
      type: "video",
      description: payload?.title || payload?.data?.title || "",
      author: author?.username || author?.nickname || payload?.username || "",
      code: videoCode,
      filename: "TikTokDL-" + videoCode + ".mp4",
      links: [mediaUrl]
    });
  } catch (error) {
    console.error("TikTok API error:", error?.message || String(error));
    await recordDownload(env, false);
    return json({
      error: "استخراج ویدیو ناموفق بود. ممکن است سرویس موقتاً پاسخ ندهد یا ویدیو برای دریافت عمومی در دسترس نباشد."
    }, 502);
  }
}
