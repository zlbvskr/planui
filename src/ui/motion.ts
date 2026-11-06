import {useEffect, useState} from 'react';

export const springs = {press:{stiffness:520,damping:38},smooth:{stiffness:320,damping:30},sheet:{stiffness:380,damping:36},gentle:{stiffness:220,damping:26}} as const;
export const tweens = {fast:140,base:220,slow:360} as const;
export const easings = {out:'cubic-bezier(0.22,1,0.36,1)',emphasized:'cubic-bezier(0.32,0.72,0,1)'} as const;
export const reducedMotion = () => typeof window !== 'undefined' && (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reducedMotion === 'true');
export function useReducedMotion() {
  const [reduced,setReduced]=useState(reducedMotion);
  useEffect(()=>{const update=()=>setReduced(reducedMotion());const media=matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',update);const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduced-motion']});return()=>{media.removeEventListener('change',update);observer.disconnect();};},[]);
  return reduced;
}
// Sample the analytic damped spring once. No frame callbacks or layout reads.
export function springFrames(from:number,to:number,kind:keyof typeof springs='smooth',property='transform',format=(n:number)=>`translateY(${n}px)`):Keyframe[] {
  const {stiffness:k,damping:c}=springs[kind],w=Math.sqrt(k),z=c/(2*w),wd=w*Math.sqrt(Math.max(.0001,1-z*z));
  return Array.from({length:61},(_,i)=>{const t=i/60*.6;const decay=1-Math.exp(-z*w*t)*(Math.cos(wd*t)+z*w/wd*Math.sin(wd*t));return {[property]:format(i===60?to:from+(to-from)*decay),offset:i/60};});
}
const active=new WeakMap<HTMLElement,Map<string,Animation>>();
export function animate(el:HTMLElement|null,frames:Keyframe[],options:KeyframeAnimationOptions={},channel='main'):Promise<void> {
  if(!el)return Promise.resolve();
  let channels=active.get(el);if(!channels){channels=new Map();active.set(el,channels);}
  const old=channels.get(channel);old?.cancel();
  const reduced=reducedMotion();
  const safe=reduced?frames.map(f=>({opacity:f.opacity??1,offset:f.offset})):frames;
  el.dataset.motion='running';el.style.willChange=reduced?'opacity':'transform, opacity';
  const animation=el.animate(safe,{duration:220,easing:easings.out,fill:'both',...options,...(reduced?{duration:Math.min(Number(options.duration??120),120),delay:0}:{})});channels.set(channel,animation);
  return animation.finished.catch(()=>{}).then(()=>{if(channels!.get(channel)!==animation)return;channels!.delete(channel);if(!channels!.size){el.dataset.motion='idle';el.style.removeProperty('will-change');}animation.cancel();});
}
export function cancelMotion(el:HTMLElement) {active.get(el)?.forEach(a=>a.cancel());active.get(el)?.clear();el.dataset.motion='idle';el.style.removeProperty('will-change');}
export function installPressMotion() {
  let pressed:HTMLElement|null=null;
  const release=()=>{if(!pressed)return;const el=pressed;pressed=null;el.removeAttribute('data-pressed');void animate(el,springFrames(.97,1,'press','transform',n=>`scale(${n})`),{duration:600},'press');};
  const down=(event:PointerEvent)=>{release();const el=(event.target as Element).closest<HTMLElement>('button:not(:disabled),.ui-row[role=button],.ui-item-card[role=button]');if(!el||el.closest('[inert]')||reducedMotion())return;pressed=el;el.dataset.pressed='true';void animate(el,[{transform:'scale(.97)'},{transform:'scale(.97)'}],{duration:60000},'press');};
  document.addEventListener('pointerdown',down);document.addEventListener('pointerup',release);document.addEventListener('pointercancel',release);window.addEventListener('blur',release);
  return()=>{release();document.removeEventListener('pointerdown',down);document.removeEventListener('pointerup',release);document.removeEventListener('pointercancel',release);window.removeEventListener('blur',release);};
}
