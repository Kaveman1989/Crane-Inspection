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
  let auth=null,cloud=null,cranes=[],models=[],documents=[],parts=[],requests=[],selectedCraneId='',modelKey='',basket=[],partsSearchVersion=0,partsSearchTimer=null;

  async function init(){
    try{
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
    selectedCraneId=crane.id;modelKey='';documents=[];parts=[];basket=[];
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
      await Promise.all([loadDocuments(),loadParts()]);
      await renderMyRequests();
    }catch(error){$('appStatus').textContent='Crane lookup did not fully load: '+(error.message||error)}
  }

  async function loadDocuments(){
    if(!modelKey){$('documents').innerHTML='<div class="empty">No model-specific documents are matched. Use the manufacturer portal and verify the serial-specific manual.</div>';return}
    if(!cloud){
      const model=productReferences[modelKey];
      $('documents').innerHTML=`<div class="doc"><div class="doc-title">Manufacturer product/reference page</div><span class="badge">Reference only</span><p class="muted">Product literature is not a serial-specific service or parts manual.</p><a href="${model}" target="_blank" rel="noopener noreferrer">Open official Potain reference</a></div>`;
      return;
    }
    $('documents').innerHTML='<div class="empty">Loading references…</div>';
    const {data,error}=await cloud.from('crane_reference_documents').select('*').eq('model_key',modelKey).order('document_type').order('title');
    if(error)throw error;
    documents=data||[];
    if(!documents.length){$('documents').innerHTML=`<div class="doc"><div class="doc-title">No documents registered for this model</div><span class="badge pending">Awaiting verified source</span><p class="muted">Manufacturer reference page: <a href="${productReferences[modelKey]||'https://www.manitowoc.com/manuals'}" target="_blank" rel="noopener noreferrer">Open Potain source</a>. Ask management to add the correct revision and serial range after verification.</p></div>`;return}
    const links=await Promise.all(documents.map(async doc=>({doc,url:await documentUrl(doc)})));
    $('documents').innerHTML=links.map(({doc,url})=>`<div class="doc"><div class="doc-title">${escapeHtml(doc.title)}</div><span class="badge">${escapeHtml(doc.document_type.replaceAll('_',' '))}</span><span class="badge ${doc.verification_status==='serial_specific'?'verified':'pending'}">${escapeHtml(doc.verification_status.replaceAll('_',' '))}</span>${doc.revision?`<span class="badge">Rev ${escapeHtml(doc.revision)}</span>`:''}${doc.serial_range?`<p class="muted">Serial range: ${escapeHtml(doc.serial_range)}</p>`:''}${doc.notes?`<p class="muted">${escapeHtml(doc.notes)}</p>`:''}${url?`<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open document</a>`:'<span class="muted">Document link unavailable.</span>'}</div>`).join('');
  }

  async function documentUrl(doc){
    if(doc.storage_path){const {data,error}=await cloud.storage.from('technician-reference-files').createSignedUrl(doc.storage_path,1800);return error?'':data.signedUrl}
    return safeHttpUrl(doc.source_url);
  }

  function safeHttpUrl(value){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return''}}

  async function loadParts(){
    const searchVersion=++partsSearchVersion;
    if(!modelKey){parts=[];$('partsSearchStatus').textContent='';renderParts();return}
    if(!cloud){parts=[];$('partsSearchStatus').textContent='Demo mode has no imported parts data.';renderParts();return}
    const rawQuery=$('partSearch').value.trim().replace(/[%_(),\\]/g,'').slice(0,80);
    const searchAllModels=$('searchAllModels').checked;
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
          $('partsSearchStatus').textContent=parts.length?`Found ${parts.length} catalog candidate${parts.length===1?'':'s'}. ${searchAllModels?'Other-model hits need fitment confirmation.':'Results are limited to this crane model.'}`:'No indexed catalog records match. Try a broader term or search other models.';
        if(searchAllModels){
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
