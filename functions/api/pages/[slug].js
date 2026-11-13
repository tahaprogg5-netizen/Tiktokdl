const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"public, max-age=60"}});
export async function onRequestGet({env,params}){
 const slug=String(params.slug||"").toLowerCase();
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))return json({error:"صفحه پیدا نشد."},404);
 try{
  const page=await env.DB.prepare("SELECT slug,title,content_json FROM pages WHERE slug=? AND published=1").bind(slug).first();
  if(!page)return json({error:"صفحه پیدا نشد یا هنوز منتشر نشده است."},404);
  let blocks=[];try{blocks=JSON.parse(page.content_json)||[];}catch{}
  return json({page:{slug:page.slug,title:page.title,blocks}});
 }catch{return json({error:"خواندن صفحه ناموفق بود."},500);}
}
