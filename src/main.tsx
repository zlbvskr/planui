import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const cancelGesture = (event: Event) => event.preventDefault();
for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(name, cancelGesture, {passive: false});
}

if (import.meta.env.DEV && location.pathname === '/dev/gallery') {
  import('./dev/gallery').then(({mountGallery}) => mountGallery());
} else {
  createRoot(document.getElementById('root')!).render(<App />);
}
