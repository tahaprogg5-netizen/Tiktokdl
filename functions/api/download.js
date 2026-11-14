import { isAllowedMediaUrl } from "../_lib/media-hosts.js";

const TIKTOK_API = "https://backend1.tioo.eu.org/api/downloader/ttdl";

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
  const lower = input.toLowerCase();
  if (!lower.startsWith("https://") && !lower.startsWith("http://")) input = "https://" + input;
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

function extractVideoUrl(payload) {
  if (!payload || typeof payload !== "object") return "";

  // BOTCAHX/tiktokdl-api returns { audio: [...], video: [...] }.
  // It does not return a "status: true" field.
  const candidates = [
    payload.video,
    payload.data?.video,
    payload.result?.video,
    payload.data?.play,
    payload.data?.hdplay,
    payload.play,
    payload.hdplay
  ];

  for (const item of candidates) {
    const values = Array.isArray(item) ? item : [item];
    for (const value of values) {
      const candidate = typeof value === "string" ? value.trim() : "";
      if (candidate && isAllowedMediaUrl(candidate)) return candidate;
    }
  }

  return "";
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "درخواست نامعتبر است." }, 400);
  }

  const tiktokUrl = normalizeTikTokUrl(body?.url);
  if (!tiktokUrl) return json({ error: "لینک معتبر TikTok وارد کن." }, 400);

  try {
    const apiUrl = new URL(TIKTOK_API);
    apiUrl.searchParams.set("url", tiktokUrl);

    const upstream = await fetch(apiUrl.toString(), {
      headers: {
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 (compatible; TikTokDL/1.0)"
      },
      signal: AbortSignal.timeout(30000)
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      console.error("TikTok upstream HTTP:", upstream.status, raw.slice(0, 1200));
      await recordDownload(env, false);
      return json({ error: "سرویس قدیمی استخراج پاسخ HTTP ناموفق داد.", diagnostic: "upstream_http_" + upstream.status }, 502);
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      console.error("TikTok upstream non-JSON:", raw.slice(0, 1200));
      await recordDownload(env, false);
      return json({ error: "پاسخ سرویس استخراج JSON معتبر نبود.", diagnostic: "upstream_non_json" }, 502);
    }

    const mediaUrl = extractVideoUrl(payload);
    if (!mediaUrl) {
      console.error("TikTok upstream schema mismatch:", JSON.stringify(payload).slice(0, 1800));
      await recordDownload(env, false);
      return json({
        error: payload?.status === false
          ? "سرویس قدیمی نتوانست این ویدیو را استخراج کند."
          : "لینک ویدیو در پاسخ سرویس قدیمی پیدا نشد.",
        diagnostic: "download_url_not_found"
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
      if (!Number.isSafeInteger(next) || next < 1) throw new Error("download_sequence_unavailable");
      videoCode = next;
    }

    await recordDownload(env, true);
    return json({
      ok: true,
      type: "video",
      description: typeof payload.title === "string" ? payload.title : "",
      author: typeof payload.creator === "string" ? payload.creator : "",
      code: videoCode,
      filename: "TikTokDL-" + videoCode + ".mp4",
      links: [mediaUrl]
    });
  } catch (error) {
    console.error("TikTok API error:", error?.stack || error?.message || String(error));
    await recordDownload(env, false);
    return json({
      error: "ارتباط با سرویس استخراج برقرار نشد.",
      diagnostic: "upstream_fetch_failed"
    }, 502);
  }
}
