import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { createRepository } from './data';
import { createAppStore } from './store/appStore';
import { StoreProvider } from './store/context';
import './styles/global.css';

registerSW({ immediate: true });

const repo = await createRepository();
const store = createAppStore(repo);
void store.getState().init();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider store={store}>
      <HashRouter>
        <App demo={repo.mode === 'local'} />
      </HashRouter>
    </StoreProvider>
  </StrictMode>,
);
