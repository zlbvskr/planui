import { useMotionEntrance } from '../../ui/motion';
import { SphereStepMarker } from '../../ui/spheres';
import { Task } from '../../domain/types';
import { Icon } from '../../ui/icons';
import { HeroArt } from '../../ui/art';

/** A compact working brief. The schedule, not decoration, owns the page. */
export function TodayOverview({ focus, tasks, onInspect, onTasks, supportsArea }: {
  supportsArea: (task: Task) => boolean;
  focus?: Task; tasks: readonly Task[]; onInspect: (task: Task) => void; onTasks: () => void;
}) {
  const completed = tasks.filter(task => task.state === 'completed').length;
  const closed = tasks.length > 0 && tasks.every(task=>task.state==='completed');
  const closedRef = useMotionEntrance<HTMLDivElement>(closed);
  if (!focus && !tasks.length) return null;
  return <section className="today-brief pearl-glass" aria-label="Огляд дня">
    {closed && <div ref={closedRef} className="day-closed" role="status"><HeroArt name="medal" size={56}/><div><strong>День закрито</strong><p>Усі завдання дня виконано.</p></div><span className="day-closed-confetti" aria-hidden="true">{Array.from({length:6},(_,i)=><i key={i} style={{transform:`rotate(${i*60}deg) translateY(-28px)`}}/>)}</span></div>}
    {focus && <div className="today-brief-focus">
      <div className="today-brief-copy"><span className="soft-jelly">Фокус дня</span><h2>{supportsArea(focus) && <SphereStepMarker />}{focus.title}</h2></div>
      <HeroArt name="target" size={56} />
      <button className="candy-gloss today-brief-open" aria-label="Відкрити завдання" onClick={() => onInspect(focus)}><Icon name="arrow-up-right" size={21}/></button>
    </div>}
    {tasks.length > 0 && <button className="today-brief-progress" onClick={onTasks} aria-label={`Мої завдання: виконано ${completed} із ${tasks.length}`}>
      <span>Мої завдання <strong>{completed}<small> / {tasks.length}</small></strong></span>
      <span className="today-brief-meter" aria-hidden="true"><i style={{width:`${completed / tasks.length * 100}%`}}/></span>
      <Icon name="chevron-right" size={15}/>
    </button>}
  </section>;
}
