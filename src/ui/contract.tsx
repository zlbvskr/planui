import {AnimatedList, SelectionThumb} from './Motion';
import {animate, cancelMotion, springFrames, useReducedMotion} from './motion';
import React, { useEffect, useId, useRef, useState } from 'react';
import { Icon, ChevronLeft, ChevronRight, Info, MoreHorizontal } from './icons';
import { ModalSheet, ModalSheetProps } from './legacy';
import { formatDate, formatDuration, formatTime } from '../lib/format';

function moveGroupFocus<T extends string>(e: React.KeyboardEvent<HTMLElement>, options: readonly {value: T; label: string}[], onChange: (value: T) => void) {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const buttons = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
  if (!buttons.length) return;
  const index = Math.max(0, buttons.indexOf(document.activeElement as HTMLButtonElement));
  e.preventDefault();
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (index + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
  if (options[next]) onChange(options[next].value);
}

export function RoundButton({className='',...props}:React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props} className={`ui-round planui-floating-capsule ${className}`} />;
}
export function PageHeader({title,subtitle,actions,children}:{title:string;subtitle?:string;actions?:React.ReactNode;children?:React.ReactNode}) {
  const sentinel=useRef<HTMLDivElement>(null),header=useRef<HTMLElement>(null);const [compact,setCompact]=useState(false);const reduced=useReducedMotion();
  useEffect(()=>{let frame=0;const update=()=>{const amount=Math.max(0,Math.min(1,scrollY/100));setCompact(amount>=1);cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>header.current?.style.setProperty('--collapse',String(reduced?0:amount)));};update();window.addEventListener('scroll',update,{passive:true});return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',update);};},[reduced]);
  return <><div ref={sentinel} style={{height:1,marginBottom:-1}} /><header ref={header} data-ui="page-header" data-compact={compact}><div className="ui-page-title"><div><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div><div>{actions}</div></div>{children}</header></>;

}
export function SubHeader({title,onBack,actions}:{title:string;onBack:()=>void;actions?:React.ReactNode}) {
  return <header className="ui-sub-header"><RoundButton aria-label="Назад" onClick={onBack}><ChevronLeft aria-hidden="true" size={20}/></RoundButton><h1>{title}</h1>{actions}</header>;
}
export function Segmented<T extends string>({value,options,onChange,label}:{value:T;options:readonly {value:T;label:string}[];onChange:(value:T)=>void;label:string}) {
  if(options.length>4)throw new Error('Segmented supports at most four options');
  return <SelectionThumb value={value} className="ui-segmented" role="group" aria-label={label} onKeyDown={e=>moveGroupFocus(e,options,onChange)}>{options.map(o=><button type="button" key={o.value} aria-pressed={o.value===value} onClick={()=>onChange(o.value)}>{o.label}</button>)}</SelectionThumb>;
}
export function PillRow<T extends string>({label,value,options,onChange}:{label:string;value:T;options:readonly {value:T;label:string;testId?:string;count?:number;isDefault?:boolean}[];onChange:(v:T)=>void}) {
  return <SelectionThumb value={value} className="ui-pill-row" data-ui="pill-row" role="group" aria-label={label} onKeyDown={e=>moveGroupFocus(e,options,onChange)}>{options.map(o=><button className="ui-pill" type="button" key={o.value} data-testid={o.testId} aria-pressed={o.value===value} onClick={()=>onChange(o.value)}>{o.label}{o.count&&o.count>0&&!o.isDefault&&options[0]!==o?<small>{o.count}</small>:null}</button>)}</SelectionThumb>;
}
export function Section({title,children}:{title?:string;children:React.ReactNode}) {
  const id=useId();return <section className="ui-section ui-contract-section" aria-labelledby={title?id:undefined}>{title&&<h2 id={id} className="ui-section-label">{title}</h2>}<div className="ui-surface" data-ui="group"><AnimatedList>{children}</AnimatedList></div></section>;
}
type RowProps=Omit<React.HTMLAttributes<HTMLDivElement>,'title'> & {title?:React.ReactNode;secondary?:string;leading?:React.ReactNode;trailing?:React.ReactNode;value?:string|null};
export function Row({title,secondary,leading,trailing,value,children,className='',...props}:RowProps) {
  return <div {...props} className={`ui-row ${className}`} data-ui="row">{leading&&<span className="ui-icon-tile" aria-hidden="true">{leading}</span>}{title!==undefined?<div className="ui-row-text"><span>{title}</span>{secondary&&<small>{secondary}</small>}</div>:children}{(trailing!==undefined||value!==undefined)&&<span className="ui-row-trailing">{trailing??<span className={!value?'ui-unset':undefined}>{value||'Не заповнено'}</span>}</span>}</div>;
}
export function ItemCard({hue='var(--color-personal)',className='',style,height,title,meta,step,children,...props}:Omit<React.HTMLAttributes<HTMLElement>,'title'> & {hue?:string;height?:number;title?:string;meta?:string;step?:string}) {
  return <article {...props} data-ui="item-card" data-density={height===undefined?undefined:height<44?'compact':height<=72?'medium':'tall'} className={`ui-item-card ${className}`} style={{'--item-hue':hue,...style} as React.CSSProperties}>{title?<><h3 data-user-content>{title}{height!==undefined&&height<44&&meta?` · ${meta}`:''}</h3>{(height===undefined||height>72)&&step&&<p>{step}</p>}{(height===undefined||height>=44)&&meta&&<span className="ui-item-meta">{meta}</span>}</>:children}</article>;
}
export function Toggle({label,checked,onChange,disabled=false,testId}:{label:string;checked:boolean;onChange:(v:boolean)=>void;disabled?:boolean;testId?:string}) {
  const ref=useRef<HTMLButtonElement>(null);const reduced=useReducedMotion();
  useEffect(()=>{void animate(ref.current?.querySelector("span")??null,springFrames(checked?0:16,checked?16:0,"press","transform",n=>`translateX(${n}px)`),{duration:600});},[checked,reduced]);
  return <button ref={ref} type="button" data-motion="idle" data-testid={testId} className="ui-toggle" role="switch" aria-label={label} aria-checked={checked} disabled={disabled} onClick={()=>onChange(!checked)}><span aria-hidden="true"/></button>;
}
export function ActionMenu({label='Дії',items,children,testId}:{label?:string;items:readonly {label:string;onSelect:()=>void;disabled?:boolean}[];children?:React.ReactNode;testId?:string}) {
  const [open,setOpen]=useState(false);const ref=useRef<HTMLDivElement>(null);const trigger=useRef<HTMLButtonElement>(null);const id=useId();
  useEffect(()=>{if(!open)return;const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();setOpen(false);trigger.current?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',key);const menu=ref.current?.querySelector<HTMLElement>('[role="menu"]');if(menu){menu.showPopover?.();const box=trigger.current!.getBoundingClientRect();const size=menu.getBoundingClientRect();menu.style.left=`${Math.max(16,Math.min(box.left,innerWidth-size.width-16))}px`;menu.style.top=`${Math.max(16,Math.min(box.bottom+8,innerHeight-size.height-16))}px`;menu.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();}return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',key);};},[open]);
  return <div className="ui-action-menu" ref={ref}><button type="button" data-testid={testId} className="ui-menu-trigger" ref={trigger} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>{children??<MoreHorizontal size={20} aria-hidden="true"/>}</button>{open&&<div role="menu" popover="manual" aria-label={label} id={id} onKeyDown={e=>{const buttons=Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));const index=buttons.indexOf(document.activeElement as HTMLButtonElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();}}}>{items.map(item=><button type="button" role="menuitem" key={item.label} disabled={item.disabled} onClick={()=>{setOpen(false);item.onSelect();trigger.current?.focus();}}>{item.label}</button>)}</div>}</div>;
}
export function Slider({label,value,min=0,max=10,step=1,onChange}:{label:string;value:number|null;min?:number;max?:number;step?:number;onChange:(v:number|null)=>void}) {
  const id=useId();const [dragging,setDragging]=useState(false);
  const thumb=useRef<HTMLSpanElement>(null),track=useRef<HTMLDivElement>(null),previous=useRef(value);
  useEffect(()=>{if(previous.current===null&&value!==null){const width=track.current?.getBoundingClientRect().width??0;void animate(thumb.current,springFrames(((min+max)/2-value)/(max-min)*width,0,'smooth','transform',n=>`translateX(calc(-50% + ${n}px))`),{duration:600});}previous.current=value;},[value,min,max]);
  return <div ref={track} className="ui-slider" data-dragging={dragging} data-unset={value===null} style={{'--slider-fill':value===null?'0%':`${(value-min)/(max-min)*100}%`} as React.CSSProperties}><div><label htmlFor={id}>{label}</label><output htmlFor={id}>{value??'-'}</output><ActionMenu label={`Дії: ${label}`} items={[{label:'Скинути',onSelect:()=>onChange(null)}]}/></div><input id={id} aria-valuetext={value===null?'Не заповнено':String(value)} className="planui-slider" type="range" min={min} max={max} step={step} value={value??(min+max)/2} onChange={e=>{if(thumb.current)cancelMotion(thumb.current);onChange(Number(e.target.value));}} onPointerDown={e=>{setDragging(true);e.currentTarget.setPointerCapture(e.pointerId);const r=e.currentTarget.getBoundingClientRect();onChange(Math.max(min,Math.min(max,min+Math.round(((e.clientX-r.left)/r.width)*(max-min)/step)*step)));}} onPointerUp={()=>setDragging(false)} onPointerCancel={()=>setDragging(false)}/><span ref={thumb} data-motion="idle" className="motion-slider-thumb" aria-hidden="true" style={{left:value===null?'50%':`${(value-min)/(max-min)*100}%`}}><i/></span>{dragging&&<span className="ui-slider-bubble" style={{left:value===null?'50%':`${(value-min)/(max-min)*100}%`}}>{value??'-'}</span>}</div>;
}
export function Sheet({children,...props}:Omit<ModalSheetProps,'quickAdd'|'contract'>) {
  return <ModalSheet {...props} quickAdd contract>{children}</ModalSheet>;
}
export function InfoSheet({title,children}:{title:string;children:React.ReactNode}) {
  const [open,setOpen]=useState(false);return <><RoundButton aria-label={`Інформація: ${title}`} onClick={()=>setOpen(true)}><Info size={20} aria-hidden="true"/></RoundButton><Sheet title={title} isOpen={open} onClose={()=>setOpen(false)}><div data-ui="info-sheet">{children}</div></Sheet></>;
}
type NativeFieldProps=Omit<React.InputHTMLAttributes<HTMLInputElement>,'type'|'size'> & {label:string;value:string};
function NativeField({kind,label,value,onChange,...props}:NativeFieldProps&{kind:'date'|'time'}) {
  const id=useId();return <div className="ui-native-field" role="group" aria-label={label}><Row title={label} trailing={<><span>{value?(kind==='date'?formatDate(value):formatTime(value)):'Не заповнено'}</span><ChevronRight size={16} aria-hidden="true"/></>}/><input {...props} id={props.id??id} type={kind} value={value} onChange={onChange} aria-label={label} data-ui="native-overlay"/></div>;
}
export function DateField(props:NativeFieldProps){return <NativeField {...props} kind="date"/>;}
export function TimeField(props:NativeFieldProps){return <NativeField {...props} kind="time"/>;}
export function SelectField({label,value,options,...props}:Omit<React.SelectHTMLAttributes<HTMLSelectElement>,'size'> & {label:string;options:readonly {value:string;label:string}[]}) {
  return <div className="ui-native-field" role="group" aria-label={label}><Row title={label} trailing={<><span>{options.find(o=>o.value===value)?.label??'Не заповнено'}</span><ChevronRight size={16} aria-hidden="true"/></>}/><select {...props} value={value} aria-label={label} data-ui="native-overlay">{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></div>;
}
export function DurationField({label='Тривалість',value,onChange,step=15}:{label?:string;value:number|null;onChange:(v:number|null)=>void;step?:number}) {
  const [open,setOpen]=useState(false);const [draft,setDraft]=useState(value??step);
  return <><button className="ui-disclosure" type="button" onClick={()=>{setDraft(value??step);setOpen(true);}}><Row title={label} trailing={<><span>{value===null?'Не заповнено':formatDuration(value)}</span><ChevronRight size={16} aria-hidden="true"/></>}/></button><Sheet title={label} isOpen={open} onClose={()=>setOpen(false)} footer={<button type="button" className="ui-primary" onClick={()=>{onChange(draft);setOpen(false);}}>Зберегти</button>}><div className="ui-stepper"><button type="button" aria-label="Зменшити тривалість" disabled={draft<=step} onClick={()=>setDraft(Math.max(step,draft-step))}><Icon name="chevron-left"/></button><output aria-live="polite">{formatDuration(draft)}</output><button type="button" aria-label="Збільшити тривалість" onClick={()=>setDraft(draft+step)}><Icon name="plus"/></button></div><ActionMenu label="Дії тривалості" items={[{label:'Скинути',onSelect:()=>{onChange(null);setOpen(false);}}]}/></Sheet></>;
}
export function EmptyState({text,action,onAction,actionTestId}:{text:string;action?:string;onAction?:()=>void;actionTestId?:string}) {
  return <div className="ui-empty" data-ui="empty-state"><i className="ui-icon-tile"><Icon name="sparkles"/></i><span>{text}</span>{action&&<button type="button" data-testid={actionTestId} onClick={onAction}>{action}</button>}</div>;
}
export function Disclosure({title,secondary,onClick,testId}:{title:string;secondary?:string;onClick:()=>void;testId?:string}) {
  return <button type="button" data-testid={testId} className="ui-disclosure" onClick={onClick}><Row title={title} secondary={secondary} trailing={<ChevronRight size={20} aria-hidden="true"/>}/></button>;
}
