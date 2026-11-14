import "./dl-hub.css";

const $ = (id) => document.getElementById(id);
const tabs = [...document.querySelectorAll("[data-platform]")];

function selectPlatform(platform) {
  tabs.forEach((tab) => {
    const active = tab.dataset.platform === platform;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  $("tiktokPanel").hidden = platform !== "tiktok";
  $("youtubePanel").hidden = platform !== "youtube";
  $("tiktokPanel").classList.toggle("active", platform === "tiktok");
  $("youtubePanel").classList.toggle("active", platform === "youtube");
}
tabs.forEach((tab) => tab.addEventListener("click", () => selectPlatform(tab.dataset.platform)));

const youtubeStatus = $("youtubeStatus");
const infoButton = $("youtubeInfoBtn");
const downloadButton = $("youtubeDownloadBtn");
let currentYoutubeUrl = "";
let resolutions = [];

function status(message, type = "") {
  youtubeStatus.textContent = message;
  youtubeStatus.className = "status" + (type ? " " + type : "");
}

function validYoutubeUrl(value) {
  try {
    const u = new URL(value);
    return ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"].includes(u.hostname.toLowerCase())
      && (u.protocol === "https:" || u.protocol === "http:");
  } catch { return false; }
}

function consented() {
  if (!$("youtubeConsent").checked) {
    status("ابتدا تأیید اجازه دانلود را فعال کن.", "error");
    return false;
  }
  return true;
}

async function youtubeRequest(action, extra = {}) {
  const response = await fetch("/api/youtube", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, url: currentYoutubeUrl, consent: $("youtubeConsent").checked, ...extra })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "درخواست ناموفق بود.");
  return data;
}

infoButton.addEventListener("click", async () => {
  currentYoutubeUrl = $("youtubeUrl").value.trim();
  $("youtubeDetails").classList.add("hidden");
  downloadButton.disabled = true;
  if (!validYoutubeUrl(currentYoutubeUrl)) {
    status("لینک معتبر YouTube وارد کن.", "error");
    return;
  }
  if (!consented()) return;

  infoButton.disabled = true;
  infoButton.querySelector("span").textContent = "در حال بررسی…";
  status("در حال دریافت اطلاعات و کیفیت‌ها…");
  try {
    const [info, available] = await Promise.all([
      youtubeRequest("info"), youtubeRequest("resolutions")
    ]);
    $("youtubeTitle").textContent = info.title || "ویدیوی YouTube";
    $("youtubeAuthor").textContent = info.author || "";
    const duration = Number(info.length);
    const views = Number(info.views);
    $("youtubeMeta").textContent = [
      Number.isFinite(duration) && duration > 0 ? Math.floor(duration / 60) + " دقیقه" : "",
      Number.isFinite(views) && views > 0 ? new Intl.NumberFormat("fa-IR").format(views) + " بازدید" : ""
    ].filter(Boolean).join(" · ");

    const parsed = new URL(currentYoutubeUrl);
    const shortId = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
    const thumb = $("youtubeThumb");
    if (shortId && /^[\\w-]{6,20}$/.test(shortId)) {
      thumb.src = "https://i.ytimg.com/vi/" + encodeURIComponent(shortId) + "/hqdefault.jpg";
      thumb.classList.remove("hidden");
    } else {
      thumb.removeAttribute("src");
      thumb.classList.add("hidden");
    }

    resolutions = Array.isArray(available.progressive) ? available.progressive : [];
    const select = $("youtubeQuality");
    select.replaceChildren();
    resolutions.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    resolutions.forEach((quality) => {
      const option = document.createElement("option");
      option.value = quality;
      option.textContent = quality;
      select.append(option);
    });
    if (!resolutions.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "کیفیت MP4 سازگار پیدا نشد";
      select.append(option);
    }
    downloadButton.disabled = resolutions.length === 0;
    $("youtubeDetails").classList.remove("hidden");
    status("اطلاعات و کیفیت‌ها دریافت شد.", "success");
  } catch (error) {
    status(error.message || "ارتباط با سرویس YouTube برقرار نشد.", "error");
  } finally {
    infoButton.disabled = false;
    infoButton.querySelector("span").textContent = "بررسی ویدیو";
  }
});

downloadButton.addEventListener("click", async () => {
  const quality = $("youtubeQuality").value;
  if (!quality || !resolutions.includes(quality)) {
    status("یک کیفیت معتبر انتخاب کن.", "error");
    return;
  }
  if (!consented()) return;

  downloadButton.disabled = true;
  downloadButton.querySelector("span").textContent = "در حال دریافت فایل…";
  status("در حال آماده‌سازی فایل؛ این کار ممکن است کمی طول بکشد.");
  try {
    const response = await fetch("/api/youtube", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "download", url: currentYoutubeUrl,
        resolution: quality, consent: $("youtubeConsent").checked
      })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || "دانلود انجام نشد.");
    }
    const blob = await response.blob();
    const disposition = response.headers.get("content-disposition") || "";
    const encoded = disposition.match(/filename\\*=UTF-8''([^;]+)/i);
    const basic = disposition.match(/filename="?([^";]+)"?/i);
    const filename = encoded ? decodeURIComponent(encoded[1]) : (basic ? basic[1] : "DL-Hub-video.mp4");
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    status("فایل آماده شد و دریافت آن آغاز شد.", "success");
  } catch (error) {
    status(error.message || "دانلود انجام نشد.", "error");
  } finally {
    downloadButton.disabled = false;
    downloadButton.querySelector("span").textContent = "دریافت فایل";
  }
});

$("youtubeUrl").addEventListener("keydown", (event) => {
  if (event.key === "Enter") infoButton.click();
});
$("youtubeConsent").addEventListener("change", () => {
  if (!$("youtubeConsent").checked) downloadButton.disabled = true;
});
