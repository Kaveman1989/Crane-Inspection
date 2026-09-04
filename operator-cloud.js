/* Cloud bridge for the operator workspace.
   v1.4.1: fetch assignments first, then cranes separately to avoid nested-RLS issues. */
(function(){
  function today(){ return new Date().toISOString().slice(0,10); }
  function assignmentIsCurrent(a){
    const t=today();
    return !!a.active && (!a.starts_on || a.starts_on <= t) && (!a.ends_on || a.ends_on >= t);
  }
  window.CRANE_OPERATOR_BOOT = async function(){
    const auth = await window.craneRequireAnyRole(['operator','executive']);
    if(!auth) return null;
    const params = new URLSearchParams(location.search);
    let craneId = params.get('crane');
    let cranes = [];
    let assignments = [];
    let cloud = window.craneAuthReady ? window.craneSupabase : null;

    if(cloud){
      if(auth.role==='executive'){
        const {data,error}=await cloud.from('cranes').select('*').eq('active',true).order('project');
        if(error) throw error;
        cranes=data||[];
      } else {
        // Fetch assignment rows directly. This avoids a nested cranes(*) query
        // being blocked by the crane table's RLS policy.
        const {data,error}=await cloud.from('crane_assignments')
          .select('id,crane_id,starts_on,ends_on,active')
          .eq('operator_id',auth.user.id)
          .eq('active',true);
        if(error) throw error;
        assignments=(data||[]).filter(assignmentIsCurrent);

        const ids=[...new Set(assignments.map(a=>a.crane_id).filter(Boolean))];
        if(ids.length){
          const {data:craneRows,error:craneError}=await cloud.from('cranes')
            .select('*').in('id',ids).eq('active',true).order('project');
          if(craneError) throw craneError;
          cranes=craneRows||[];
        }
      }

      if(!craneId || !cranes.some(c=>c.id===craneId)) craneId=cranes[0]?.id||null;
    } else {
      cranes=[{id:'demo-crane-1',owner:'Demo Company',lessee:'Demo Lessee',project:'Demo Project',site_address:'Demo Site',make:'Potain',model:'MDT 219',serial:'DEMO-001',active:true}];
      if(!craneId) craneId=cranes[0].id;
    }

    const crane=cranes.find(c=>c.id===craneId)||cranes[0];
    if(!crane){
      showAssignmentMessage(auth, assignments);
      return {auth,cranes:[],crane:null,assignments};
    }

    if(cloud){
      const {data:rows,error} = await cloud.from('inspections').select('inspection_date,data,status').eq('crane_id',crane.id).order('inspection_date');
      if(error) throw error;
      const draft={header:{craneOwner:crane.owner,lessee:crane.lessee,project:crane.project,siteAddress:crane.site_address,craneMake:crane.make,model:crane.model,serial:crane.serial},days:{},lastOperatorName:auth.profile.full_name||''};
      (rows||[]).forEach(r=>{ if(r.data && r.data.day) draft.days[r.inspection_date]=r.data.day; });
      try{ localStorage.setItem('crane-inspect:draft',JSON.stringify(draft)); }catch(e){}
    }

    window.CRANE_OPERATOR_CONTEXT={auth,cranes,crane,cloud,assignments,currentDate:null,
      setDate:function(k){this.currentDate=k;},
      refresh:()=>location.reload(),
      saveCurrent:async function(draft,date){
        if(!this.cloud) return true;
        const day=draft.days[date]; if(!day) return true;
        const c=day.checks||{}; const keys=Object.keys(c); const status=keys.length===0?'incomplete':(keys.length===ITEM_COUNT?'complete':'incomplete');
        const payload={crane_id:this.crane.id,operator_id:this.auth.user.id,inspection_date:date,data:{day:day,header:draft.header},status:status,updated_at:new Date().toISOString()};
        const {error}=await this.cloud.from('inspections').upsert(payload,{onConflict:'crane_id,inspection_date'});
        if(error){console.error(error);return false;} return true;
      }};
    injectOperatorBar(window.CRANE_OPERATOR_CONTEXT);
    return window.CRANE_OPERATOR_CONTEXT;
  };
  const ITEM_COUNT=29;
  function showAssignmentMessage(auth, assignments){
    const existing=document.getElementById('assignmentNotice'); if(existing) return;
    const header=document.querySelector('.nameplate');
    if(!header) { alert('No active crane assignment was found for this account.'); return; }
    const n=document.createElement('div'); n.id='assignmentNotice';
    n.style='margin:0 0 10px;padding:14px;background:#fff7e6;border:1px solid #e3c77b;border-radius:12px;color:#5d4614;font-size:13px;line-height:1.45';
    n.innerHTML='<b>No active crane assignment found.</b><br>Your Executive/Manager must assign a crane to this operator. If the assignment was just created, tap <b>Refresh assignments</b> below.';
    const b=document.createElement('button'); b.type='button'; b.textContent='Refresh assignments'; b.style='margin-top:9px;padding:9px 12px;border:0;border-radius:8px;background:#2e4759;color:white;font-weight:700'; b.onclick=()=>location.reload();
    n.appendChild(b); header.parentNode.insertBefore(n,header.nextSibling);
  }
  function injectOperatorBar(ctx){
    const header=document.querySelector('.nameplate'); if(!header || document.getElementById('operatorBar')) return;
    const bar=document.createElement('div');bar.id='operatorBar';bar.style='margin:0 0 10px;padding:10px 12px;background:#fffdf8;border:1px solid #dad5c7;border-radius:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const label=document.createElement('span');label.textContent=ctx.auth.role==='executive'?'Crane workspace':'Assigned crane';label.style='font-size:12px;font-weight:800;color:#2e4759';bar.appendChild(label);
    const select=document.createElement('select');select.style='flex:1;min-width:180px;padding:9px;border:1px solid #dad5c7;border-radius:8px';ctx.cranes.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=(c.project||'Crane')+' — '+(c.serial||c.model||'');if(c.id===ctx.crane.id)o.selected=true;select.appendChild(o)});select.onchange=()=>location.href='./operator.html?crane='+encodeURIComponent(select.value);bar.appendChild(select);
    const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh';refresh.style='padding:8px 10px;border:0;border-radius:8px;background:#e9e5da;color:#23262b;font-weight:700';refresh.onclick=()=>location.reload();bar.appendChild(refresh);
    const who=document.createElement('span');who.textContent=ctx.auth.profile.full_name||ctx.auth.user?.email||'Operator';who.style='font-size:11px;color:#726c5e';bar.appendChild(who);
    const out=document.createElement('button');out.type='button';out.textContent='Sign out';out.style='padding:8px 10px;border:0;border-radius:8px;background:#e9e5da;color:#23262b;font-weight:700';out.onclick=window.craneSignOut;bar.appendChild(out);
    header.parentNode.insertBefore(bar,header.nextSibling);
  }
})();
