/** DEV-only entry: Vite eliminates this dynamic import in production. */
import React,{memo,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PageHeader,SubHeader,RoundButton,Section,Row,Segmented,PillRow,Slider,Sheet,Toggle,DateField,TimeField,SelectField,DurationField,ActionMenu,InfoSheet,EmptyState,Disclosure,ItemCard,WeekStrip,Button,InputField,TextAreaField,Toast,InlineBanner} from '../../ui';
import {useSubScreenTransition,captureOrbRect,usePressFeedback,AmbientCanvas} from '../../ui/motion';
import './style.css';
import {Icon,type IconName} from '../../ui/icons';

const ICONS = 'sun moon bed route briefcase calendar check target folder leaf stamp user users compass heart-pulse brain palette wallet book-open home sparkles gift image quote link clock info more-horizontal plus chevron-left chevron-right chevron-up chevron-down x arrow-up search filter star trash2'.split(' ') as IconName[];

const SEG_OPTIONS = [{value:'all',label:'Усі'},{value:'focus',label:'Фокус'}] as const;
const PILL_OPTIONS = [{value:'all',label:'Усі'},{value:'focus',label:'Фокус',count:2}] as const;

const GallerySegmented = memo(function GallerySegmented() {
  const [mode, setMode] = useState<'all' | 'focus'>('all');
  useEffect(() => {
    const btn1 = document.querySelector<HTMLButtonElement>('.ui-segmented button[aria-pressed="false"]');
    const btn0 = document.querySelector<HTMLButtonElement>('.ui-segmented button[aria-pressed="true"]');
    if (btn1 && btn0) {
      btn1.click();
      requestAnimationFrame(() => btn0.click());
    }
  }, []);
  return <Segmented label="Режим" value={mode} onChange={setMode} options={SEG_OPTIONS}/>;
});

const GalleryPillRow = memo(function GalleryPillRow() {
  const [filter, setFilter] = useState<'all' | 'focus'>('all');
  return <PillRow label="Фільтри" value={filter} onChange={setFilter} options={PILL_OPTIONS}/>;
});

const GalleryFilters = memo(function GalleryFilters() {
  return (
    <>
      <GallerySegmented/>
      <GalleryPillRow/>
    </>
  );
});

const GalleryStaticSections = memo(function GalleryStaticSections({
  onOpenSheet,
  onShowToast,
  onPushSub,
  onPopSub,
}: {
  onOpenSheet: () => void;
  onShowToast: () => void;
  onPushSub: () => void;
  onPopSub: () => void;
}) {
  const [value, setValue] = useState<number | null>(null);
  const [on, setOn] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  return (
    <>
      <WeekStrip date="2026-11-05" today="2026-11-05" markers={{'2026-11-05':'day','2026-11-06':'night'}} onChange={()=>{}}/>
      <Section title="Кнопки">{(['primary','secondary','subtle','danger'] as const).map(variant=><Button key={variant} variant={variant}>Додати справу</Button>)}<Button variant="primary" disabled>Недоступно</Button><Button variant="primary" busy>Зберегти</Button></Section>
      <Section title="Поля"><InputField label="Назва"/><InputField label="Помилка" error="Вкажіть назву"/><TextAreaField label="Нотатка"/><DateField label="Дата" value=""/><TimeField label="Час" value="17:30"/><SelectField label="Напрям" value="" options={[{value:'',label:'Не заповнено'}]}/><DurationField value={duration} onChange={setDuration}/><Row title="Значення" value=""/><Row title="Довге значення" value="Творчість та навчання щодня"/><Row title="Сповіщення" trailing={<Toggle label="Сповіщення" checked={on} onChange={setOn}/>}/><Row title="Недоступно" trailing={<Toggle label="Недоступно" checked disabled onChange={()=>{}}/>}/></Section>
      <Section title="Шкали"><Slider label="Без відповіді" value={value} onChange={setValue}/><Slider label="Значення" value={7} onChange={()=>{}}/><Slider label="Мінімум" value={0} onChange={()=>{}}/><Slider label="Максимум" value={10} onChange={()=>{}}/></Section>
      <Section title="Об’єкти">{[32,56,96].map(height=><ItemCard key={height} height={height} title="Розділ книги" meta="09:00" step="Наступний крок"/>)}<EmptyState text="Поки немає справ" action="Додати" onAction={onOpenSheet}/><InlineBanner>Плани перетинаються</InlineBanner></Section>
      <Section title="Навігація"><SubHeader title="Параметри" onBack={onPopSub} actions={<ActionMenu items={[{label:'Редагувати',onSelect:()=>{}}]}/>}/><Disclosure title="Підрозділ" onClick={onPushSub}/><Disclosure title="Відкрити аркуш" onClick={onOpenSheet}/><InfoSheet title="Пояснення">Збережені дані залишаються на пристрої.</InfoSheet><Button onClick={onShowToast}>Показати повідомлення</Button></Section>
      <Section title="Іконки"><div style={{display:'flex',gap:16,flexWrap:'wrap',padding:16}}>{ICONS.map(name=><Icon key={name} name={name}/>)}</div></Section>
    </>
  );
});

