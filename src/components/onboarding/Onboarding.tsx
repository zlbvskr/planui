import { useState } from 'react';
import calendar from '../../assets/art/hero-calendar.webp';
import habits from '../../assets/art/hero-medal.webp';
import areas from '../../assets/art/hero-sphere-empty.webp';
import goals from '../../assets/art/hero-target.webp';

const slides = [
  { title: 'Плануй місяць легко', description: 'Усі важливі дати завжди перед очима', image: calendar },
  { title: 'Створюй корисні звички', description: 'Маленькі кроки щодня ведуть до результату', image: habits },
  { title: 'Бачиш, які сфери просідають', description: 'Приділяй увагу тому, що важливо саме тобі', image: areas },
  { title: 'Цілі', description: 'Тримай свої цілі перед очима та рухайся до них', image: goals },
];

const storageKey = 'planui_onboarding_completed';

export function Onboarding() {
  const [visible, setVisible] = useState(() => {
    try { return localStorage.getItem(storageKey) !== '1'; } catch { return true; }
  });
  const [step, setStep] = useState(0);
  if (!visible) return null;
  const slide = slides[step];
  const finish = () => {
    try { localStorage.setItem(storageKey, '1'); } catch { /* The flow remains dismissible if storage is unavailable. */ }
    setVisible(false);
  };
  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title" onKeyDown={(event) => { if (event.key === 'Tab') { const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button'); if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[buttons.length - 1].focus(); } else if (!event.shiftKey && document.activeElement === buttons[buttons.length - 1]) { event.preventDefault(); buttons[0].focus(); } } }}>
      <div className="onboarding__inner">
        <header className="onboarding__header">
          <div className="onboarding__brand"><img src={`${import.meta.env.BASE_URL}pwa-192x192.png`} alt="" /><span>Мій планер</span></div>
          <button className="onboarding__skip" type="button" onClick={finish} autoFocus>Пропустити</button>
        </header>
        <div className="onboarding__visual"><img src={slide.image} alt="" /></div>
        <div className="onboarding__copy" aria-live="polite">
          <h1 id="onboarding-title">{slide.title}</h1>
          <p>{slide.description}</p>
        </div>
        <div className="onboarding__dots" aria-label={`Крок ${step + 1} з ${slides.length}`}>
          {slides.map((item, index) => <span key={item.title} className={index === step ? 'is-active' : ''} />)}
        </div>
        <button className={`onboarding__next${step === slides.length - 1 ? ' is-complete' : ''}`} type="button" onClick={() => step === slides.length - 1 ? finish() : setStep(step + 1)}>
          {step === slides.length - 1 ? 'Почати' : 'Далі'} <span aria-hidden="true">›</span>
        </button>
      </div>
    </div>
  );
}

