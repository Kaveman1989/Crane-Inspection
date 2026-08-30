/* Shared Supabase authentication helper for Crane Inspection 1.3. */
(function(){
  const cfg = window.CRANE_CONFIG || {};
  window.craneAuthReady = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  if(window.craneAuthReady){ window.craneSupabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); }
  window.craneRequireRole = async function(role){
    if(!window.craneAuthReady) return {demo:true, role:role, user:null, profile:{role:role,full_name:'Demo User'}};
    const {data:{session}} = await window.craneSupabase.auth.getSession();
    if(!session){ location.href='./index.html'; return null; }
    const {data:profile,error} = await window.craneSupabase.from('profiles').select('*').eq('id',session.user.id).single();
    if(error || !profile || !profile.active || profile.role !== role){ alert('This account does not have access to this area.'); await window.craneSupabase.auth.signOut(); location.href='./index.html'; return null; }
    return {demo:false,role:profile.role,user:session.user,profile:profile};
  };
  window.craneSignOut = async function(){ if(window.craneAuthReady) await window.craneSupabase.auth.signOut(); location.href='./index.html'; };
})();
