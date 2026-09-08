/* Shared Supabase authentication helper for Crane Inspection 1.5.3.
   Permissions are explicit: can_manage and can_inspect. Executive/manager accounts
   get both by default; an account can be granted both without changing its identity. */
(function(){
  const cfg = window.CRANE_CONFIG || {};
  window.craneAuthReady = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  if(window.craneAuthReady){ window.craneSupabase = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey); }

  function canInspect(p){ return !!(p && p.active && (p.can_inspect === true || p.role === 'operator' || p.role === 'executive' || p.role === 'manager')); }
  function canManage(p){ return !!(p && p.active && (p.can_manage === true || p.role === 'executive' || p.role === 'manager')); }

  async function getContext(){
    if(!window.craneAuthReady) return null;
    const {data:{session}} = await window.craneSupabase.auth.getSession();
    if(!session) return null;
    const {data:profile,error} = await window.craneSupabase.from('profiles').select('*').eq('id',session.user.id).single();
    if(error || !profile) return null;
    return {demo:false,user:session.user,profile,canInspect:canInspect(profile),canManage:canManage(profile),role:profile.role};
  }

  window.craneRequireRole = async function(role){
    if(!window.craneAuthReady){
      return {demo:true,role,user:null,profile:{role,full_name:'Demo User',active:true,can_inspect:true,can_manage:role==='executive'}};
    }
    const ctx = await getContext();
    if(!ctx){ location.href='./index.html'; return null; }
    const allowed = role === 'operator' ? ctx.canInspect : ctx.canManage;
    if(!allowed){ alert('This account does not have access to this area.'); location.href='./index.html'; return null; }
    return ctx;
  };

  window.craneRequireAnyRole = async function(roles){
    roles = Array.isArray(roles) ? roles : [roles];
    if(!window.craneAuthReady){
      return {demo:true,role:roles[0],user:null,profile:{role:roles[0],full_name:'Demo User',active:true,can_inspect:true,can_manage:roles.includes('executive')}};
    }
    const ctx = await getContext();
    if(!ctx){ location.href='./index.html'; return null; }
    const allowed = (roles.includes('operator') && ctx.canInspect) || (roles.includes('executive') && ctx.canManage) || (roles.includes('manager') && ctx.canManage);
    if(!allowed){ alert('This account does not have access to this area.'); location.href='./index.html'; return null; }
    return ctx;
  };

  window.craneSignOut = async function(){ if(window.craneAuthReady) await window.craneSupabase.auth.signOut(); location.href='./index.html'; };
})();
