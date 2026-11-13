const $ = (id) => document.getElementById(id);
const button = $("downloadBtn"), status = $("status"), result = $("result");
const fmt = (n) => new Intl.NumberFormat("fa-IR").format(n);
button.addEventListener("click", async () => {
  const url = $("videoUrl").value.trim();
  if (!url) { status.textContent = "لینک را وارد کن."; status.className = "status error"; return; }
  if (!$("permission").checked) { status.textContent = "ابتدا تأیید مالکیت یا اجازه استفاده را فعال کن."; status.className = "status error"; return; }
  button.disabled = true; button.querySelector("span").textContent = "در حال بررسی…";
  status.textContent = "در حال دریافت اطلاعات…"; status.className = "status";
  result.classList.add("hidden"); result.replaceChildren();
  try {
    const res = await fetch("/api/download", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({url,authorized:true}) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "درخواست ناموفق بود.");
    status.textContent = "لینک‌ها آماده‌اند."; status.className = "status success";
    const title = document.createElement("div"); title.className = "result-title"; title.textContent = data.description || "رسانه آماده دریافت است"; result.append(title);
    if (data.author) { const author=document.createElement("p"); author.className="author"; author.textContent="سازنده: "+data.author; result.append(author); }
    data.links.forEach((url, i) => { const a=document.createElement("a"); a.className="result-link"; a.href=url; a.target="_blank"; a.rel="noopener noreferrer"; a.textContent=(data.type==="image"?"باز کردن تصویر ":"دریافت ویدیو ")+fmt(i+1)+" ↗"; result.append(a); });
    result.classList.remove("hidden");
  } catch(e) { status.textContent = e.message; status.className = "status error"; }
  finally { button.disabled=false; button.querySelector("span").textContent="دریافت لینک"; }
});
$("videoUrl").addEventListener("keydown",e=>{if(e.key==="Enter")button.click();});
const modal=$("adminModal");
$("adminOpen").onclick=()=>modal.classList.remove("hidden");
$("adminClose").onclick=()=>modal.classList.add("hidden");
modal.addEventListener("click",e=>{if(e.target===modal)modal.classList.add("hidden");});
$("adminLogin").addEventListener("submit",async e=>{
  e.preventDefault(); $("adminError").textContent="در حال ورود…";
  try{
    const r=await fetch("/api/admin/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({password:$("adminPassword").value})});
    const d=await r.json(); if(!r.ok)throw new Error(d.error);
    const s=await fetch("/api/admin/stats",{headers:{authorization:"Bearer "+d.token}});
    const stats=await s.json(); if(!s.ok)throw new Error(stats.error);
    $("total").textContent=fmt(stats.total); $("today").textContent=fmt(stats.today); $("success").textContent=fmt(stats.success);
    $("recent").replaceChildren();
    stats.recent.forEach(row=>{const tr=document.createElement("tr");[new Date(row.created_at+"Z").toLocaleString("fa-IR"),row.media_type==="image"?"تصویر":"ویدیو",row.success?"موفق":"ناموفق"].forEach(v=>{const td=document.createElement("td");td.textContent=v;tr.append(td);});$("recent").append(tr);});
    $("dashboard").classList.remove("hidden"); $("adminLogin").classList.add("hidden"); $("adminError").textContent="";
  }catch(err){$("adminError").textContent=err.message;}
});