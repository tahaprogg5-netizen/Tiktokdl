const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export async function onRequestGet({env}) {
  try {
    const {results=[]}=await env.DB.prepare("SELECT id,title,image_url,target_url FROM ads WHERE enabled=1 ORDER BY id DESC LIMIT 5").all();
    return json({ads:results});
  } catch { return json({ads:[]}); }
}
