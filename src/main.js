import "./style.css";
const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat(document.documentElement.lang==="fa"?"fa-IR":"en-US").format(n);
const dict={
fa:{eyebrow:"فقط برای TikTok",headline:'ویدیوهای تیک‌تاک را <span>دریافت کن</span>',subtitle:"لینک ویدیوی عمومی را وارد کن تا لینک دریافت آن بررسی شود.",linkLabel:"لینک ویدیوی TikTok",download:"دریافت لینک",permission:"تأیید می‌کنم مالک محتوا هستم یا اجازه دریافت آن را دارم.",adLabel:"تبلیغات",adTitle:"جایگاه بنر تبلیغاتی",adSub:"بنر تبلیغاتی شما در این قسمت نمایش داده می‌شود.",disclaimer:"لطفاً فقط محتوایی را دریافت کن که مالک آن هستی یا اجازه استفاده از آن را داری. رعایت قوانین پلتفرم و حقوق سازندگان بر عهده کاربر است.",footer:"ساده، خلوت و مخصوص تیک‌تاک",adminTitle:"پنل مدیریت",adminSub:"ورود مدیر برای مشاهده آمار",login:"ورود",allDownloads:"کل درخواست‌ها",todayDownloads:"امروز",successful:"موفق",recent:"درخواست‌های اخیر",date:"زمان",type:"نوع",state:"وضعیت",video:"ویدیو",image:"تصویر",ok:"موفق",fail:"ناموفق",empty:"لینک را وارد کن.",needPermission:"ابتدا تأیید مالکیت یا اجازه استفاده را فعال کن.",working:"در حال بررسی…",fetching:"در حال دریافت اطلاعات…",ready:"لینک‌ها آماده‌اند.",invalid:"لینک معتبر TikTok وارد کن.",generic:"درخواست ناموفق بود."},
en:{eyebrow:"TikTok only",headline:'Get TikTok videos <span>easily</span>',subtitle:"Paste a public TikTok video link to check its available media links.",linkLabel:"TikTok video URL",download:"Get links",permission:"I confirm I own this content or have permission to access it.",adLabel:"ADVERTISEMENT",adTitle:"Advertisement banner space",adSub:"Your advertising banner will appear here.",disclaimer:"Only access content you own or have permission to use. You are responsible for respecting platform rules and creators’ rights.",footer:"Minimal, clean and made for TikTok",adminTitle:"Admin panel",adminSub:"Admin sign-in to view statistics",login:"Sign in",allDownloads:"Total requests",todayDownloads:"Today",successful:"Successful",recent:"Recent requests",date:"Date",type:"Type",state:"Status",video:"Video",image:"Image",ok:"Success",fail:"Failed",empty:"Enter a link.",needPermission:"Confirm ownership or permission first.",working:"Checking…",fetching:"Fetching details…",ready:"Links are ready.",invalid:"Enter a valid TikTok URL.",generic:"Request failed."}
};
let lang=localStorage.getItem("tdl-lang")==="en"?"en":"fa";
function applyLang(){const d=dict[lang];document.documentElement.lang=lang;document.documentElement.dir=lang==="fa"?"rtl":"ltr";document.querySelectorAll("[data-i18n]").forEach(el=>{const k=el.dataset.i18n;if(d[k])el.innerHTML=d[k]});$("langToggle").textContent=lang==="fa"?"EN":"فا";$("videoUrl").placeholder=lang==="fa"?"https://www.tiktok.com/@user/video/...":"https://www.tiktok.com/@user/video/...";}
$("langToggle").onclick=()=>{lang=lang==="fa"?"en":"fa";localStorage.setItem("tdl-lang",lang);applyLang()};
function applyTheme(theme){document.documentElement.dataset.theme=theme;$("themeToggle").textContent=theme==="light"?"☾":"☼";localStorage.setItem("tdl-theme",theme)}
applyTheme(localStorage.getItem("tdl-theme")==="light"?"light":"dark");applyLang();
$("themeToggle").onclick=()=>applyTheme(document.documentElement.dataset.theme==="light"?"dark":"light");
const button=$("downloadBtn"),status=$("status"),result=$("result");
button.addEventListener("click",async()=>{
 const url=$("videoUrl").value.trim(),d=dict[lang];
 if(!url){status.textContent=d.empty;status.className="status error";return}
 if(!$("permission").checked){status.textContent=d.needPermission;status.className="status error";return}
 button.disabled=true;button.querySelector("span").textContent=d.working;status.textContent=d.fetching;status.className="status";
 result.classList.add("hidden");result.replaceChildren();
 try{
  const res=await fetch("/api/download",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({url,authorized:true})});
  const data=await res.json();if(!res.ok)throw new Error(data.error||d.generic);
  status.textContent=d.ready;status.className="status success";
  const title=document.createElement("div");title.className="result-title";title.textContent=data.description||d.ready;result.append(title);
  if(data.author){const author=document.createElement("p");author.className="author";author.textContent="@"+data.author;result.append(author)}
  (data.links||[]).forEach((href,i)=>{const a=document.createElement("a");a.className="result-link";a.href=href;a.target="_blank";a.rel="noopener noreferrer";a.textContent=(data.type==="image"?d.image:d.video)+" "+fmt(i+1)+" ↗";result.append(a)});
  result.classList.remove("hidden");
 }catch(e){status.textContent=e.message||d.generic;status.className="status error"}
 finally{button.disabled=false;button.querySelector("span").textContent=d.download}
});
$("videoUrl").addEventListener("keydown",e=>{if(e.key==="Enter")button.click()});
const modal=$("adminModal");let logoClicks=0,clickTimer;
$("brandSecret").addEventListener("click",()=>{logoClicks++;clearTimeout(clickTimer);clickTimer=setTimeout(()=>logoClicks=0,1600);if(logoClicks>=5){logoClicks=0;modal.classList.remove("hidden");$("adminPassword").focus()}});
$("adminClose").onclick=()=>modal.classList.add("hidden");
modal.addEventListener("click",e=>{if(e.target===modal)modal.classList.add("hidden")});
$("adminLogin").addEventListener("submit",async e=>{
 e.preventDefault();$("adminError").textContent=lang==="fa"?"در حال ورود…":"Signing in…";
 try{
  const r=await fetch("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:$("adminPassword").value})});
  const d=await r.json();if(!r.ok)throw new Error(d.error||"Login failed");
  const s=await fetch("/api/admin/stats",{headers:{authorization:"Bearer "+d.token}}),stats=await s.json();if(!s.ok)throw new Error(stats.error||"Stats unavailable");
  $("total").textContent=fmt(stats.total);$("today").textContent=fmt(stats.today);$("success").textContent=fmt(stats.success);$("recent").replaceChildren();
  stats.recent.forEach(row=>{const tr=document.createElement("tr");[new Date(row.created_at+"Z").toLocaleString(lang==="fa"?"fa-IR":"en-US"),row.media_type==="image"?dict[lang].image:dict[lang].video,row.success?dict[lang].ok:dict[lang].fail].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td)});$("recent").append(tr)});
  $("dashboard").classList.remove("hidden");$("adminLogin").classList.add("hidden");$("adminError").textContent="";
 }catch(err){$("adminError").textContent=err.message}
});