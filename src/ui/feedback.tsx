import {animate,springFrames} from './motion';
import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {Icon, type IconName} from './icons';
export function Toast({message,onDismiss,undo}:{message:string;onDismiss:()=>void;undo?:()=>void}) {
  const root=useRef<HTMLDivElement>(null);
  const close=()=>{void animate(root.current,[{opacity:1,transform:'translateY(0px)'},{opacity:0,transform:'translateY(16px)'}],{duration:140}).then(()=>dismiss.current());};
  useEffect(()=>{void animate(root.current,springFrames(16,0,'gentle').map((f,i)=>({...f,opacity:Math.min(1,i/12)})),{duration:600});},[message]);
  const start=useRef<number|null>(null);
  const dismiss=useRef(onDismiss);
  useEffect(()=>{dismiss.current=onDismiss;},[onDismiss]);
  useEffect(()=>{const timer=setTimeout(close,3500);return()=>clearTimeout(timer);},[message]);
  return createPortal(<div ref={root} data-motion="idle" data-ui="toast" className="ui-toast" role="status" onPointerDown={e=>{start.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={e=>{if(start.current!==null&&e.clientY-start.current>30)close();start.current=null;}}><Icon name="check"/><span>{message}</span>{undo&&<button type="button" onClick={()=>{undo();onDismiss();}}>Скасувати</button>}</div>,document.body);
}
export function InlineBanner({children,icon='info'}:{children:React.ReactNode;icon?:IconName}) {return <div className="ui-inline-banner"><Icon name={icon}/><span>{children}</span></div>;}
