function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function validTikTokUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"].includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function randomChars(chars, length) {
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Cloudflare Workers use the native Fetch API. The original repository's v1
// resolver used Axios request.res.responseUrl, which is Node.js-specific.
async function getTikTokData(sharedUrl) {
  const pageResponse = await fetch(sharedUrl, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml"
    }
  });

  const finalUrl = pageResponse.url || sharedUrl;
  const idMatch = finalUrl.match(/\\d{17,21}/);
  if (!idMatch) {
    // Some TikTok links expose the item id in the original URL.
    const originalMatch = sharedUrl.match(/(?:video\\/|item_id=)(\\d{17,21})/);
    if (!originalMatch) throw new Error("TikTok could not resolve this public link.");
    return fetchById(originalMatch[1]);
  }
  return fetchById(idMatch[0]);
}

async function fetchById(id) {
  const now = Date.now();
  const params = new URLSearchParams({
    aweme_id: id,
    version_name: "1.1.9",
    version_code: "2018111632",
    build_number: "1.1.9",
    device_id: "7238642534011110914",
    iid: "7318518857994389254",
    manifest_version_code: "2018111632",
    update_version_code: "2018111632",
    openudid: randomChars("0123456789abcdef", 16),
    uuid: randomChars("1234567890", 16),
    _rticket: String(now * 1000),
    ts: String(now),
    device_brand: "Google",
    device_type: "Pixel 4",
    device_platform: "android",
    resolution: "1080*1920",
    dpi: "420",
    os_version: "10",
    os_api: "29",
    carrier_region: "US",
    sys_region: "US",
    region: "US",
    timezone_name: "America/New_York",
    timezone_offset: "-14400",
    channel: "googleplay",
    ac: "wifi",
    mcc_mnc: "310260",
    is_my_cn: "0",
    ssmix: "a",
    as: "a1qwert123",
    cp: "cbfhckdckkde1"
  });

  const apiResponse = await fetch("https://api.tiktokv.com/aweme/v1/feed/?" + params.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "com.zhiliaoapp.musically/2018111632 (Linux; U; Android 10; en_US; Pixel 4; Build/QQ3A.200805.001; Cronet/58.0.2991.0)",
      "Accept": "application/json"
    }
  });

  if (!apiResponse.ok) throw new Error("TikTok API returned HTTP " + apiResponse.status);
  const data = await apiResponse.json();
  const content = (data?.aweme_list || []).find(item => String(item.aweme_id) === String(id));
  if (!content) throw new Error("TikTok did not return media for this public video.");

  const author = content.author || {};
  const stats = content.statistics || {};
  const video = content.video || {};
  const isImage = Boolean(content.image_post_info?.images?.length);

  return {
    type: isImage ? "image" : "video",
    id: content.aweme_id,
    description: content.desc || "",
    author: {
      nickname: author.nickname || "",
      username: author.unique_id || ""
    },
    statistics: {
      playCount: stats.play_count || 0,
      diggCount: stats.digg_count || 0
    },
    images: isImage
      ? content.image_post_info.images.map(image => image?.display_image?.url_list?.[0]).filter(Boolean)
      : [],
    video: {
      downloadAddr: video.download_addr?.url_list || [],
      playAddr: video.play_addr?.url_list || [],
      cover: video.cover?.url_list || []
    }
  };
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "درخواست نامعتبر است." }, 400);
  }

  if (body?.authorized !== true) {
    return json({ error: "ابتدا تأیید کن که مالک محتوا هستی یا اجازه دانلود داری." }, 400);
  }
  if (typeof body.url !== "string" || body.url.length > 500 || !validTikTokUrl(body.url)) {
    return json({ error: "لینک معتبر TikTok وارد کن." }, 400);
  }

  try {
    const item = await getTikTokData(body.url);
    const candidates = item.type === "image"
      ? item.images.filter(url => typeof url === "string" && url.startsWith("https://"))
      : [...item.video.downloadAddr, ...item.video.playAddr]
          .filter((url, index, all) => typeof url === "string" && url.startsWith("https://") && all.indexOf(url) === index);

    if (!candidates.length) {
      await env.DB?.prepare("INSERT INTO downloads(media_type, success) VALUES(?, 0)").bind(item.type || "unknown").run();
      return json({ error: "TikTok لینک رسانه را برنگرداند. ممکن است ویدیو عمومی نباشد یا سرویس محدودیت داشته باشد." }, 502);
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
    console.error("TikTok download resolver error:", error?.message || String(error));
    return json({ error: "دریافت اطلاعات از TikTok ناموفق بود. فقط لینک ویدئوی عمومی و مجاز را امتحان کن." }, 502);
  }
}
