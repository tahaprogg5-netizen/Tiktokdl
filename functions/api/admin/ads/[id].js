const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const enc=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
async function sign(value,secret){const key=await crypto.subtle.importKey("raw",enc.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",key,enc.encode(value)));}
async function authorized(request,env){
  if(!env.ADMIN_PASSWORD)return false;
  const token=request.headers.get("authorization")?.replace(/^Bearer\s+/i,"");
  const [payload,signature]=(token||"").split(".");
  if(!payload||!signature||signature!==await sign(payload,env.ADMIN_PASSWORD))return false;
  try{const claims=JSON.parse(atob(payload.replace(/-/g,"+").replace(/_/g,"/")));return !!claims.exp&&claims.exp>Date.now();}catch{return false;}
}
function validUrl(value){if(!value)return true;try{const u=new URL(value);return u.protocol==="https:"||u.protocol==="http:";}catch{return false;}}
export async function onRequestPut({request,env,params}){
  if(!await authorized(request,env))return json({error:"دسترسی مدیر لازم است."},401);
  const id=Number(params.id);if(!Number.isSafeInteger(id)||id<1)return json({error:"شناسه نامعتبر است."},400);
  let b;try{b=await request.json();}catch{return json({error:"درخواست نامعتبر است."},400);}
  const title=typeof b.title==="string"?b.title.trim():"";
  const image=typeof b.image_url==="string"?b.image_url.trim():"";
  const target=typeof b.target_url==="string"?b.target_url.trim():"";
  if(!title||title.length>100||!validUrl(image)||!validUrl(target)||(!image&&!target))return json({error:"عنوان و حداقل یکی از لینک تصویر یا مقصد معتبر لازم است."},400);
  try{
    const r=await env.DB.prepare("UPDATE ads SET title=?,image_url=?,target_url=?,enabled=?,updated_at=datetime('now') WHERE id=?").bind(title,image||null,target||null,b.enabled===false?0:1,id).run();
    if(!r.meta?.changes)return json({error:"تبلیغ پیدا نشد."},404);
    return json({ok:true});
  }catch{return json({error:"ویرایش تبلیغ ناموفق بود."},500);}
}
export async function onRequestDelete({request,env,params}){
  if(!await authorized(request,env))return json({error:"دسترسی مدیر لازم است."},401);
  const id=Number(params.id);if(!Number.isSafeInteger(id)||id<1)return json({error:"شناسه نامعتبر است."},400);
  try{const r=await env.DB.prepare("DELETE FROM ads WHERE id=?").bind(id).run();if(!r.meta?.changes)return json({error:"تبلیغ پیدا نشد."},404);return json({ok:true});}
  catch{return json({error:"حذف تبلیغ ناموفق بود."},500);}
}
