import React from 'react';
import { Button } from './legacy';
export function OptionalSlider({label,value,max=5,onChange}:{label:string;value:number|null;max?:number;onChange:(value:number|null)=>void}) {
 return <fieldset className="space-y-2"><legend className="text-sm font-medium">{label}: {value ?? 'Без відповіді'}</legend><input className="planui-slider w-full" aria-label={label} aria-valuetext={value === null ? 'Без відповіді; змініть повзунок, щоб відповісти' : String(value)} type="range" min={max===10 ? 0 : 1} max={max} step="1" value={value ?? Math.ceil(max/2)} onChange={event=>onChange(Number(event.target.value))} /><Button size="sm" onClick={()=>onChange(null)}>Без відповіді</Button></fieldset>;
}
