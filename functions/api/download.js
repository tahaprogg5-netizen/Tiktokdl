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

function collectUrls(value, output = [], depth = 0) {
  if (depth > 6 || value == null) return output;
  if (typeof value === "string") {
    const candidate = value.trim();
    if (/^https:\/\//i.test(candidate) && !output.includes(candidate)) output.push(candidate);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, output, depth + 1);
    return output;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (/(url|download|play|video|media|src|link)/i.test(key)) {
        collectUrls(item, output, depth + 1);
      }
    }
  }
  return output;
}

function extractDownloadUrl(payload) {
  const urls = collectUrls(payload);
  return urls.find(isAllowedMediaUrl) || "";
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
    apiUrl.searchParams.set("down", tiktokUrl);

    const upstream = await fetch(apiUrl.toString(), {
      headers: {
        "accept": "application/json, text/plain, */*",
        "user-agent": "Mozilla/5.0 (compatible; TikTokDL/1.0)"
      },
      signal: AbortSignal.timeout(30000)
    });

    const raw = await upstream.text();
    if (!upstream.ok) {
      console.error("TikTok upstream HTTP:", upstream.status, raw.slice(0, 1200));
      await recordDownload(env, false);
      return json({ error: "سرویس استخراج پاسخ ناموفق داد.", diagnostic: "upstream_http_" + upstream.status }, 502);
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      console.error("TikTok upstream non-JSON:", raw.slice(0, 1200));
      await recordDownload(env, false);
      return json({ error: "پاسخ سرویس استخراج JSON معتبر نبود.", diagnostic: "upstream_non_json" }, 502);
    }

    const mediaUrl = extractDownloadUrl(payload);
    if (!mediaUrl) {
      console.error("TikTok upstream schema mismatch:", JSON.stringify(payload).slice(0, 1800));
      await recordDownload(env, false);
      return json({
        error: "سرویس پاسخ داد، اما لینک ویدیو در پاسخ پیدا نشد.",
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
    console.error("TikTok API error:", error?.stack || error?.message || String(error));
    await recordDownload(env, false);
    return json({
      error: "ارتباط با سرویس استخراج برقرار نشد.",
      diagnostic: "upstream_fetch_failed"
    }, 502);
  }
}
