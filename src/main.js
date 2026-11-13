import "./style.css";
const $=id=>document.getElementById(id);
const fmt=n=>new Intl.NumberFormat(document.documentElement.lang==="fa"?"fa-IR":"en-US").format(n);
const dict={
fa:{eyebrow:"فقط برای TikTok",headline:'ویدیوهای تیک‌تاک را <span>دریافت کن</span>',subtitle:"لینک ویدیوی عمومی را وارد کن تا لینک دریافت آن بررسی شود.",linkLabel:"لینک ویدیوی TikTok",download:"دریافت لینک",permission:"تأیید می‌کنم مالک محتوا هستم یا اجازه دریافت آن را دارم.",adLabel:"تبلیغات",adTitle:"جایگاه بنر تبلیغاتی",adSub:"بنر تبلیغاتی شما در این قسمت نمایش داده می‌شود.",disclaimer:"لطفاً فقط محتوایی را دریافت کن که مالک آن هستی یا اجازه استفاده از آن را داری. رعایت قوانین پلتفرم و حقوق سازندگان بر عهده کاربر است.",footer:"ساده، خلوت و مخصوص تیک‌تاک",adsManager:"مدیریت تبلیغات",adsHint:"تبلیغات فعال در سایت نمایش داده می‌شوند.",adName:"عنوان تبلیغ",adImage:"لینک تصویر (اختیاری)",adTarget:"لینک مقصد",adActive:"نمایش تبلیغ",saveAd:"ذخیره تبلیغ",cancel:"انصراف",edit:"ویرایش",delete:"حذف",enabled:"فعال",disabled:"غیرفعال",adSaved:"تبلیغ ذخیره شد.",adDeleted:"تبلیغ حذف شد.",noAds:"هنوز تبلیغی ثبت نشده است.",adminTitle:"پنل مدیریت",adminSub:"ورود مدیر برای مشاهده آمار",login:"ورود",allDownloads:"کل درخواست‌ها",todayDownloads:"امروز",successful:"موفق",recent:"درخواست‌های اخیر",date:"زمان",type:"نوع",state:"وضعیت",video:"ویدیو",image:"تصویر",ok:"موفق",fail:"ناموفق",empty:"لینک را وارد کن.",needPermission:"ابتدا تأیید مالکیت یا اجازه استفاده را فعال کن.",working:"در حال بررسی…",fetching:"در حال دریافت اطلاعات…",ready:"لینک‌ها آماده‌اند.",invalid:"لینک معتبر TikTok وارد کن.",generic:"درخواست ناموفق بود."},
en:{eyebrow:"TikTok only",headline:'Get TikTok videos <span>easily</span>',subtitle:"Paste a public TikTok video link to check its available media links.",linkLabel:"TikTok video URL",download:"Get links",permission:"I confirm I own this content or have permission to access it.",adLabel:"ADVERTISEMENT",adTitle:"Advertisement banner space",adSub:"Your advertising banner will appear here.",disclaimer:"Only access content you own or have permission to use. You are responsible for respecting platform rules and creators’ rights.",footer:"Minimal, clean and made for TikTok",adsManager:"Ad management",adsHint:"Active ads appear on the website.",adName:"Ad title",adImage:"Image URL (optional)",adTarget:"Destination URL",adActive:"Show this ad",saveAd:"Save ad",cancel:"Cancel",edit:"Edit",delete:"Delete",enabled:"Active",disabled:"Disabled",adSaved:"Advertisement saved.",adDeleted:"Advertisement deleted.",noAds:"No ads added yet.",adminTitle:"Admin panel",adminSub:"Admin sign-in to view statistics",login:"Sign in",allDownloads:"Total requests",todayDownloads:"Today",successful:"Successful",recent:"Recent requests",date:"Date",type:"Type",state:"Status",video:"Video",image:"Image",ok:"Success",fail:"Failed",empty:"Enter a link.",needPermission:"Confirm ownership or permission first.",working:"Checking…",fetching:"Fetching details…",ready:"Links are ready.",invalid:"Enter a valid TikTok URL.",generic:"Request failed."}
};
let lang=localStorage.getItem("tdl-lang")==="en"?"en":"fa";
function applyLang(){const d=dict[lang];document.documentElement.lang=lang;document.documentElement.dir=lang==="fa"?"rtl":"ltr";document.querySelectorAll("[data-i18n]").forEach(el=>{const k=el.dataset.i18n;if(d[k])el.innerHTML=d[k]});$("langToggle").textContent=lang==="fa"?"EN":"فا";$("videoUrl").placeholder=lang==="fa"?"https://www.tiktok.com/@user/video/...":"https://www.tiktok.com/@user/video/...";}
$("langToggle").onclick=()=>{lang=lang==="fa"?"en":"fa";localStorage.setItem("tdl-lang",lang);applyLang()};
function applyTheme(theme){document.documentElement.dataset.theme=theme;$("themeToggle").textContent=theme==="light"?"☾":"☼";localStorage.setItem("tdl-theme",theme)}
applyTheme(localStorage.getItem("tdl-theme")==="light"?"light":"dark");applyLang();
async function loadPublicAds(){
 try{
  const r=await fetch("/api/ads",{cache:"no-store"}),d=await r.json(),ad=d.ads?.[0];
  if(!ad)return;
  const slot=document.querySelector(".ad-slot");slot.replaceChildren();
  const label=document.createElement("span");label.className="ad-label";label.textContent=lang==="fa"?"تبلیغات":"ADVERTISEMENT";slot.append(label);
  const content=document.createElement("div");content.className="public-ad-content";
  if(ad.image_url){const img=document.createElement("img");img.src=ad.image_url;img.alt=ad.title;img.loading="lazy";content.append(img)}
  const title=document.createElement("strong");title.textContent=ad.title;content.append(title);
  if(ad.target_url){const link=document.createElement("a");link.href=ad.target_url;link.target="_blank";link.rel="noopener noreferrer sponsored";link.className="public-ad-link";link.textContent=lang==="fa"?"مشاهده تبلیغ ↗":"View ad ↗";content.append(link);slot.append(content)}
  else slot.append(content);
  slot.setAttribute("aria-label","Advertisement");
 }catch{}
}
loadPublicAds();
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
let adminToken="";
const adForm=$("adForm");
function resetAdForm(){adForm.reset();$("adId").value="";$("adEnabledInput").checked=true;$("cancelAdEdit").classList.add("hidden")}
$("cancelAdEdit").onclick=resetAdForm;
async function loadAdminAds(){
 const box=$("adsList");box.replaceChildren();
 try{
  const r=await fetch("/api/admin/ads",{headers:{authorization:"Bearer "+adminToken}}),d=await r.json();if(!r.ok)throw new Error(d.error||"Failed");
  if(!d.ads?.length){const p=document.createElement("p");p.className="empty-ads";p.textContent=dict[lang].noAds;box.append(p);return}
  d.ads.forEach(ad=>{
   const item=document.createElement("div");item.className="ad-item";
   const info=document.createElement("div");info.className="ad-item-info";
   const title=document.createElement("strong");title.textContent=ad.title;info.append(title);
   const state=document.createElement("small");state.textContent=ad.enabled?dict[lang].enabled:dict[lang].disabled;state.className=ad.enabled?"ad-on":"ad-off";info.append(state);item.append(info);
   const actions=document.createElement("div");actions.className="ad-item-actions";
   const edit=document.createElement("button");edit.type="button";edit.className="tool-btn";edit.textContent=dict[lang].edit;edit.onclick=()=>{$("adId").value=ad.id;$("adTitleInput").value=ad.title;$("adImageInput").value=ad.image_url||"";$("adTargetInput").value=ad.target_url||"";$("adEnabledInput").checked=!!ad.enabled;$("cancelAdEdit").classList.remove("hidden");$("adTitleInput").focus()};actions.append(edit);
   const del=document.createElement("button");del.type="button";del.className="tool-btn danger-btn";del.textContent=dict[lang].delete;del.onclick=async()=>{if(!confirm(lang==="fa"?"این تبلیغ حذف شود؟":"Delete this ad?"))return;const x=await fetch("/api/admin/ads/"+ad.id,{method:"DELETE",headers:{authorization:"Bearer "+adminToken}});const z=await x.json();if(!x.ok)throw new Error(z.error||"Delete failed");$("adStatus").textContent=dict[lang].adDeleted;await loadAdminAds();await loadPublicAds()};actions.append(del);item.append(actions);box.append(item);
  });
 }catch(e){$("adStatus").textContent=e.message}
}
adForm.addEventListener("submit",async e=>{
 e.preventDefault();$("adStatus").textContent=lang==="fa"?"در حال ذخیره…":"Saving…";
 const id=$("adId").value,body={title:$("adTitleInput").value.trim(),image_url:$("adImageInput").value.trim(),target_url:$("adTargetInput").value.trim(),enabled:$("adEnabledInput").checked};
 try{const r=await fetch(id?"/api/admin/ads/"+id:"/api/admin/ads",{method:id?"PUT":"POST",headers:{"content-type":"application/json",authorization:"Bearer "+adminToken},body:JSON.stringify(body)}),d=await r.json();if(!r.ok)throw new Error(d.error||"Save failed");$("adStatus").textContent=dict[lang].adSaved;resetAdForm();await loadAdminAds();await loadPublicAds()}catch(e){$("adStatus").textContent=e.message}
});
const modal=$("adminModal");let logoClicks=0,clickTimer;
$("brandSecret").addEventListener("click",()=>{logoClicks++;clearTimeout(clickTimer);clickTimer=setTimeout(()=>logoClicks=0,1600);if(logoClicks>=5){logoClicks=0;modal.classList.remove("hidden");$("adminPassword").focus()}});
$("adminClose").onclick=()=>modal.classList.add("hidden");
modal.addEventListener("click",e=>{if(e.target===modal)modal.classList.add("hidden")});
$("adminLogin").addEventListener("submit",async e=>{
 e.preventDefault();$("adminError").textContent=lang==="fa"?"در حال ورود…":"Signing in…";
 try{
  const r=await fetch("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:$("adminPassword").value})});
  const d=await r.json();if(!r.ok)throw new Error(d.error||"Login failed");adminToken=d.token;
  const s=await fetch("/api/admin/stats",{headers:{authorization:"Bearer "+d.token}}),stats=await s.json();if(!s.ok)throw new Error(stats.error||"Stats unavailable");
  $("total").textContent=fmt(stats.total);$("today").textContent=fmt(stats.today);$("success").textContent=fmt(stats.success);$("recent").replaceChildren();
  stats.recent.forEach(row=>{const tr=document.createElement("tr");[new Date(row.created_at+"Z").toLocaleString(lang==="fa"?"fa-IR":"en-US"),row.media_type==="image"?dict[lang].image:dict[lang].video,row.success?dict[lang].ok:dict[lang].fail].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td)});$("recent").append(tr)});
  $("dashboard").classList.remove("hidden");$("adminLogin").classList.add("hidden");$("adminError").textContent="";await loadAdminAds();
 }catch(err){$("adminError").textContent=err.message}
});