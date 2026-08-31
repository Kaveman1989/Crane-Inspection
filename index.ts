import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response(JSON.stringify({error:"POST required"}), {status:405, headers:cors});

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return new Response(JSON.stringify({error:"Not authenticated"}), {status:401,headers:cors});

  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken:false, persistSession:false } });
  const token = authHeader.replace("Bearer ", "");
  const { data: { user: caller }, error: callerError } = await admin.auth.getUser(token);
  if (callerError || !caller) return new Response(JSON.stringify({error:"Invalid session"}), {status:401,headers:cors});

  const { data: profile } = await admin.from("profiles").select("role,active").eq("id", caller.id).single();
  if (!profile?.active || profile.role !== "executive") return new Response(JSON.stringify({error:"Executive access required"}), {status:403,headers:cors});

  let body:any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({error:"Invalid JSON"}), {status:400,headers:cors}); }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const full_name = String(body.full_name || "").trim();
  const role = body.role === "executive" ? "executive" : "operator";
  if (!email || !email.includes("@") || password.length < 8 || !full_name) return new Response(JSON.stringify({error:"Name, valid email and password of at least 8 characters are required"}), {status:400,headers:cors});

  const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm:true, user_metadata:{full_name} });
  if (createError || !created.user) return new Response(JSON.stringify({error:createError?.message || "Unable to create account"}), {status:400,headers:cors});

  const { error: profileError } = await admin.from("profiles").upsert({id:created.user.id, full_name, role, active:true}, {onConflict:"id"});
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return new Response(JSON.stringify({error:"Account created but profile setup failed: "+profileError.message}), {status:500,headers:cors});
  }

  return new Response(JSON.stringify({ok:true,user_id:created.user.id,email,role,full_name}), {status:200,headers:cors});
});
