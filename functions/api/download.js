import { ttdl } from "btch-downloader";
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
  if (!(input.toLowerCase().startsWith("http://") || input.toLowerCase().startsWith("https://"))) input = "https://" + input;

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

function getVideoItems(result) {
  const value = result?.video ?? result?.data?.video;
  if (Array.isArray(value)) return value;
  if (typeof value === "string" || (value && typeof value === "object")) return [value];
  return [];
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
    // Run the downloader library inside the Cloudflare Pages Function.
    // No separate Koa/Node server or external API base URL is required.
    const result = await ttdl(tiktokUrl);
    const links = [...new Set(
      getVideoItems(result)
        .map(mediaUrl)
        .filter(url => url && isAllowedMediaUrl(url))
    )].slice(0, 10);

    if (!links.length) {
      await recordDownload(env, false);
      return json({
        error: "برای این ویدیو لینک دریافت معتبری پیدا نشد. عمومی‌بودن ویدیو را بررسی کن."
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

    await recordDownload(env, true);
    return json({
      ok: true,
      type: "video",
      description: result?.title || result?.data?.title || "",
      author: result?.creator || result?.author?.username || result?.author?.nickname || "",
      code: videoCode,
      filename: "TikTokDL-" + videoCode + ".mp4",
      links
    });
  } catch (error) {
    console.error("TikTok downloader error:", error?.message || String(error));
    await recordDownload(env, false);
    return json({
      error: "استخراج ویدیو ناموفق بود. ممکن است ویدیو در دسترس عمومی نباشد یا سرویس موقتاً پاسخ ندهد."
    }, 502);
  }
}
