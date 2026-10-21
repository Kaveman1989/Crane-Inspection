(function(){
  'use strict';

  const $=id=>document.getElementById(id);
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize=value=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const productReferences={
    'potain-igo-t-85-a':'https://www.manitowoc.com/potain/self-erecting-cranes/igo-t-85',
    'potain-igo-t-130':'https://www.manitowoc.com/potain/self-erecting-cranes/igo-t-130',
    'potain-mr-130':'https://www.manitowoc.com/manuals',
    'potain-mdt-219':'https://www.manitowoc.com/potain/top-slewing-cranes'
  };
  let auth=null,cloud=null,cranes=[],models=[],documents=[],parts=[],requests=[],craneInspectionHistory=[],craneInspectionMedia=[],cranePartsHistory=[],selectedCraneId='',modelKey='',basket=[],partsSearchVersion=0,partsSearchTimer=null;

  async function init(){
    try{
      setupSectionTabs();
      auth=await window.craneRequireRole('technician');
      if(!auth)return;
      cloud=window.craneAuthReady?window.craneSupabase:null;
      $('signoutBtn').onclick=window.craneSignOut;
      $('refreshBtn').onclick=()=>location.reload();
      $('craneSearch').addEventListener('input',renderCraneList);
      $('craneFilter').addEventListener('change',event=>selectCrane(event.target.value));
      $('partSearch').addEventListener('input',()=>{clearTimeout(partsSearchTimer);partsSearchTimer=setTimeout(loadParts,250)});
      const modelMessage=document.createElement('span');
      modelMessage.id='modelMessage';
      modelMessage.className='muted';
      $('partSearch').insertAdjacentElement('afterend',modelMessage);
      const manitowocSearchButton=document.createElement('button');
      manitowocSearchButton.type='button';
      manitowocSearchButton.id='manitowocPartsSearch';
      manitowocSearchButton.className='button';
      manitowocSearchButton.textContent='Search Manitowoc parts';
      manitowocSearchButton.title='Open Manitowoc Potain parts search in a new tab';
      manitowocSearchButton.onclick=()=>searchManitowocParts();
      modelMessage.insertAdjacentElement('afterend',manitowocSearchButton);
      $('searchAllModels').addEventListener('change',loadParts);
      $('systemFilter').addEventListener('change',renderParts);
      $('fitmentFilter').addEventListener('change',renderParts);
      $('addFreePart').onclick=addFreePart;
      $('submitRequest').onclick=submitRequest;
      if(cloud){
        const [craneResult,modelResult]=await Promise.all([
          cloud.from('cranes').select('id,owner,lessee,project,site_address,make,model,serial,active').eq('active',true).order('project'),
          cloud.from('crane_model_catalog').select('model_key,manufacturer,model_name,aliases,identity_status,verification_note').order('model_name')
        ]);
        if(craneResult.error)throw craneResult.error;
        if(modelResult.error)throw modelResult.error;
        cranes=craneResult.data||[];models=modelResult.data||[];
      }else{
        models=[
          {model_key:'potain-igo-t-85-a',manufacturer:'Potain',model_name:'Igo T 85 A',aliases:['Igo T 85','Igo T85','Igo T85A'],identity_status:'confirmed_name'},
          {model_key:'potain-igo-t-130',manufacturer:'Potain',model_name:'Igo T 130',aliases:['Igo T130'],identity_status:'confirmed_name'},
          {model_key:'potain-mr-130',manufacturer:'Potain',model_name:'MR 130',aliases:['MR130'],identity_status:'verify_nameplate'},
          {model_key:'potain-mdt-219',manufacturer:'Potain',model_name:'MDT 219',aliases:['MDT219'],identity_status:'verify_nameplate'}
        ];
        cranes=[
          {id:'demo-igo-t-85',owner:'Demo Fleet',project:'Yard crane',site_address:'Demo site',make:'Potain',model:'Igo T 85 A',serial:'DEMO-T85',active:true},
          {id:'demo-mr-130',owner:'Demo Fleet',project:'Yard crane',site_address:'Demo site',make:'Potain',model:'MR 130',serial:'DEMO-MR130',active:true},
          {id:'demo-igo-t-130',owner:'Demo Fleet',project:'Yard crane',site_address:'Demo site',make:'Potain',model:'Igo T 130',serial:'DEMO-T130',active:true},
          {id:'demo-mdt-219',owner:'Demo Fleet',project:'Yard crane',site_address:'Demo site',make:'Potain',model:'MDT 219',serial:'DEMO-MDT219',active:true}
        ];
        $('appStatus').textContent='Demo mode: requests stay in this browser and are not sent to Supabase.';
      }
      renderCraneList();
      if(cranes.length)selectCrane(cranes[0].id);
      else $('appStatus').textContent='No active cranes are available to this account.';
    }catch(error){$('appStatus').textContent='Lookup failed: '+(error.message||error)}
  }

  function setupSectionTabs(){
    const details=$('craneDetails');
    const headings=Array.from(details.children).filter(element=>element.tagName==='H3');
    if(!headings.length)return;
    const labels={
      history:'History & media',
      references:'Reference documents',
      catalog:'Parts catalog',
      request:'Parts request',
      requestHistory:'Request history'
    };
    const sectionByHeading={
      'Crane history & media':'history',
      'Parts request history':'requestHistory',
      'Reference documents':'references',
      'Parts catalog':'catalog',
      'Parts request':'request',
      'My recent requests':'requestHistory'
    };
    const navigation=document.createElement('nav');
    navigation.className='tech-tabs';
    navigation.setAttribute('aria-label','Crane detail sections');
    navigation.setAttribute('role','tablist');
    const panels=new Map();
    for(const heading of headings){
      const section=sectionByHeading[heading.textContent.trim()];
      if(!section)continue;
      let panel=panels.get(section);
      if(!panel){
        panel=document.createElement('section');
        panel.className='tech-tab-panel';
        panel.id='tech-tab-'+section;
        panel.setAttribute('role','tabpanel');
        panel.setAttribute('tabindex','0');
        panels.set(section,panel);
      }
      details.insertBefore(panel,heading);
      panel.append(heading);
      let sibling=panel.nextSibling;
      while(sibling&&!(sibling.nodeType===1&&(sibling.tagName==='H3'||sibling.classList.contains('page-note')))){
        const next=sibling.nextSibling;
        panel.append(sibling);
        sibling=next;
      }
    }
    const selectTab=section=>{
      for(const button of navigation.querySelectorAll('[role="tab"]')){
        const active=button.dataset.section===section;
        button.setAttribute('aria-selected',String(active));
        button.tabIndex=active?0:-1;
      }
      for(const [key,panel] of panels)panel.hidden=key!==section;
    };
    for(const [section,label] of Object.entries(labels)){
      if(!panels.has(section))continue;
      const button=document.createElement('button');
      button.type='button';
      button.id='tech-tab-button-'+section;
      button.setAttribute('role','tab');
      button.setAttribute('aria-controls','tech-tab-'+section);
      button.dataset.section=section;
      button.textContent=label;
      button.addEventListener('click',()=>selectTab(section));
      button.addEventListener('keydown',event=>{
        if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
        event.preventDefault();
        const buttons=Array.from(navigation.querySelectorAll('[role="tab"]'));
        const current=buttons.indexOf(button);
        const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
        buttons[next].focus();
        buttons[next].click();
      });
      navigation.append(button);
    }
    for(const [section,panel] of panels)panel.setAttribute('aria-labelledby','tech-tab-button-'+section);
    details.insertBefore(navigation,panels.values().next().value);
    selectTab('history');
  }

  function findModel(crane){
    const make=normalize(crane.make),model=normalize(crane.model);
    return models.find(item=>normalize(item.manufacturer)===make&&[item.model_name,...(item.aliases||[])].some(alias=>normalize(alias)===model))||null;
  }

  function renderCraneList(){
    const query=normalize($('craneSearch').value);
    const matched=cranes.filter(crane=>!query||[crane.make,crane.model,crane.serial,crane.project,crane.site_address,crane.owner,crane.lessee].some(value=>normalize(value).includes(query)));
    $('craneCount').textContent='('+matched.length+')';
    $('craneResults').innerHTML=matched.length?matched.map(crane=>`<button type="button" class="crane-option ${crane.id===selectedCraneId?'selected':''}" data-crane-id="${escapeHtml(crane.id)}"><strong>${escapeHtml(crane.make)} ${escapeHtml(crane.model)}</strong><span>${escapeHtml(crane.serial||'No serial')} · ${escapeHtml(crane.project||'No project')}</span><span>${escapeHtml(crane.site_address||'Site not set')}</span></button>`).join(''):'<div class="empty">No active cranes match that search.</div>';
    $('craneResults').querySelectorAll('[data-crane-id]').forEach(button=>button.addEventListener('click',()=>selectCrane(button.dataset.craneId)));
    $('craneFilter').innerHTML='<option value="">Choose an active crane</option>'+cranes.map(crane=>`<option value="${escapeHtml(crane.id)}">${escapeHtml(crane.serial||crane.model||crane.project)} · ${escapeHtml(crane.project||'')}</option>`).join('');
    $('craneFilter').value=selectedCraneId;
  }

  async function selectCrane(craneId){
    const crane=cranes.find(item=>item.id===craneId);
    if(!crane)return;
    selectedCraneId=crane.id;modelKey='';documents=[];parts=[];basket=[];craneInspectionHistory=[];craneInspectionMedia=[];cranePartsHistory=[];
    $('partSearch').value='';$('searchAllModels').checked=false;$('systemFilter').value='';$('fitmentFilter').value='any';$('partsSearchStatus').textContent='';
    $('emptyLookup').classList.add('hidden');$('craneDetails').classList.remove('hidden');
    $('craneTitle').textContent=(crane.make||'Crane')+' '+(crane.model||'');
    $('craneIdentity').innerHTML=[['Serial',crane.serial],['Project',crane.project],['Owner',crane.owner],['Lessee',crane.lessee],['Site',crane.site_address]].map(([label,value])=>`<div class="datum"><span>${label}</span><b>${escapeHtml(value||'Not recorded')}</b></div>`).join('');
    const model=findModel(crane);modelKey=model?.model_key||'';
    if(!model){
      $('identityNote').innerHTML='<div class="warning">No exact model match in the lookup catalog. Confirm the make and model from the crane nameplate. You can still submit a typed parts request for review.</div>';
      $('modelMessage').textContent='Unmatched model';
    }else if(model.identity_status!=='confirmed_name'){
      $('identityNote').innerHTML=`<div class="warning">${escapeHtml(model.verification_note||'Confirm the exact model designation from the crane nameplate before using this catalog.')}</div>`;
      $('modelMessage').textContent='Nameplate confirmation needed';
    }else{
      $('identityNote').innerHTML='';$('modelMessage').textContent='Catalog: '+model.model_name;
    }
    renderCraneList();renderBasket();
    try{
      await Promise.all([loadDocuments(),loadParts(),loadCraneHistory()]);
      await renderMyRequests();
    }catch(error){$('appStatus').textContent='Crane lookup did not fully load: '+(error.message||error)}
  }

  async function loadDocuments(){
    const crane=cranes.find(item=>item.id===selectedCraneId);
    const isPotain=normalize(crane?.make)==='potain';
    const documentModelKeys=[modelKey,...(isPotain?['potain-all-models']:[])].filter(Boolean);
    if(!documentModelKeys.length){$('documents').innerHTML='<div class="empty">No manufacturer reference is configured for this crane make.</div>';return}
    if(!cloud){
      const modelUrl=productReferences[modelKey];
      const links=[...(modelUrl?[{title:'Model product/reference page',url:modelUrl}]:[]),...(isPotain?[{title:'All Potain models — manuals portal',url:'https://www.manitowoc.com/manuals'}]:[])];
      $('documents').innerHTML=links.map(link=>`<div class="doc"><div class="doc-title">${escapeHtml(link.title)}</div><span class="badge">Reference only</span><p class="muted">Use the crane’s serial-specific manufacturer manual for operation, maintenance, and parts.</p><a href="${link.url}" target="_blank" rel="noopener noreferrer">Open official Potain resource</a></div>`).join('');
      return;
    }
    $('documents').innerHTML='<div class="empty">Loading references…</div>';
    const {data,error}=await cloud.from('crane_reference_documents').select('*').in('model_key',documentModelKeys).order('document_type').order('title');
    if(error)throw error;
    documents=data||[];
    if(!documents.length){const url=productReferences[modelKey]||'https://www.manitowoc.com/manuals';$('documents').innerHTML=`<div class="doc"><div class="doc-title">No serial-specific documents registered yet</div><span class="badge pending">Verify model and serial</span><p class="muted">Use the manufacturer portal to find the current instructions and parts documents.</p><a href="${url}" target="_blank" rel="noopener noreferrer">Open Manitowoc manuals portal</a></div>`;return}
    const links=await Promise.all(documents.map(async doc=>({doc,url:await documentUrl(doc)})));
    $('documents').innerHTML=links.map(({doc,url})=>`<div class="doc"><div class="doc-title">${escapeHtml(doc.title)}</div><span class="badge">${escapeHtml(doc.model_key==='potain-all-models'?'All Potain models':doc.document_type.replaceAll('_',' '))}</span><span class="badge ${doc.verification_status==='serial_specific'?'verified':'pending'}">${escapeHtml(doc.verification_status.replaceAll('_',' '))}</span>${doc.revision?`<span class="badge">Rev ${escapeHtml(doc.revision)}</span>`:''}${doc.serial_range?`<p class="muted">Serial range: ${escapeHtml(doc.serial_range)}</p>`:''}${doc.notes?`<p class="muted">${escapeHtml(doc.notes)}</p>`:''}${url?`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open document</a>`:'<span class="muted">Document link unavailable.</span>'}</div>`).join('');
  }

  async function documentUrl(doc){
    if(doc.storage_path){const {data,error}=await cloud.storage.from('technician-reference-files').createSignedUrl(doc.storage_path,1800);return error?'':data.signedUrl}
    return safeHttpUrl(doc.source_url);
  }

  async function fetchAllRows(queryFactory){
    const rows=[];let offset=0;const pageSize=1000;
    while(true){
      const {data,error}=await queryFactory().range(offset,offset+pageSize-1);
      if(error)throw error;
      const page=data||[];rows.push(...page);
      if(page.length<pageSize)return rows;
      offset+=pageSize;
    }
  }

  async function loadCraneHistory(){
    if(!cloud){
      $('craneHistoryStatus').textContent='Demo mode: live inspection records and uploaded media load after sign-in with Supabase.';
      $('craneInspectionHistory').innerHTML='<div class="empty">No demo inspection history.</div>';
      $('craneMedia').innerHTML='<div class="empty">No demo media.</div>';
      $('cranePartsHistory').innerHTML='<div class="empty">No demo parts-request history.</div>';
      return;
    }
    [craneInspectionHistory,craneInspectionMedia,cranePartsHistory]=await Promise.all([
      fetchAllRows(()=>cloud.from('inspections').select('id,inspection_date,data,status,updated_at').eq('crane_id',selectedCraneId).order('inspection_date',{ascending:false})),
      fetchAllRows(()=>cloud.from('inspection_photos').select('id,inspection_id,inspection_date,storage_path,file_name,mime_type,created_at').eq('crane_id',selectedCraneId).order('created_at',{ascending:false})),
      fetchAllRows(()=>cloud.from('parts_request_history').select('id,request_id,actor_id,event_type,old_status,new_status,notes,created_at').eq('crane_id',selectedCraneId).order('created_at',{ascending:false}))
    ]);
    renderCraneHistory();
  }

  async function renderCraneHistory(){
    const inspections=craneInspectionHistory;
    $('craneHistoryStatus').textContent=`${inspections.length} inspection record(s) · ${craneInspectionMedia.length} photo/video file(s) · ${cranePartsHistory.length} parts-history event(s)`;
    $('craneInspectionHistory').innerHTML=inspections.length?inspections.map(inspection=>{
      const checks=inspection.data?.day?.checks||{},faults=Object.values(checks).filter(value=>value==='fault').length;
      return `<div class="doc"><div class="doc-title">${escapeHtml(inspection.inspection_date)}</div><span class="badge">${escapeHtml(inspection.status)}</span><span class="badge">${Object.keys(checks).length}/29 checks</span><span class="badge ${faults?'pending':'verified'}">${faults} fault(s)</span></div>`;
    }).join(''):'<div class="empty">No inspection history for this crane.</div>';
    const mediaCards=await Promise.all(craneInspectionMedia.map(async media=>{
      const {data,error}=await cloud.storage.from('inspection-photos').createSignedUrl(media.storage_path,1800);
      if(error)return `<div class="doc"><div class="doc-title">${escapeHtml(media.file_name||'Media')}</div><p class="muted">Media unavailable.</p></div>`;
      const url=escapeHtml(data.signedUrl),isVideo=(media.mime_type||'').startsWith('video/');
      const preview=isVideo?`<video controls playsinline preload="metadata" src="${url}" style="width:100%;max-height:360px"></video>`:`<img src="${url}" alt="Crane inspection media" style="width:100%;max-height:360px;object-fit:contain">`;
      return `<div class="doc">${preview}<div class="doc-title">${escapeHtml(media.file_name||'Inspection media')}</div><span class="badge">${isVideo?'Video':'Photo'}</span><span class="badge">${escapeHtml(media.inspection_date||'')}</span></div>`;
    }));
    $('craneMedia').innerHTML=mediaCards.length?mediaCards.join(''):'<div class="empty">No photos or videos uploaded for this crane.</div>';
    $('cranePartsHistory').innerHTML=cranePartsHistory.length?cranePartsHistory.map(event=>`<div class="doc"><div class="doc-title">${escapeHtml(event.event_type.replaceAll('_',' '))}${event.old_status?`: ${escapeHtml(event.old_status)} → ${escapeHtml(event.new_status)}`:''}</div><span class="badge">${escapeHtml(new Date(event.created_at).toLocaleString())}</span>${event.notes?`<p class="muted">${escapeHtml(event.notes)}</p>`:''}</div>`).join(''):'<div class="empty">No parts-request history for this crane.</div>';
  }

  function safeHttpUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return''}}

  function searchManitowocParts(reference){
    const searchTerm=String(reference||$('freePartNumber').value.trim()||$('partSearch').value.trim()).trim();
    if(!searchTerm){$('partsSearchStatus').textContent='Enter a part reference or search term before opening Manitowoc parts search.';$('freePartNumber').focus();return}
    const url=new URL('https://www.parts.manitowoc.com/Search/Simple');
    url.searchParams.set('RestrictToCategoryId','6');
    url.searchParams.set('SearchTerm',searchTerm);
    window.open(url.toString(),'_blank','noopener,noreferrer');
    $('partsSearchStatus').textContent='Opened Manitowoc Potain parts search in a new tab. The portal primarily searches part references.';
  }

  async function loadParts(){
    const searchVersion=++partsSearchVersion;
    const searchAllModels=$('searchAllModels').checked;
    if(!modelKey&&!searchAllModels){parts=[];$('partsSearchStatus').textContent='This crane model is not mapped. Enable “Search other models” to view unverified catalog candidates.';renderParts();return}
    if(!cloud){parts=[];$('partsSearchStatus').textContent='Demo mode has no imported parts data.';renderParts();return}
    const rawQuery=$('partSearch').value.trim().replace(/[%_(),\\]/g,'').slice(0,80);
    $('partsSearchStatus').textContent=rawQuery?'Searching the parts catalog…':'Loading model catalog…';
    try{
      const fields=['part_number','description','system_name','source_reference'];
      let results=[];
      if(rawQuery){
        const searches=fields.map(field=>{
          let query=cloud.from('crane_parts_catalog').select('*').eq('active',true).ilike(field,'%'+rawQuery+'%').order('part_number').limit(30);
          if(!searchAllModels)query=query.eq('model_key',modelKey);
          return query;
        });
        const exactPartNumber=cloud.from('crane_parts_catalog').select('*').eq('active',true).ilike('part_number',rawQuery).limit(10);
        const partNumberPrefix=cloud.from('crane_parts_catalog').select('*').eq('active',true).ilike('part_number',rawQuery+'%').order('part_number').limit(20);
        searches.push(searchAllModels?exactPartNumber:exactPartNumber.eq('model_key',modelKey));
        searches.push(searchAllModels?partNumberPrefix:partNumberPrefix.eq('model_key',modelKey));
        if(searchAllModels){
            $('partsSearchStatus').textContent=parts.length?`Found ${parts.length} catalog candidate${parts.length===1?'':'s'}. ${searchAllModels?'Other-model hits need fitment confirmation.':'Results are limited to this crane model.'}`:'No indexed catalog records match. Try a broader term or search other models.';
          const matchingModels=models.filter(model=>normalize(model.model_name).includes(normalize(rawQuery))||normalize(model.manufacturer+' '+model.model_name).includes(normalize(rawQuery))).map(model=>model.model_key);
          if(matchingModels.length)searches.push(cloud.from('crane_parts_catalog').select('*').eq('active',true).in('model_key',matchingModels).order('part_number').limit(30));
        }
        const responses=await Promise.all(searches);
        const failed=responses.find(response=>response.error);
        if(failed)throw failed.error;
        results=responses.flatMap(response=>response.data||[]);
      }else{
        let query=cloud.from('crane_parts_catalog').select('*').eq('active',true).order('model_key').order('system_name').order('part_number').limit(60);
        if(!searchAllModels)query=query.eq('model_key',modelKey);
        const {data,error}=await query;
        if(error)throw error;
        results=data||[];
      }
      if(searchVersion!==partsSearchVersion)return;
      parts=[...new Map(results.map(part=>[part.id,part])).values()];
      $('partsSearchStatus').textContent=parts.length?(searchAllModels?'Searching all model catalogs; other-model hits are candidates only.':'Showing model catalog matches.'):'No indexed catalog records match. Try a broader term or search other models.';
      renderParts();
    }catch(error){
      if(searchVersion!==partsSearchVersion)return;
      parts=[];$('partsSearchStatus').textContent='Parts search failed: '+(error.message||error);renderParts();
    }
  }

  function partFitment(part){
    if(part.model_key!==modelKey)return'other-model';
    const crane=cranes.find(item=>item.id===selectedCraneId);
    const serials=Array.isArray(part.applicable_serials)?part.applicable_serials:[];
    return part.fitment_status==='verified'&&(serials.includes('*')||!!crane?.serial&&serials.includes(crane.serial))?'verified':'review';
  }

  function renderParts(){
    const system=$('systemFilter').value;
    const fitment=$('fitmentFilter').value;
    const systems=[...new Set(parts.map(part=>part.system_name).filter(Boolean))].sort((left,right)=>left.localeCompare(right));
    const selectedSystem=systems.includes(system)?system:'';
    $('systemFilter').innerHTML='<option value="">All systems</option>'+systems.map(value=>`<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
    $('systemFilter').value=selectedSystem;
    const matched=parts.filter(part=>(!selectedSystem||part.system_name===selectedSystem)&&(fitment==='any'||partFitment(part)===fitment));
    const query=normalize($('partSearch').value);
    const searchRank=part=>{
      if(!query)return 0;
      const number=normalize(part.part_number),description=normalize(part.description),systemName=normalize(part.system_name);
      if(number===query)return 0;
      if(number.startsWith(query))return 1;
      if(description.startsWith(query)||systemName.startsWith(query))return 2;
      return 3;
    };
    const fitmentRank={verified:0,review:1,'other-model':2};
    matched.sort((left,right)=>searchRank(left)-searchRank(right)||fitmentRank[partFitment(left)]-fitmentRank[partFitment(right)]||left.part_number.localeCompare(right.part_number));
    const modelName=part=>models.find(model=>model.model_key===part.model_key)?.model_name||part.model_key;
    const emptyResults='<div class="empty">No indexed parts match these filters.</div><p class="muted">Check the manufacturer’s parts resources or use the crane’s serial-specific parts book: <a href="https://www.manitowoc.com/parts" target="_blank" rel="noopener noreferrer">Manitowoc parts and services</a> · <a href="https://www.manitowocdirect.com/Authentication/Login" target="_blank" rel="noopener noreferrer">Manitowoc Direct</a>. Parts found outside this catalog still need exact model and serial verification.</p>';
    $('parts').innerHTML=matched.length?matched.map(part=>{
      const partFitmentStatus=partFitment(part);
      const label=partFitmentStatus==='verified'?'Verified for this serial':partFitmentStatus==='review'?'Confirm serial applicability':'Other model; fitment not confirmed';
      return `<div class="part"><div class="part-row"><div><strong>${escapeHtml(part.part_number||'No part number')}</strong> ${part.system_name?`<span class="muted">· ${escapeHtml(part.system_name)}</span>`:''}<div>${escapeHtml(part.description)}</div><span class="badge ${partFitmentStatus==='verified'?'verified':'pending'}">${label}</span><span class="badge">${escapeHtml(modelName(part))}</span>${part.serial_range?`<span class="badge">Serial range: ${escapeHtml(part.serial_range)}</span>`:''}${part.source_reference?`<div class="muted">Source: ${escapeHtml(part.source_reference)}</div>`:''}</div><button type="button" data-add-part="${escapeHtml(part.id)}">${partFitmentStatus==='verified'?'Add to request':'Request verification'}</button></div></div>`;
    }).join(''):emptyResults;
    $('parts').querySelectorAll('[data-add-part]').forEach(button=>button.addEventListener('click',()=>addCatalogPart(button.dataset.addPart)));
  }

  function addCatalogPart(partId){
    const part=parts.find(item=>item.id===partId);if(!part)return;
    const verified=partFitment(part)==='verified';
    basket.push({catalog_part_id:verified?part.id:null,part_number:part.part_number,description:part.description,quantity:1,notes:verified?'':'Catalog candidate only; confirm exact model and serial-specific fitment before ordering.'});
    renderBasket();
  }

  function addFreePart(){
    const description=$('freeDescription').value.trim(),quantity=Number($('freeQuantity').value);
    if(!description||!Number.isInteger(quantity)||quantity<1){$('requestStatus').textContent='Enter a description and positive whole-number quantity.';return}
    basket.push({catalog_part_id:null,part_number:$('freePartNumber').value.trim(),description,quantity,notes:$('freeNotes').value.trim()});
    $('freePartForm').reset();$('freeQuantity').value='1';$('requestStatus').textContent='';renderBasket();
  }

  function renderBasket(){
    if(!basket.length){$('requestBasket').innerHTML='<div class="empty">No items added yet.</div>';return}
    $('requestBasket').innerHTML=basket.map((item,index)=>`<div class="basket-item"><div><strong>${escapeHtml(item.part_number||'Unspecified part number')}</strong><div>${escapeHtml(item.description)}${item.catalog_part_id?'':' <span class="badge pending">Needs verification</span>'}</div></div><input type="number" min="1" max="9999" value="${item.quantity}" aria-label="Quantity" data-quantity="${index}"><input class="item-notes" maxlength="500" value="${escapeHtml(item.notes)}" placeholder="Item notes" aria-label="Item notes" data-notes="${index}"><button type="button" class="remove" data-remove="${index}" aria-label="Remove item">Remove</button></div>`).join('');
    $('requestBasket').querySelectorAll('[data-quantity]').forEach(input=>input.addEventListener('change',()=>{const value=Number(input.value);if(Number.isInteger(value)&&value>0)basket[Number(input.dataset.quantity)].quantity=value;else input.value=basket[Number(input.dataset.quantity)].quantity}));
    $('requestBasket').querySelectorAll('[data-notes]').forEach(input=>input.addEventListener('input',()=>{basket[Number(input.dataset.notes)].notes=input.value}));
    $('requestBasket').querySelectorAll('[data-remove]').forEach(button=>button.addEventListener('click',()=>{basket.splice(Number(button.dataset.remove),1);renderBasket()}));
  }

  async function submitRequest(){
    if(!selectedCraneId||!basket.length){$('requestStatus').textContent='Choose a crane and add at least one item.';return}
    $('requestStatus').textContent='Submitting request…';$('submitRequest').disabled=true;
    try{
      if(!cloud){requests.unshift({id:'DEMO-'+Date.now(),crane_id:selectedCraneId,status:'submitted',notes:$('requestNotes').value.trim(),created_at:new Date().toISOString(),items:basket.map(item=>({...item}))});}
      else{
        const {data,error}=await cloud.rpc('create_parts_request',{p_crane_id:selectedCraneId,p_notes:$('requestNotes').value.trim(),p_items:basket});
        if(error)throw error;
        if(!data)throw new Error('Supabase did not return a request ID.');
      }
      basket=[];$('requestNotes').value='';renderBasket();await renderMyRequests();$('requestStatus').textContent='Parts request submitted.';
    }catch(error){$('requestStatus').textContent='Submit failed: '+(error.message||error)}
    finally{$('submitRequest').disabled=false}
  }

  async function renderMyRequests(){
    if(!selectedCraneId){$('myRequests').innerHTML='';return}
    if(!cloud){const own=requests.filter(item=>item.crane_id===selectedCraneId);$('myRequests').innerHTML=own.length?own.map(requestHtml).join(''):'<div class="empty">No requests submitted in this demo session.</div>';return}
    const {data,error}=await cloud.from('parts_requests').select('id,crane_id,requested_by,status,notes,created_at').eq('crane_id',selectedCraneId).order('created_at',{ascending:false}).limit(20);
    if(error)throw error;
    const rows=data||[];
    if(!rows.length){$('myRequests').innerHTML='<div class="empty">No requests for this crane yet.</div>';return}
    const {data:items,error:itemError}=await cloud.from('parts_request_items').select('request_id,part_number,description,quantity,fitment_verified').in('request_id',rows.map(row=>row.id));
    if(itemError)throw itemError;
    $('myRequests').innerHTML=rows.map(row=>requestHtml({...row,items:(items||[]).filter(item=>item.request_id===row.id)})).join('');
  }

  function requestHtml(request){
    const date=new Date(request.created_at).toLocaleString();
    return `<div class="request"><div class="request-head"><strong>${escapeHtml(request.id)}</strong><span class="badge">${escapeHtml(request.status)}</span></div><div class="muted">${escapeHtml(date)}${request.notes?' · '+escapeHtml(request.notes):''}</div><ul class="request-items">${(request.items||[]).map(item=>`<li>${escapeHtml(item.quantity)} × ${escapeHtml(item.part_number||'No part number')} — ${escapeHtml(item.description)}${item.fitment_verified===false?' (fitment unverified)':''}</li>`).join('')}</ul></div>`;
  }

  init();
})();
