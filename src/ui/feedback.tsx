import {animate,cancelMotion,reducedMotion,springFrames} from './motion';
import React, {useEffect, useRef, useId} from 'react';
import {createPortal} from 'react-dom';
import {Icon, type IconName} from './icons';
let currentToast:{id:string;dismiss:()=>void}|null=null;
export function Toast({message,onDismiss,undo}:{message:string;onDismiss:()=>void;undo?:()=>void}) {
  const id=useId();
  const root=useRef<HTMLDivElement>(null);
  const close=()=>{void animate(root.current,[{opacity:1,transform:'translateY(0px)'},{opacity:0,transform:'translateY(16px)'}],{duration:140}).then(()=>dismiss.current());};
  useEffect(()=>{void animate(root.current,springFrames(16,0,'gentle').map((f,i)=>({...f,opacity:Math.min(1,i/12)})),{duration:600});},[message]);
  const start=useRef<number|null>(null);
  const dismiss=useRef(onDismiss);
  useEffect(()=>{dismiss.current=onDismiss;},[onDismiss]);
  useEffect(()=>{if(currentToast&&currentToast.id!==id)currentToast.dismiss();currentToast={id,dismiss:()=>dismiss.current()};const timer=setTimeout(close,3500);return()=>{clearTimeout(timer);if(currentToast?.id===id)currentToast=null;};},[message,id]);
  return createPortal(<div ref={root} data-motion="idle" data-ui="toast" className="ui-toast" role="status" onPointerDown={e=>{start.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>{if(start.current!==null&&root.current&&!reducedMotion()){cancelMotion(root.current);root.current.style.transform=`translateY(${Math.max(0,e.clientY-start.current)}px)`;root.current.dataset.motion="running";}}} onPointerUp={e=>{const delta=start.current===null?0:Math.max(0,e.clientY-start.current);if(delta>30)close();else void animate(root.current,springFrames(delta,0,"gentle"),{duration:600});if(root.current)root.current.style.transform="";start.current=null;}} onPointerCancel={()=>{start.current=null;if(root.current){root.current.style.transform="";cancelMotion(root.current);}}}><Icon name="check"/><span>{message}</span>{undo&&<button type="button" onClick={()=>{undo();onDismiss();}}>Скасувати</button>}</div>,document.body);
}
export function InlineBanner({children,icon='info'}:{children:React.ReactNode;icon?:IconName}) {return <div className="ui-inline-banner"><Icon name={icon}/><span>{children}</span></div>;}
