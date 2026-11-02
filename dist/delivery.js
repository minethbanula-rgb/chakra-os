/* Project delivery, invoice advances and reporting-cycle helpers. */
const projectStatuses=['Planning','In Progress','In Review','On Hold','Delivered','Portfolio Queue','Archived'];
function directoryOptions(records,current,labelKey='name'){
 const values=[...new Set(records.map(r=>r[labelKey]).filter(Boolean))];if(current&&!values.includes(current))values.push(current);
 return `<option value="">Unassigned</option>${values.map(name=>`<option value="${esc(name)}" ${current===name?'selected':''}>${esc(name)}</option>`).join('')}`;
}
function assigneeSelect(current){const values=db.users.filter(u=>u.status!=='Inactive').map(u=>({name:u.name})),existing=db.users.find(u=>u.name===current||u.email===current||u.name.split(' ')[0]===current);return `<select name="assignee">${directoryOptions(values,existing?.name||current)}</select>`;}
function clientDropdown(current,attributes='name="client"'){return `<select ${attributes}>${directoryOptions(db.clients,current).replace('Unassigned','Select client')}</select>`;}
function safeDriveURL(value){try{const url=new URL(value);return url.protocol==='https:'&&['drive.google.com','docs.google.com'].includes(url.hostname)?url.href:''}catch{return ''}}
function milestoneEditor(project,form){
 const section=document.createElement('section');section.className='milestone-editor';section.innerHTML=`<div class="panel-head"><h3>Project milestones</h3><button type="button" id="add-milestone">Add milestone</button></div><p class="section-note">Set dated steps and mark their current state. These steps and the Drive link appear in the client portal.</p><div id="milestone-rows"></div>${field('Project updates · Google Drive link',`<input name="driveUrl" type="url" placeholder="https://drive.google.com/…" value="${esc(project.driveUrl||'')}">`)}`;
 form.querySelector('.dialog-actions').before(section);
 const add=m=>{const row=document.createElement('div');row.className='milestone-edit-row';row.dataset.milestoneId=m.id||id();row.innerHTML=`${field('Milestone',`<input data-milestone-title value="${esc(m.title||'')}" required>`)}${field('Target date',`<input type="date" data-milestone-date value="${esc(m.date||'')}" required>`)}${field('State',`<select data-milestone-state>${options(['Planned','In Progress','Complete'],m.state||'Planned')}</select>`)}<button type="button" aria-label="Remove milestone">${icon('trash')}</button>`;row.querySelector('button').onclick=()=>row.remove();$('#milestone-rows').append(row);};
 (project.milestones||[]).forEach(add);$('#add-milestone').onclick=()=>add({});
}
function extendDeliveryRecord(kind,updated,form){if(kind==='projects'){
 updated.milestones=[...form.querySelectorAll('[data-milestone-id]')].map(row=>({id:row.dataset.milestoneId,title:row.querySelector('[data-milestone-title]').value.trim(),date:row.querySelector('[data-milestone-date]').value,state:row.querySelector('[data-milestone-state]').value}));
 const drive=form.querySelector('[name="driveUrl"]').value.trim();if(drive&&!safeDriveURL(drive))throw Error('Use an HTTPS Google Drive or Google Docs link.');updated.driveUrl=drive?safeDriveURL(drive):'';
 if(updated.milestones.some(m=>!m.title||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)))throw Error('Each milestone needs a title and date.');
}}
function moveProject(projectId,status){const project=db.projects.find(p=>p.id===projectId);if(!project||!projectStatuses.includes(status))return;project.status=status;save('Project moved to '+status);render();}
function advanceAmount(value=invoice){const total=totalInvoice(value);return Math.round((value.advanceMode==='percent'?total*(Number(value.advanceValue)||0)/100:value.advanceMode==='amount'?Number(value.advanceValue)||0:0)*100)/100;}
function validateAdvance(value){const mode=value.advanceMode||'none',amount=Number(value.advanceValue??0);return ['none','percent','amount'].includes(mode)&&Number.isFinite(amount)&&amount>=0&&(mode!=='percent'||amount<=100)&&(mode!=='amount'||amount<=totalInvoice(value));}
function advanceFields(){const amount=advanceAmount(),percent=invoice.advanceMode==='percent'?Number(invoice.advanceValue)||0:totalInvoice(invoice)?amount/totalInvoice(invoice)*100:0;return field('Advance (%)',`<input type="number" min="0" max="100" step=".01" data-advance-percent value="${percent.toFixed(2)}">`)+field('Advance amount',`<input type="number" min="0" step=".01" data-advance-amount value="${amount.toFixed(2)}"><small>Edit either value; the other updates automatically. Based on the total including tax. An advance request does not record payment.</small>`);}
function refreshAdvanceFields(active){const amount=advanceAmount(),percent=invoice.advanceMode==='percent'?Number(invoice.advanceValue)||0:totalInvoice(invoice)?amount/totalInvoice(invoice)*100:0;const p=$('[data-advance-percent]'),a=$('[data-advance-amount]');if(p&&p!==active)p.value=percent.toFixed(2);if(a&&a!==active)a.value=amount.toFixed(2);}
function advanceSummary(){if(!invoice.advanceMode||invoice.advanceMode==='none')return '';const total=totalInvoice(invoice),advance=advanceAmount();return `<div class="paper-total advance-summary"><span>Advance requested${invoice.advanceMode==='percent'?' ('+esc(invoice.advanceValue)+'%)':''}</span><b>${money(advance,invoice.currency||db.settings.currency)}</b><span>Balance after advance</span><b>${money(Math.max(0,total-advance),invoice.currency||db.settings.currency)}</b></div>`;}
function cycleDay(){return Math.min(31,Math.max(1,Number(db.settings.cycleStartDay)||1));}
function cycleAnchor(year,month,day){return new Date(year,month,Math.min(day,new Date(year,month+1,0).getDate()),12);}
function cycleRange(now=new Date()){
 const day=cycleDay();let start=cycleAnchor(now.getFullYear(),now.getMonth(),day);if(localISO(start)>localISO(now))start=cycleAnchor(now.getFullYear(),now.getMonth()-1,day);
 const next=cycleAnchor(start.getFullYear(),start.getMonth()+1,day),fullEnd=new Date(next);fullEnd.setDate(fullEnd.getDate()-1);
 const previous=cycleAnchor(start.getFullYear(),start.getMonth()-1,day),priorLimit=new Date(start);priorLimit.setDate(priorLimit.getDate()-1);
 const elapsed=Math.round((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())-Date.UTC(start.getFullYear(),start.getMonth(),start.getDate()))/86400000),priorEnd=new Date(previous);priorEnd.setDate(priorEnd.getDate()+elapsed);if(priorEnd>priorLimit)priorEnd.setTime(priorLimit.getTime());
 return{start:localISO(start),end:localISO(now),fullEnd:localISO(fullEnd),previousStart:localISO(previous),previousEnd:localISO(priorEnd),mode:'Month'};
}
function reportingTotals(){const r=reportRange();return rangeTotals(r.start,r.end);}
function reportingPeriodLabel(){const r=reportRange();return date(r.start)+'–'+date(r.end);}
function bindDeliveryControls(){
 const cycleStart=$('[name="cycleStartDay"]'),cycleEnd=$('[data-cycle-end]');if(cycleStart&&cycleEnd){cycleStart.onchange=()=>cycleEnd.value=Number(cycleStart.value)===1?'31':String(Number(cycleStart.value)-1);cycleEnd.onchange=()=>cycleStart.value=Number(cycleEnd.value)===31?'1':String(Number(cycleEnd.value)+1);}

 const percent=$('[data-advance-percent]'),amount=$('[data-advance-amount]');for(const [el,mode] of [[percent,'percent'],[amount,'amount']])if(el)el.oninput=()=>{invoice.advanceMode=mode;invoice.advanceValue=Number(el.value);refreshAdvanceFields(el);$('#invoice-paper').innerHTML=invoicePaper();};
 $$('[data-drag-project]').forEach(card=>card.ondragstart=e=>{e.dataTransfer.setData('application/x-chakra-project',card.dataset.dragProject);e.dataTransfer.setData('text/plain','project:'+card.dataset.dragProject);e.dataTransfer.effectAllowed='move';});
 $$('[data-project-drop]').forEach(column=>{column.ondragover=e=>{if([...e.dataTransfer.types].some(t=>['application/x-chakra-project','text/plain'].includes(t))){e.preventDefault();e.dataTransfer.dropEffect='move';column.classList.add('dragover')}};column.ondragleave=()=>column.classList.remove('dragover');column.ondrop=e=>{e.preventDefault();const plain=e.dataTransfer.getData('text/plain'),projectId=e.dataTransfer.getData('application/x-chakra-project')||(plain.startsWith('project:')?plain.slice(8):'');column.classList.remove('dragover');if(projectId)moveProject(projectId,column.dataset.projectDrop);};});
 $$('[data-project-status]').forEach(el=>el.onchange=()=>moveProject(el.dataset.projectStatus,el.value));
}
function projectMilestones(p){const milestones=Array.isArray(p.milestones)?p.milestones:[];return `<p class="section-note">Current stage: <b>${esc(p.status)}</b> · Due ${date(p.due)}</p>${milestones.length?`<ol class="milestone-timeline">${milestones.map(m=>`<li class="${m.state==='Complete'?'complete':m.state==='In Progress'?'current':''}"><div><b>${esc(m.title)}</b><small>${date(m.date)}</small></div>${badge(m.state||'Planned')}</li>`).join('')}</ol>`:'<p class="section-note">Milestone dates will appear here when the studio adds them.</p>'}${safeDriveURL(p.driveUrl)?`<a class="drive-link" href="${esc(safeDriveURL(p.driveUrl))}" target="_blank" rel="noopener noreferrer">Open project updates in Google Drive ${icon('arrow')}</a>`:''}`;}
