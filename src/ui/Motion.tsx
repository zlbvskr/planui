import React,{useLayoutEffect,useRef,useEffect} from 'react';
import {LazyMotion,m,AnimatePresence} from 'motion/react';
import {animate,cancelMotion,easings,springFrames,useReducedMotion} from './motion';
const features=()=>import('./motionFeatures').then(module=>module.default);
export function MotionProvider({children}:{children:React.ReactNode}) {return <LazyMotion features={features} strict>{children}</LazyMotion>;}
function AnimatedItem({children,index}:{children:React.ReactNode;index:number}) {
 const reduced=useReducedMotion(),ref=useRef<HTMLDivElement>(null);const state=(running:boolean)=>{if(ref.current){ref.current.dataset.motion=running?'running':'idle';ref.current.style.willChange=running?'transform, opacity':'';}};
 return <m.div ref={ref} layout={reduced?false:'position'} initial={{opacity:0,...(!reduced?{y:8}:{})}} animate={{opacity:1,y:0}} exit={{opacity:0}} transition={reduced?{duration:.12}:{layout:{type:'spring',stiffness:320,damping:30},opacity:{duration:.12,delay:Math.min(index,7)*.02},y:{duration:.22}}} onAnimationStart={()=>state(true)} onAnimationComplete={()=>state(false)} onLayoutAnimationStart={()=>state(true)} onLayoutAnimationComplete={()=>state(false)} data-motion="idle">{children}</m.div>;
}
export function AnimatedList({children}:{children:React.ReactNode}) {
 return <MotionProvider><AnimatePresence mode="popLayout">{React.Children.toArray(children).map((child,i)=><AnimatedItem key={React.isValidElement(child)?child.key??i:i} index={i}>{child}</AnimatedItem>)}</AnimatePresence></MotionProvider>;
}
export function SelectionThumb({value,children,className='',...props}:React.HTMLAttributes<HTMLDivElement>&{value:string}) {
 const ref=useRef<HTMLDivElement>(null),previous=useRef<DOMRect|null>(null);
 const reduced=useReducedMotion();
 useLayoutEffect(()=>{const root=ref.current,thumb=root?.querySelector<HTMLElement>(':scope > .motion-thumb'),selected=root?.querySelector<HTMLElement>('[aria-pressed=true],[aria-current=page]');if(!root||!thumb||!selected)return;
 const box=selected.getBoundingClientRect(),base=root.getBoundingClientRect(),old=previous.current;
 thumb.style.width=`${box.width}px`;thumb.style.height=`${box.height}px`;thumb.style.left=`${box.left-base.left+root.scrollLeft}px`;thumb.style.top=`${box.top-base.top+root.scrollTop}px`;previous.current=box;
 if(old&&!reduced){const dx=old.left-box.left,dy=old.top-box.top;void animate(thumb,springFrames(1,0,'smooth','transform',n=>`translate(${dx*n}px,${dy*n}px) scale(${1+(old.width/box.width-1)*n},${1+(old.height/box.height-1)*n})`),{duration:600});void animate(selected,[{opacity:.5},{opacity:1}],{duration:140},'label');const icon=selected.querySelector<SVGElement>('svg');if(icon)void animate(icon as unknown as HTMLElement,[{transform:'scale(1)'},{transform:'scale(1.12)',offset:.4},{transform:'scale(1)'}],{duration:220});}
 },[value,reduced]);
 return <div {...props} ref={ref} className={`motion-selection ${className}`} data-motion="idle"><span className="motion-thumb" aria-hidden="true" data-motion="idle"/>{children}</div>;
}
let skipUntil=0;
if(typeof window!=='undefined')window.addEventListener('popstate',()=>{skipUntil=performance.now()+500;});
export function MotionScreen({id,kind='tab',direction=1,children}:{id:string;kind?:'tab'|'push'|'calendar'|'view';direction?:number;children:React.ReactNode}) {
 const ref=useRef<HTMLDivElement>(null),host=useRef<HTMLDivElement>(null),snapshot=useRef<HTMLElement|null>(null),previous=useRef(id);const reduced=useReducedMotion();
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;if(performance.now()<skipUntil){cancelMotion(el);previous.current=id;snapshot.current=kind==='push'?el.cloneNode(true) as HTMLElement:null;return;}const changed=previous.current!==id;previous.current=id;
 if(changed&&kind==='push'&&!reduced&&snapshot.current&&host.current){const old=snapshot.current;old.inert=true;old.setAttribute('aria-hidden','true');old.removeAttribute('data-motion');old.querySelectorAll('[id],[data-testid],[data-motion]').forEach(node=>{node.removeAttribute('id');node.removeAttribute('data-testid');node.removeAttribute('data-motion');});Object.assign(old.style,{position:'absolute',inset:'0',pointerEvents:'none',transform:'none'});host.current.appendChild(old);void animate(old,[{transform:direction>0?'translateX(0px)':'translateX(100%)',opacity:1},{transform:direction>0?'translateX(-28%)':'translateX(100%)',opacity:.4}],{duration:320,easing:easings.emphasized}).then(()=>old.remove());}
 snapshot.current=kind==='push'?el.cloneNode(true) as HTMLElement:null;
 const transform=kind==='push'?`translateX(${direction>0?'100%':'-28%'})`:kind==='calendar'?`translateX(${direction*24}px)`:kind==='view'?'scale(.985)':'translateY(6px)';
 void animate(el,[{opacity:0,...(!reduced?{transform}:{})},{opacity:1,...(!reduced?{transform:'none'}:{})}],{duration:changed?(kind==='push'?320:kind==='tab'?180:220):160,easing:kind==='push'?easings.emphasized:easings.out});
 },[id,kind,direction,reduced]);
 return <div ref={host} className="motion-screen" style={{position:'relative'}}><div ref={ref} data-motion="idle">{children}</div></div>;
}
export function AmbientCanvas(){const reduced=useReducedMotion(),ref=useRef<HTMLDivElement>(null);useEffect(()=>{const root=ref.current;if(!root)return;let timer:ReturnType<typeof setTimeout>;let last=scrollY,time=performance.now();const pause=()=>{root.dataset.paused=String(document.hidden||reduced);};const scroll=()=>{const now=performance.now(),fast=Math.abs(scrollY-last)/Math.max(1,now-time)>.8;last=scrollY;time=now;if(fast){root.dataset.paused='true';clearTimeout(timer);timer=setTimeout(pause,180);}};pause();document.addEventListener('visibilitychange',pause);window.addEventListener('scroll',scroll,{passive:true});return()=>{clearTimeout(timer);document.removeEventListener('visibilitychange',pause);window.removeEventListener('scroll',scroll);};},[reduced]);return <div ref={ref} className="motion-ambient" aria-hidden="true" data-paused={reduced}></div>;}
