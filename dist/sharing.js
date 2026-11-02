/* Login-free, revocable client delivery links. Server returns a field allowlist. */
function makeShareToken(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function portalAccess(clientId){
 const client=db.clients.find(c=>c.id===clientId);if(!client)return;
 modal('Share client portal',`<p>Share project milestones and Google Drive updates with ${esc(client.name)}. Clients open the link without signing in.</p><p class="section-note">Anyone with this link can view this client’s project updates. You can replace or disable the link at any time. Contact details, tasks, invoices and workspace data are not shared.</p><div id="share-link-controls" role="status">Checking sharing…</div>`);
 const box=$('#share-link-controls');
 if(!cloudMode||!['owner','member'].includes(access?.role)){box.innerHTML='<p class="section-note">Connect your team workspace before publishing client updates. Your browser records stay on this device until you explicitly upload them.</p><button id="share-connect">Team sign in</button>';$('#share-connect').onclick=accountDialog;return;}
 try{
  const result=await cloud.rpc('chakra_manage_share',{requested_client:clientId,operation:'status',share_token:client.portalToken||''});if(result.error)throw result.error;if(!box.isConnected)return;
  const enabled=result.data===true,url=enabled?APP_URL+'#share='+client.portalToken:'';
  box.innerHTML=`${enabled?field('Client share link',`<input id="client-share-url" readonly value="${esc(url)}">`):'<p>No active share link on this device.</p>'}<div class="share-controls">${enabled?'<button id="copy-share">Copy link</button>':''}<button class="primary" id="enable-share">${enabled?'Replace link':'Create share link'}</button><button id="disable-share">Disable sharing</button></div><p class="section-note">The portal shows the latest saved cloud projects. Save workspace changes before sharing updates.</p>`;
  if($('#copy-share'))$('#copy-share').onclick=async()=>{try{await navigator.clipboard.writeText(url);toast('Portal link copied')}catch{$('#client-share-url').select();toast('Select and copy the link above')}};
  $('#enable-share').onclick=()=>changeShare(client,'enable');$('#disable-share').onclick=()=>changeShare(client,'revoke');
 }catch(error){if(box.isConnected)box.textContent='Sharing unavailable: '+error.message;}
}
async function changeShare(client,operation){
 const buttons=$$('#share-link-controls button');buttons.forEach(b=>b.disabled=true);
 try{const token=operation==='enable'?makeShareToken():'';const result=await cloud.rpc('chakra_manage_share',{requested_client:client.id,operation,share_token:token});if(result.error)throw result.error;
  if(operation==='enable')client.portalToken=token;else delete client.portalToken;save();await flushCloud();if(cloudConflict){toast('Sharing updated, but workspace changes are not synced. Export and reload to resolve the conflict.')}else toast(operation==='enable'?'Share link ready':'Sharing disabled');await portalAccess(client.id);
 }catch(error){toast(error.message);buttons.forEach(b=>b.disabled=false);}
}
async function renderSharedPortal(){
 const token=page.slice(6),route=page;
 clearTimeout(toast.timer);$('#toast').textContent='';$('#toast').classList.remove('show');if($('#modal').open)$('#modal').close();$('#modal').innerHTML='';
 $('#app').innerHTML='<main class="portal-shell"><header><h1>Project updates</h1></header><div id="portal-body" role="status">Loading project updates…</div></main>';
 if(!/^[a-f0-9]{64}$/.test(token)){$('#portal-body').textContent='This share link is invalid or has been disabled.';return}
 if(!cloud){$('#portal-body').textContent='Connecting to project updates…';return;}
 try{const result=await cloud.rpc('chakra_shared_portal',{share_token:token});if(page!==route)return;if(result.error||!result.data){$('#portal-body').textContent='This share link is unavailable or has been disabled. Ask the studio for a new link.';return;}
  const data=result.data;document.documentElement.style.setProperty('--accent',safeAccent(data.settings.accent));$('#portal-body').innerHTML=`${safeImage(data.settings.appLogo)?`<img class="brand-image" src="${safeImage(data.settings.appLogo)}" alt="Studio logo">`:''}<p>${esc(data.settings.studio)}</p>${portalHTML(data)}`;
 }catch{if(page===route&&$('#portal-body'))$('#portal-body').textContent='Project updates could not load. Check your connection and try again.';}
}
