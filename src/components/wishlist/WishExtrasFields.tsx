import React, { useEffect, useRef, useState } from 'react';
import type { MediaAssetMeta, Project } from '../../domain/types';
import { validateAndPrepareRasterMedia, MediaObjectUrlRegistry } from '../../domain/personalSpace';
import { MAX_SINGLE_MEDIA_BYTES } from '../../domain/validation';
import { Button, InputField, SelectField } from '../ui/primitives';
export interface WishExtrasDraft {linkUrl:string;projectId:string;preparedMedia:{meta:MediaAssetMeta;bytes:Uint8Array}|null;removeImage:boolean;validating:boolean;imageError:boolean}
export const emptyWishExtras = (projectId=''):WishExtrasDraft => ({linkUrl:'',projectId,preparedMedia:null,removeImage:false,validating:false,imageError:false});
export function resolveWishExtras(value:WishExtrasDraft,existingMediaId?:string|null) {
  if(value.validating) throw new Error('Зачекайте завершення перевірки зображення.');
  if(value.imageError) throw new Error('Оберіть коректне зображення або вилучіть вибраний файл.');
  return {linkUrl:value.linkUrl.trim()||null,projectId:value.projectId||null,mediaId:value.removeImage?null:value.preparedMedia?.meta.id??existingMediaId??null};
}
export function WishExtrasFields({value,onChange,projects,existingMediaId,onError}: {value:WishExtrasDraft;onChange:React.Dispatch<React.SetStateAction<WishExtrasDraft>>;projects:readonly Project[];existingMediaId?:string|null;onError:(text:string)=>void}) {
  const version=useRef(0);useEffect(()=>()=>{version.current++;onChange(v=>v.validating?{...v,validating:false,imageError:true}:v);},[onChange]);
  async function select(file?:File) {
    const token=++version.current;if(!file)return;
    onChange(v=>({...v,validating:true,imageError:false}));
    try {
      if(file.size>MAX_SINGLE_MEDIA_BYTES)throw new Error('Файл перевищує дозволений розмір 15 МБ.');
      const prepared=await validateAndPrepareRasterMedia({id:crypto.randomUUID(),bytes:new Uint8Array(await file.arrayBuffer()),declaredMimeType:file.type,nowIso:new Date().toISOString()});
      const blob=new Blob([prepared.bytes as unknown as BlobPart],{type:prepared.meta.mimeType});
      if(typeof createImageBitmap==='function'){const bitmap=await createImageBitmap(blob);bitmap.close();}
      else {const url=URL.createObjectURL(blob);try{await new Promise<void>((resolve,reject)=>{const image=new Image();image.onload=()=>resolve();image.onerror=()=>reject(new Error('Зображення пошкоджене або не підтримується.'));image.src=url;});}finally{URL.revokeObjectURL(url);}}
      if(token===version.current)onChange(v=>({...v,preparedMedia:prepared,removeImage:false,validating:false,imageError:false}));
    }catch{if(token===version.current){onChange(v=>({...v,preparedMedia:null,validating:false,imageError:true}));onError('Не вдалося перевірити зображення. Потрібен коректний JPEG, PNG або WebP до 15 МБ.');}}
  }
  return <div className="space-y-3">
    <InputField label="Посилання (HTTP або HTTPS, необов’язково)" value={value.linkUrl} onChange={e=>onChange(v=>({...v,linkUrl:e.target.value}))}/>
    <SelectField label="Пов’язаний проєкт (необов’язково)" value={value.projectId} onChange={e=>onChange(v=>({...v,projectId:e.target.value}))} options={[{value:'',label:'Без проєкту'},...projects.map(p=>({value:p.id,label:p.title}))]}/>
    <label className="block">Локальне зображення (JPEG, PNG або WebP, до 15 МБ)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>{const file=e.target.files?.[0];e.target.value='';void select(file);}}/></label>
    {value.validating&&<p role="status">Перевірка зображення…</p>}
    {value.preparedMedia&&<p>Зображення перевірено, готове до збереження.</p>}
    {(existingMediaId||value.preparedMedia||value.imageError)&&<Button onClick={()=>{version.current++;onChange(v=>({...v,preparedMedia:null,removeImage:true,validating:false,imageError:false}));}}>Вилучити зображення з бажання</Button>}
    {value.removeImage&&<p>Зображення буде від’єднано після збереження.</p>}
  </div>;
}
export function WishLocalImage({meta,bytes,title}:{meta?:MediaAssetMeta;bytes?:Uint8Array;title:string}) {
  const [url,setUrl]=useState(''),[broken,setBroken]=useState(false);
  useEffect(()=>{const registry=new MediaObjectUrlRegistry();setBroken(false);setUrl(meta&&bytes?registry.getOrCreateUrl(meta.id,bytes,meta.mimeType):'');return()=>{registry.revokeAll();};},[meta,bytes]);
  return url&&!broken?<img src={url} alt={`Зображення бажання: ${title}`} className="max-h-48 max-w-full rounded-xl object-contain" onError={()=>setBroken(true)}/>:<p>Локальне зображення недоступне або пошкоджене.</p>;
}
