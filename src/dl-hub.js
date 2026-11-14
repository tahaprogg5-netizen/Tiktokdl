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
  } catch {
    return false;
  }
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
  if (!$("youtubeConsent").checked) {
    status("ابتدا تأیید اجازه دانلود را فعال کن.", "error");
    return;
  }

  infoButton.disabled = true;
  infoButton.querySelector("span").textContent = "در حال بررسی…";
  status("در حال دریافت اطلاعات و کیفیت‌ها…");
  try {
    const [info, available] = await Promise.all([
      youtubeRequest("info"),
      youtubeRequest("resolutions")
    ]);
    $("youtubeTitle").textContent = info.title || "ویدیوی YouTube";
    $("youtubeAuthor").textContent = info.author || "";
    const duration = Number(info.length);
    const views = Number(info.views);
    $("youtubeMeta").textContent = [
      Number.isFinite(duration) && duration > 0 ? Math.floor(duration / 60) + " دقیقه" : "",
      Number.isFinite(views) && views > 0 ? new Intl.NumberFormat("fa-IR").format(views) + " بازدید" : ""
    ].filter(Boolean).join(" · ");
    const videoId = new URL(currentYoutubeUrl).searchParams.get("v");
    const shortId = new URL(currentYoutubeUrl).hostname.includes("youtu.be")
      ? new URL(currentYoutubeUrl).pathname.slice(1) : videoId;
    const thumb = $("youtubeThumb");
    if (shortId && /^[\w-]{6,20}$/.test(shortId)) {
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
  if (!$("youtubeConsent").checked) {
    status("تأیید اجازه دانلود الزامی است.", "error");
    return;
  }
  downloadButton.disabled = true;
  downloadButton.querySelector("span").textContent = "در حال ارسال…";
  status("درخواست به سرویس ارسال شد…");
  try {
    const result = await youtubeRequest("download", { resolution: quality });
    status(result.message || "درخواست دانلود در سرویس ثبت شد.", "success");
  } catch (error) {
    status(error.message || "دانلود انجام نشد.", "error");
  } finally {
    downloadButton.disabled = false;
    downloadButton.querySelector("span").textContent = "ارسال درخواست دانلود";
  }
});

$("youtubeUrl").addEventListener("keydown", (event) => {
  if (event.key === "Enter") infoButton.click();
});
$("youtubeConsent").addEventListener("change", () => {
  if (!$("youtubeConsent").checked) downloadButton.disabled = true;
});
