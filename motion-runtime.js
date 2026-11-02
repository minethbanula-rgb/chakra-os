import {animate} from 'motion/mini';
const running=new Map(),media=window.matchMedia('(prefers-reduced-motion: reduce)');
function restore(handle){const entry=running.get(handle);if(!entry)return;for(const [name,value] of Object.entries(entry.styles))entry.element.style[name]=value;running.delete(handle);}
function cancel(){for(const handle of [...running.keys()]){try{handle.complete();handle.cancel();}catch{}restore(handle);}}
function full(mode='System'){return mode!=='Off'&&mode!=='Reduced'&&!media.matches;}
function run(element,frames,duration=.18,mode='System'){
 if(!element||mode==='Off')return;
 try{const keyframes=full(mode)?frames:{opacity:[.85,1]},styles=Object.fromEntries(Object.keys(keyframes).map(name=>[name,element.style[name]]));const handle=animate(element,keyframes,{duration:full(mode)?duration:Math.min(.08,duration),ease:'easeOut'});running.set(handle,{element,styles});handle.finished.then(()=>restore(handle)).catch(()=>restore(handle));return handle;}catch{/* The final DOM remains visible if animation fails. */}
}
function enter(element,mode='System',duration=.18){return run(element,{opacity:[.4,1],transform:['translateY(8px)','none']},duration,mode);}
media.addEventListener('change',cancel);
window.studioMotion={cancel,full,run,enter};
document.addEventListener('click',e=>{const button=e.target.closest('button');if(button)run(button,{transform:['scale(.98)','none']},.1,window.studioMotionPreference||'System');},true);
