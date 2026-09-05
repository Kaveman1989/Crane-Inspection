/* Crane Inspection operator cloud bridge v1.5
   Inspection-only operator workspace. Management/reporting lives in executive.html. */
(function(){
  function today(){ return new Date().toISOString().slice(0,10); }
  window.CRANE_OPERATOR_BOOT = async function(){
    const auth = await window.craneRequireAnyRole(['operator','executive']);
    if(!auth) return null;
    const params = new URLSearchParams(location.search);
    let craneId = params.get('crane');
    const cloud = window.craneAuthReady ? window.craneSupabase : null;
    let cranes=[], assignments=[];
    if(!cloud){
      cranes=[{id:'demo-crane-1',owner:'Demo Company',lessee:'Demo Lessee',project:'Demo Project',site_address:'Demo Site',make:'Potain',model:'MDT 219',serial:'DEMO-001',active:true}];
      craneId=craneId||cranes[0].id;
    } else if(auth.role==='executive'){
      const {data,error}=await cloud.from('cranes').select('*').eq('active',true).order('project');
      if(error) throw error; cranes=data||[];
      if(!craneId || !cranes.some(c=>c.id===craneId)) craneId=cranes[0]?.id||null;
    } else {
      const {data,error}=await cloud.rpc('get_my_assigned_cranes');
      if(error) throw new Error('Assigned crane lookup failed: '+error.message);
      const rows=data||[];
      assignments=rows.map(r=>({id:r.assignment_id,crane_id:r.crane_id,starts_on:r.starts_on,ends_on:r.ends_on,active:r.assignment_active}));
      cranes=rows.filter(r=>r.crane_active).map(r=>({id:r.crane_id,owner:r.owner,lessee:r.lessee,project:r.project,site_address:r.site_address,make:r.make,model:r.model,serial:r.serial,active:r.crane_active}));
      if(!craneId || !cranes.some(c=>c.id===craneId)) craneId=cranes[0]?.id||null;
    }
    const crane=cranes.find(c=>c.id===craneId)||cranes[0];
    if(!crane){
      showDiagnostic(auth, 'NO ASSIGNMENT', 'Supabase returned zero active assigned cranes.');
      return {auth,cloud,cranes:[],crane:null,assignments};
    }
    let rows=[];
    if(cloud){
      const {data,error}=await cloud.from('inspections').select('id,inspection_date,data,status,updated_at').eq('crane_id',crane.id).order('inspection_date');
      if(error) throw new Error('Inspection history lookup failed: '+error.message);
      rows=data||[];
    }
    const draft={header:{craneOwner:crane.owner||'',lessee:crane.lessee||'',project:crane.project||'',siteAddress:crane.site_address||'',craneMake:crane.make||'',model:crane.model||'',serial:crane.serial||''},days:{},lastOperatorName:auth.profile.full_name||''};
    rows.forEach(r=>{ if(r.data?.day) draft.days[r.inspection_date]=r.data.day; });
    try{ localStorage.setItem('crane-inspect:'+auth.user.id+':'+crane.id+':draft',JSON.stringify(draft)); }catch(e){}
    window.CRANE_OPERATOR_CONTEXT={auth,cloud,cranes,crane,assignments,currentDate:null,
      setDate(k){this.currentDate=k;}, refresh:()=>location.reload(),
      async saveCurrent(draft,date){
        if(!this.cloud) return true;
        const day=draft.days[date]; if(!day) return true;
        const c=day.checks||{}; const count=Object.keys(c).length;
        const status=count===29?'complete':'incomplete';
        const payload={crane_id:this.crane.id,operator_id:this.auth.user.id,inspection_date:date,data:{day:day,header:draft.header},status,updated_at:new Date().toISOString()};
        const {data,error}=await this.cloud.from('inspections').upsert(payload,{onConflict:'crane_id,inspection_date'}).select('id,inspection_date,status,updated_at').single();
        if(error){ console.error('Inspection save failed',error); const msg='Save failed: '+error.message; window.CRANE_LAST_SAVE_ERROR=msg; throw new Error(msg); }
        window.CRANE_LAST_SAVE_ERROR=''; return !!data;
      },
      async uploadPhoto(file,date){
        if(!this.cloud) return {demo:true};
        if(!file) throw new Error('Choose an image first.');
        if(!/^image\//.test(file.type)) throw new Error('Only image files are allowed.');
        if(file.size>10*1024*1024) throw new Error('Image must be 10 MB or smaller.');
        const {data:ins,error:insErr}=await this.cloud.from('inspections').select('id').eq('crane_id',this.crane.id).eq('inspection_date',date).maybeSingle();
        if(insErr) throw insErr;
        if(!ins) throw new Error('Save the inspection for this date before adding a photo.');
        const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
        const path=this.auth.user.id+'/'+ins.id+'/'+Date.now()+'.'+ext;
        const {error:upErr}=await this.cloud.storage.from('inspection-photos').upload(path,file,{upsert:false,contentType:file.type});
        if(upErr) throw upErr;
        const {data:photo,error:photoErr}=await this.cloud.from('inspection_photos').insert({inspection_id:ins.id,crane_id:this.crane.id,operator_id:this.auth.user.id,inspection_date:date,storage_path:path,file_name:file.name,mime_type:file.type}).select().single();
        if(photoErr) throw photoErr;
        return photo;
      }
    };
    injectOperatorBar(window.CRANE_OPERATOR_CONTEXT);
    return window.CRANE_OPERATOR_CONTEXT;
  };
  function showDiagnostic(auth,title,detail){
    const header=document.querySelector('.nameplate'); if(!header)return;
    const n=document.createElement('div'); n.id='assignmentNotice';
    n.style='margin:0 0 10px;padding:14px;background:#fff7e6;border:1px solid #e3c77b;border-radius:12px;color:#5d4614;font-size:13px;line-height:1.5';
    n.innerHTML='<b>'+title+'</b><br>'+detail+'<br><small>User ID: '+(auth.user?.id||'demo')+'</small>';
    const b=document.createElement('button');b.type='button';b.textContent='Refresh assignments';b.style='margin-top:9px;padding:9px 12px;border:0;border-radius:8px;background:#2e4759;color:white;font-weight:700';b.onclick=()=>location.reload();n.appendChild(b);header.parentNode.insertBefore(n,header.nextSibling);
  }
  function injectOperatorBar(ctx){
    const header=document.querySelector('.nameplate');if(!header||document.getElementById('operatorBar'))return;
    const bar=document.createElement('div');bar.id='operatorBar';bar.style='margin:0 0 10px;padding:10px 12px;background:#fffdf8;border:1px solid #dad5c7;border-radius:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
    const label=document.createElement('span');label.textContent=ctx.auth.role==='executive'?'Crane workspace':'Assigned crane';label.style='font-size:12px;font-weight:800;color:#2e4759';bar.appendChild(label);
    const select=document.createElement('select');select.style='flex:1;min-width:180px;padding:9px;border:1px solid #dad5c7;border-radius:8px';ctx.cranes.forEach(c=>{const o=document.createElement('option');o.value=c.id;o.textContent=(c.project||'Crane')+' — '+(c.serial||c.model||'');if(c.id===ctx.crane.id)o.selected=true;select.appendChild(o)});select.onchange=()=>location.href='./operator.html?crane='+encodeURIComponent(select.value);bar.appendChild(select);
    const refresh=document.createElement('button');refresh.type='button';refresh.textContent='Refresh';refresh.style='padding:8px 10px;border:0;border-radius:8px;background:#e9e5da;color:#23262b;font-weight:700';refresh.onclick=()=>location.reload();bar.appendChild(refresh);
    const who=document.createElement('span');who.textContent=ctx.auth.profile.full_name||ctx.auth.user?.email||'Operator';who.style='font-size:11px;color:#726c5e';bar.appendChild(who);
    const out=document.createElement('button');out.type='button';out.textContent='Sign out';out.style='padding:8px 10px;border:0;border-radius:8px;background:#e9e5da;color:#23262b;font-weight:700';out.onclick=window.craneSignOut;bar.appendChild(out);
    header.parentNode.insertBefore(bar,header.nextSibling);
  }
})();