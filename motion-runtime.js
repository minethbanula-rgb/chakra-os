import {animate} from 'motion/mini';
const running=new Set(),media=window.matchMedia('(prefers-reduced-motion: reduce)');
function cancel(){for(const item of running){try{item.complete();item.cancel();}catch{}}running.clear();}
function full(mode='System'){return mode!=='Off'&&mode!=='Reduced'&&!media.matches;}
function run(element,frames,duration=.18,mode='System'){
 if(!element||mode==='Off')return;
 try{const handle=animate(element,full(mode)?frames:{opacity:[.85,1]},{duration:full(mode)?duration:Math.min(.08,duration),ease:'easeOut'});running.add(handle);handle.finished.then(()=>running.delete(handle)).catch(()=>running.delete(handle));return handle;}catch{/* The final DOM remains visible if animation fails. */}
}
function enter(element,mode='System',duration=.18){return run(element,{opacity:[.4,1],transform:['translateY(8px)','none']},duration,mode);}
media.addEventListener('change',cancel);
window.studioMotion={cancel,full,run,enter};
document.addEventListener('click',e=>{const button=e.target.closest('button');if(button)run(button,{transform:['scale(.98)','none']},.1,window.studioMotionPreference||'System');},true);
