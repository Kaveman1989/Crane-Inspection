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
        // Use a SECURITY DEFINER RPC so the operator gets the assigned crane
        // in one trusted query. This avoids RLS/nested-relationship filtering
        // between crane_assignments and cranes.
        let rpcError=null;
        const rpc=await cloud.rpc('get_my_assigned_cranes');
        rpcError=rpc.error;
        if(!rpcError){
          const rows=rpc.data||[];
          assignments=rows.map(r=>({id:r.assignment_id,crane_id:r.crane_id,starts_on:r.starts_on,ends_on:r.ends_on,active:r.assignment_active}));
          cranes=rows.filter(r=>r.crane_active).map(r=>({
            id:r.crane_id,owner:r.owner,lessee:r.lessee,project:r.project,site_address:r.site_address,
            make:r.make,model:r.model,serial:r.serial,active:r.crane_active
          }));
        } else {
          // Fallback for databases where the RPC has not been installed yet.
          console.warn('Assigned-crane RPC unavailable; using direct RLS query:',rpcError);
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
      const {data:rows,error} = await cloud.from('inspections').select('id,inspection_date,data,status').eq('crane_id',crane.id).order('inspection_date');
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
        const {data:saved,error}=await this.cloud.from('inspections').upsert(payload,{onConflict:'crane_id,inspection_date'}).select('id').single();
        if(error){console.error(error);return false;}
        if(saved && day) day._inspectionId=saved.id;
        return true;
      },
      getPhotos:async function(date){
        if(!this.cloud) return [];
        const {data,error}=await this.cloud.from('inspection_photos').select('id,storage_path,file_name,mime_type,created_at').eq('crane_id',this.crane.id).eq('inspection_date',date).order('created_at');
        if(error){console.error(error);return [];}
        const photos=data||[];
        for(const photo of photos){
          const r=await this.cloud.storage.from('inspection-photos').createSignedUrl(photo.storage_path,3600);
          photo.url=r.data?.signedUrl||'';
        }
        return photos;
      },
      uploadPhoto:async function(date,file){
        if(!this.cloud || !file) return null;
        let day=draft?.days?.[date];
        let inspectionId=day?._inspectionId;
        if(!inspectionId){
          const ok=await this.saveCurrent(draft,date);
          if(!ok) return null;
          const q=await this.cloud.from('inspections').select('id').eq('crane_id',this.crane.id).eq('inspection_date',date).single();
          inspectionId=q.data?.id;
        }
        if(!inspectionId) return null;
        const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
        const path=this.crane.id+'/'+date+'/'+crypto.randomUUID()+'.'+ext;
        const up=await this.cloud.storage.from('inspection-photos').upload(path,file,{contentType:file.type||'image/jpeg',upsert:false});
        if(up.error){console.error(up.error);return null;}
        const ins=await this.cloud.from('inspection_photos').insert({inspection_id:inspectionId,crane_id:this.crane.id,operator_id:this.auth.user.id,inspection_date:date,storage_path:path,file_name:file.name||'photo',mime_type:file.type||'image/jpeg'}).select('id,storage_path,file_name,mime_type,created_at').single();
        if(ins.error){console.error(ins.error);await this.cloud.storage.from('inspection-photos').remove([path]);return null;}
        const signed=await this.cloud.storage.from('inspection-photos').createSignedUrl(path,3600);
        return {...ins.data,url:signed.data?.signedUrl||''};
      },
      deletePhoto:async function(photo){
        if(!this.cloud || !photo) return false;
        const r=await this.cloud.from('inspection_photos').delete().eq('id',photo.id);
        if(r.error){console.error(r.error);return false;}
        await this.cloud.storage.from('inspection-photos').remove([photo.storage_path]);
        return true;
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