const GalleryOverlays = memo(function GalleryOverlays() {
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState(false);
  useEffect(() => {
    const onOpenSheet = () => setSheet(true);
    const onShowToast = () => setToast(true);
    window.addEventListener('gallery:open-sheet', onOpenSheet);
    window.addEventListener('gallery:show-toast', onShowToast);
    return () => {
      window.removeEventListener('gallery:open-sheet', onOpenSheet);
      window.removeEventListener('gallery:show-toast', onShowToast);
    };
  }, []);
  const closeSheet = React.useCallback(() => setSheet(false), []);
  const dismissToast = React.useCallback(() => setToast(false), []);
  return (
    <>
      <Sheet title="Нова справа" isOpen={sheet} onClose={closeSheet} footer={<Button variant="primary" onClick={closeSheet}>Зберегти</Button>}><InputField label="Назва"/><p>Сторінку видно крізь скло.</p></Sheet>
      {toast && <Toast message="Збережено" onDismiss={dismissToast}/>}
    </>
  );
});

export function Gallery(){
 const [subScreen,setSubScreen]=useState(false);
 const {containerRef,captureOutgoingScreen}=useSubScreenTransition(subScreen?'sub':'root',k=>k==='sub');
 const orbPress=usePressFeedback<HTMLButtonElement>();
 const openSheet=React.useCallback(()=>window.dispatchEvent(new Event('gallery:open-sheet')),[]);
 const showToast=React.useCallback(()=>window.dispatchEvent(new Event('gallery:show-toast')),[]);
 const pushSub=React.useCallback(()=>{captureOutgoingScreen();setSubScreen(true);},[captureOutgoingScreen]);
 const popSub=React.useCallback(()=>{captureOutgoingScreen();setSubScreen(false);},[captureOutgoingScreen]);
 return <main ref={containerRef} data-motion="idle" className="planui-canvas dev-gallery" style={{padding:16,minHeight:'100dvh',paddingBottom:120}}>
 <AmbientCanvas/>
 <PageHeader title="Компоненти" actions={<><RoundButton aria-label="Пошук"><Icon name="search"/></RoundButton><button type="button" aria-label="Швидке додавання" data-testid="gallery-quick-add-orb" className="planui-floating-action planui-pressable ui-pressable" onPointerDown={orbPress.onPointerDown} onPointerUp={orbPress.onPointerUp} onPointerLeave={orbPress.onPointerLeave} onPointerCancel={orbPress.onPointerCancel} onClick={e=>{captureOrbRect(e.currentTarget);openSheet();}}><Icon name="plus"/></button></>}/>
 <GalleryFilters/>
 <GalleryStaticSections onOpenSheet={openSheet} onShowToast={showToast} onPushSub={pushSub} onPopSub={popSub}/>
 <GalleryOverlays/>
 </main>;
}
export function mountGallery(){createRoot(document.getElementById('root')!).render(<Gallery/>);}
