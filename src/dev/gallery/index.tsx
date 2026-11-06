/** DEV-only entry: Vite eliminates this dynamic import in production. */
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PageHeader,SubHeader,RoundButton,Section,Row,Segmented,PillRow,Slider,Sheet,Toggle,DateField,TimeField,SelectField,DurationField,ActionMenu,InfoSheet,EmptyState,Disclosure,ItemCard,WeekStrip} from '../../ui';
import {Button,InputField,TextAreaField} from '../../ui/legacy';
import {Toast,InlineBanner} from '../../ui/feedback';
import {Icon,type IconName} from '../../ui/icons';
export function Gallery(){
 const [value,setValue]=useState<number|null>(null),[tab,setTab]=useState('all'),[on,setOn]=useState(false),[sheet,setSheet]=useState(false),[toast,setToast]=useState(false),[duration,setDuration]=useState<number|null>(null);
 return <main className="planui-canvas" style={{padding:16,minHeight:'100dvh',paddingBottom:120}}>
 <PageHeader title="Компоненти" actions={<RoundButton aria-label="Пошук"><Icon name="search"/></RoundButton>}/>
 <Segmented label="Режим" value={tab} onChange={setTab} options={[{value:'all',label:'Усі'},{value:'focus',label:'Фокус'}]}/>
 <PillRow label="Фільтри" value={tab} onChange={setTab} options={[{value:'all',label:'Усі'},{value:'focus',label:'Фокус',count:2}]}/>
 <WeekStrip date="2026-11-05" today="2026-11-05" markers={{'2026-11-05':'day','2026-11-06':'night'}} onChange={()=>{}}/>
 <Section title="Кнопки">{(['primary','secondary','subtle','danger'] as const).map(variant=><Button key={variant} variant={variant}>Додати справу</Button>)}<Button variant="primary" disabled>Недоступно</Button><Button variant="primary" busy>Зберегти</Button></Section>
 <Section title="Поля"><InputField label="Назва"/><InputField label="Помилка" error="Вкажіть назву"/><TextAreaField label="Нотатка"/><DateField label="Дата" value=""/><TimeField label="Час" value="17:30"/><SelectField label="Напрям" value="" options={[{value:'',label:'Не заповнено'}]}/><DurationField value={duration} onChange={setDuration}/><Row title="Значення" value=""/><Row title="Довге значення" value="Творчість та навчання щодня"/><Row title="Сповіщення" trailing={<Toggle label="Сповіщення" checked={on} onChange={setOn}/>}/><Row title="Недоступно" trailing={<Toggle label="Недоступно" checked disabled onChange={()=>{}}/>}/></Section>
 <Section title="Шкали"><Slider label="Без відповіді" value={value} onChange={setValue}/><Slider label="Значення" value={7} onChange={()=>{}}/><Slider label="Мінімум" value={0} onChange={()=>{}}/><Slider label="Максимум" value={10} onChange={()=>{}}/></Section>
 <Section title="Об’єкти">{[32,56,96].map(height=><ItemCard key={height} height={height} title="Розділ книги" meta="09:00" step="Наступний крок"/>)}<EmptyState text="Поки немає справ" action="Додати" onAction={()=>setSheet(true)}/><InlineBanner>Плани перетинаються</InlineBanner></Section>
 <Section title="Навігація"><SubHeader title="Параметри" onBack={()=>{}} actions={<ActionMenu items={[{label:'Редагувати',onSelect:()=>{}}]}/>}/><Disclosure title="Відкрити аркуш" onClick={()=>setSheet(true)}/><InfoSheet title="Пояснення">Збережені дані залишаються на пристрої.</InfoSheet><Button onClick={()=>setToast(true)}>Показати повідомлення</Button></Section>
 <Section title="Іконки"><div style={{display:'flex',gap:16,flexWrap:'wrap',padding:16}}>{('sun moon bed route briefcase calendar check target folder leaf stamp user users compass heart-pulse brain palette wallet book-open home sparkles gift image quote link clock info more-horizontal plus chevron-left chevron-right chevron-up chevron-down x arrow-up search filter star trash2'.split(' ') as IconName[]).map(name=><Icon key={name} name={name}/>)}</div></Section>
 <Sheet title="Нова справа" isOpen={sheet} onClose={()=>setSheet(false)} footer={<Button variant="primary" onClick={()=>setSheet(false)}>Зберегти</Button>}><InputField label="Назва"/><p>Сторінку видно крізь скло.</p></Sheet>
 {toast&&<Toast message="Збережено" onDismiss={()=>setToast(false)}/>}
 </main>;
}
export function mountGallery(){createRoot(document.getElementById('root')!).render(<Gallery/>);}
