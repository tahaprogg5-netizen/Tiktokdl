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
const TYPES=new Set(["heading","text","image","banner","button","divider","spacer"]);
function cleanBlocks(value){
 if(!Array.isArray(value)||value.length>30)return null;
 const out=[];
 for(const item of value){
  if(!item||!TYPES.has(item.type))return null;
  const block={type:item.type};
  for(const key of ["text","url","alt"]){if(item[key]!==undefined){if(typeof item[key]!=="string"||item[key].length>5000)return null;block[key]=item[key].trim();}}
  if(["image","button"].includes(block.type)){try{const u=new URL(block.url||"");if(u.protocol!=="https:")return null;}catch{return null;}}
  if(["heading","text","banner","button"].includes(block.type)&&!block.text)return null;
  if(block.type==="image"&&!block.url)return null;
  out.push(block);
 }
 return out;
}
function validSlug(s){return typeof s==="string"&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)&&s.length<=60;}
export async function onRequestPut({request,env,params}){
 if(!await authorized(request,env))return json({error:"دسترسی مدیر لازم است."},401);
 const id=Number(params.id);if(!Number.isSafeInteger(id)||id<1)return json({error:"شناسه نامعتبر است."},400);
 let b;try{b=await request.json();}catch{return json({error:"درخواست نامعتبر است."},400);}
 const title=typeof b.title==="string"?b.title.trim():"",slug=typeof b.slug==="string"?b.slug.trim().toLowerCase():"",blocks=cleanBlocks(b.blocks);
 if(!title||title.length>120||!validSlug(slug)||!blocks)return json({error:"عنوان، نشانی انگلیسی معتبر و بلوک‌های مجاز لازم است."},400);
 try{const r=await env.DB.prepare("UPDATE pages SET slug=?,title=?,content_json=?,published=?,updated_at=datetime('now') WHERE id=?").bind(slug,title,JSON.stringify(blocks),b.published?1:0,id).run();if(!r.meta?.changes)return json({error:"صفحه پیدا نشد."},404);return json({ok:true});}
 catch{return json({error:"نشانی تکراری است یا ذخیره صفحه ناموفق بود."},409);}
}
export async function onRequestDelete({request,env,params}){
 if(!await authorized(request,env))return json({error:"دسترسی مدیر لازم است."},401);
 const id=Number(params.id);if(!Number.isSafeInteger(id)||id<1)return json({error:"شناسه نامعتبر است."},400);
 try{const r=await env.DB.prepare("DELETE FROM pages WHERE id=?").bind(id).run();if(!r.meta?.changes)return json({error:"صفحه پیدا نشد."},404);return json({ok:true});}
 catch{return json({error:"حذف صفحه ناموفق بود."},500);}
}
