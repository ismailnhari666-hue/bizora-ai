import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,"0")).join("");
const randomToken=()=>{const b=new Uint8Array(32);crypto.getRandomValues(b);return hex(b)};
const sha256=async(v:string)=>hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v))));
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),anonKey=Deno.env.get("SUPABASE_ANON_KEY");
 if(!url||!serviceKey||!anonKey)return json({error:"Server configuration incomplete"},500);
 const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
 let body:Record<string,unknown>;try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
 const action=String(body.action||"");
 const authorizeManager=async()=>{
  const authHeader=req.headers.get("Authorization")||"",jwt=authHeader.startsWith("Bearer ")?authHeader.slice(7):"";
  if(!jwt)return {error:json({error:"User session required"},401)};
  const userClient=createClient(url,anonKey,{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false}});
  const {data:authData,error:authError}=await userClient.auth.getUser();
  if(authError||!authData.user)return {error:json({error:"Invalid user session"},401)};
  const organizationId=String(body.organization_id||"");
  if(!/^[0-9a-f-]{36}$/i.test(organizationId))return {error:json({error:"Valid organization_id required"},400)};
  const {data:membership}=await admin.from("memberships").select("role").eq("organization_id",organizationId).eq("user_id",authData.user.id).eq("is_active",true).maybeSingle();
  if(!membership||!["owner","manager"].includes(membership.role))return {error:json({error:"Owner or manager role required"},403)};
  return {user:authData.user,organizationId};
 };
 if(action==="gateway_status"||action==="gateway_set_enabled"){
  const auth=await authorizeManager();if(auth.error)return auth.error;
  if(action==="gateway_status"){
   const {data:setting,error}=await admin.from("camera_gateway_settings").select("is_enabled,updated_at").eq("organization_id",auth.organizationId).maybeSingle();
   if(error)return json({error:"Could not load Gateway settings"},500);
   const {count}=await admin.from("camera_gateway_agents").select("id",{count:"exact",head:true}).eq("organization_id",auth.organizationId).neq("status","disabled");
   return json({is_enabled:setting?.is_enabled===true,updated_at:setting?.updated_at||null,active_agents:count||0});
  }
  if(typeof body.is_enabled!=="boolean")return json({error:"is_enabled must be boolean"},400);
  const {error}=await admin.from("camera_gateway_settings").upsert({organization_id:auth.organizationId,is_enabled:body.is_enabled,updated_by:auth.user.id,updated_at:new Date().toISOString()},{onConflict:"organization_id"});
  if(error)return json({error:"Could not update Gateway settings"},500);
  return json({ok:true,is_enabled:body.is_enabled});
 }
 if(action==="enroll"){
  const h=req.headers.get("Authorization")||"",jwt=h.startsWith("Bearer ")?h.slice(7):"";
  if(!jwt)return json({error:"User session required"},401);
  const uc=createClient(url,anonKey,{global:{headers:{Authorization:`Bearer ${jwt}`}},auth:{persistSession:false}});
  const {data:ud,error:ue}=await uc.auth.getUser();if(ue||!ud.user)return json({error:"Invalid user session"},401);
  const org=String(body.organization_id||""),branch=body.branch_id?String(body.branch_id):null,name=String(body.agent_name||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(org)||name.length<2||name.length>100)return json({error:"Valid organization_id and agent_name are required"},400);
  const {data:m}=await admin.from("memberships").select("role").eq("organization_id",org).eq("user_id",ud.user.id).eq("is_active",true).maybeSingle();
  if(!m||!["owner","manager"].includes(m.role))return json({error:"Owner or manager role required"},403);
  if(branch){const {data:b}=await admin.from("branches").select("id").eq("id",branch).eq("organization_id",org).maybeSingle();if(!b)return json({error:"Branch does not belong to organization"},400)}
  const {error:settingError}=await admin.from("camera_gateway_settings").upsert({organization_id:org,is_enabled:true},{onConflict:"organization_id",ignoreDuplicates:true});
  if(settingError)return json({error:"Could not initialize Gateway settings"},500);
  const token=randomToken();
  const {data:a,error}=await admin.from("camera_gateway_agents").insert({organization_id:org,branch_id:branch,agent_name:name,token_hash:await sha256(token),created_by:ud.user.id,status:"pending"}).select("id,agent_name,organization_id,branch_id,status,created_at").single();
  if(error)return json({error:"Could not enroll gateway"},500);
  return json({agent:a,gateway_token:token,warning:"Save this token securely. It is shown only once."},201);
 }
 const h=req.headers.get("Authorization")||"",token=h.startsWith("Bearer ")?h.slice(7):"";
 if(token.length<40)return json({error:"Gateway token required"},401);
 const {data:a}=await admin.from("camera_gateway_agents").select("id,organization_id,branch_id,status").eq("token_hash",await sha256(token)).maybeSingle();
 if(!a||a.status==="disabled")return json({error:"Invalid or disabled gateway token"},401);
 const {data:gatewaySetting}=await admin.from("camera_gateway_settings").select("is_enabled").eq("organization_id",a.organization_id).maybeSingle();
 if(!gatewaySetting?.is_enabled)return json({error:"Gateway is disabled for this organization"},403);
 if(action==="heartbeat"){
  const {error}=await admin.from("camera_gateway_agents").update({status:"online",last_seen_at:new Date().toISOString(),agent_version:String(body.agent_version||"").slice(0,40),capabilities:body.capabilities&&typeof body.capabilities==="object"?body.capabilities:{},updated_at:new Date().toISOString()}).eq("id",a.id);
  if(error)return json({error:"Heartbeat update failed"},500);
  return json({ok:true,agent_id:a.id,server_time:new Date().toISOString()});
 }
 if(action==="camera_probe"){
  const cameraId=String(body.camera_id||"");
  if(!/^[0-9a-f-]{36}$/i.test(cameraId))return json({error:"Valid camera_id required"},400);
  const online=body.online===true;
  const {data:c}=await admin.from("cameras").select("id").eq("id",cameraId).eq("organization_id",a.organization_id).maybeSingle();
  if(!c)return json({error:"Camera not found in gateway organization"},404);
  const {error}=await admin.from("cameras").update({connection_status:online?"online":"offline",last_seen_at:online?new Date().toISOString():null}).eq("id",cameraId).eq("organization_id",a.organization_id);
  if(error)return json({error:"Camera status update failed"},500);
  return json({ok:true,camera_id:cameraId,connection_status:online?"online":"offline"});
 }
 if(action==="event"){
  const cameraId=String(body.camera_id||""),type=String(body.event_type||""),allowed=new Set(["person_entered","person_exited","table_occupied","table_vacated","meal_dispatched","drink_dispatched","queue_detected"]),count=Number(body.event_count??1);
  if(!/^[0-9a-f-]{36}$/i.test(cameraId)||!allowed.has(type)||!Number.isInteger(count)||count<0||count>100000)return json({error:"Invalid camera event"},400);
  const {data:c}=await admin.from("cameras").select("id").eq("id",cameraId).eq("organization_id",a.organization_id).maybeSingle();if(!c)return json({error:"Camera not found in gateway organization"},404);
  const dt=body.occurred_at?new Date(String(body.occurred_at)):new Date();if(Number.isNaN(dt.getTime()))return json({error:"Invalid occurred_at"},400);
  const meta=body.metadata&&typeof body.metadata==="object"?body.metadata:{};
  const {error}=await admin.from("camera_events").insert({organization_id:a.organization_id,camera_id:cameraId,event_type:type,event_count:count,occurred_at:dt.toISOString(),metadata:meta});
  if(error)return json({error:"Event insert failed"},500);return json({ok:true});
 }
 return json({error:"Unsupported action"},400);
});