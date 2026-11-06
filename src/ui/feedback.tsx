import React, {useEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {Icon, type IconName} from './icons';
export function Toast({message,onDismiss,undo}:{message:string;onDismiss:()=>void;undo?:()=>void}) {
  const start=useRef<number|null>(null);
  useEffect(()=>{const timer=setTimeout(onDismiss,3500);return()=>clearTimeout(timer);},[message,onDismiss]);
  return createPortal(<div data-ui="toast" className="ui-toast" role="status" onPointerDown={e=>{start.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId);}} onPointerUp={e=>{if(start.current!==null&&e.clientY-start.current>30)onDismiss();start.current=null;}}><Icon name="check"/><span>{message}</span>{undo&&<button type="button" onClick={()=>{undo();onDismiss();}}>Скасувати</button>}</div>,document.body);
}
export function InlineBanner({children,icon='info'}:{children:React.ReactNode;icon?:IconName}) {return <div className="ui-inline-banner"><Icon name={icon}/><span>{children}</span></div>;}
