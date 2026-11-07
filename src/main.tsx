import {createRoot} from 'react-dom/client';
import '@fontsource/lora/latin-400-italic.css';
import '@fontsource/lora/cyrillic-400-italic.css';
import '@fontsource/lora/latin-500-italic.css';
import '@fontsource/lora/cyrillic-500-italic.css';
import App from './App.tsx';
import './index.css';

const cancelGesture = (event: Event) => event.preventDefault();
for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(name, cancelGesture, {passive: false});
  window.addEventListener(name, cancelGesture, {passive: false});
}

const normalizeTextScale = () => {
  const raw = document.documentElement.style.getPropertyValue('--text-scale').trim();
  if (raw.endsWith('%')) {
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      document.documentElement.style.setProperty('--text-scale', String(parsed / 100));
    }
  }
};
normalizeTextScale();
new MutationObserver(normalizeTextScale).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['style'],
});

if (import.meta.env.DEV && location.pathname === '/dev/gallery') {
  import('./dev/gallery').then(({mountGallery}) => mountGallery());
} else {
  createRoot(document.getElementById('root')!).render(<App />);
}
