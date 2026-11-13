function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function validTikTokUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      (u.hostname === "tiktok.com" || u.hostname.endsWith(".tiktok.com"));
  } catch {
    return false;
  }
}

function mediaUrl(item) {
  if (typeof item === "string") return item;
  if (!item || typeof item !== "object") return "";
  if (typeof item.url === "string") return item.url;
  if (typeof item.play_addr === "string") return item.play_addr;
  if (Array.isArray(item.url_list)) return item.url_list.find(x => typeof x === "string") || "";
  return "";
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "درخواست نامعتبر است." }, 400);
  }

  if (typeof body.url !== "string" || body.url.length > 500 || !validTikTokUrl(body.url)) {
    return json({ error: "لینک معتبر TikTok وارد کن." }, 400);
  }

  try {
    // Cloudflare Pages Function calls the same ttdl endpoint used by
    // btch-downloader 2.3.2 in the BOTCAHX/tiktokdl-api repository.
    const endpoint = new URL("https://backend1.tioo.eu.org/ttdl");
    endpoint.searchParams.set("url", body.url);

    const response = await fetch(endpoint.toString(), {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "User-Agent": "TikTokDL-Cloudflare/1.0"
      },
      signal: AbortSignal.timeout(25000)
    });

    if (!response.ok) {
      throw new Error("Downloader service returned HTTP " + response.status);
    }

    const data = await response.json();
    if (data?.status === false || data?.error) {
      throw new Error(data.message || data.error || "No media returned");
    }

    const videos = Array.isArray(data?.video) ? data.video : [];
    const links = [...new Set(videos.map(mediaUrl).filter(url => /^https:\/\//i.test(url)))];

    if (!links.length) {
      await env.DB?.prepare("INSERT INTO downloads(media_type, success) VALUES('video', 0)").run();
      return json({ error: "سرویس استخراج، لینک ویدیو برنگرداند. ممکن است لینک خصوصی یا نامعتبر باشد." }, 502);
    }

    await env.DB?.prepare("INSERT INTO downloads(media_type, success) VALUES('video', 1)").run();
    return json({
      ok: true,
      type: "video",
      description: data.title || data.title_audio || "",
      links: links.slice(0, 10)
    });
  } catch (error) {
    await env.DB?.prepare("INSERT INTO downloads(media_type, success) VALUES('video', 0)").run().catch(() => {});
    console.error("TikTok API proxy error:", error?.message || String(error));
    return json({
      error: "ارتباط با سرویس استخراج برقرار نشد یا TikTok لینک قابل دریافت نداد. کمی بعد دوباره امتحان کن."
    }, 502);
  }
}
