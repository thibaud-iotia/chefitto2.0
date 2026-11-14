import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { LocalRepository } from '../data/localRepository';
import { useRecipeForm } from '../screens/formStore';
import { createAppStore } from '../store/appStore';
import { StoreProvider } from '../store/context';

/** Monte l'app complète sur un LocalRepository, éventuellement déjà connectée. */
export async function renderApp({ route = '/', signedIn = true }: { route?: string; signedIn?: boolean } = {}) {
  useRecipeForm.getState().reset();
  const repo = new LocalRepository();
  const store = createAppStore(repo);
  await store.getState().init();
  if (signedIn) await store.getState().signIn('toto@cuisine.fr', 'secret1');
  const user = userEvent.setup();
  const utils = render(
    <StoreProvider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <App demo />
      </MemoryRouter>
    </StoreProvider>,
  );
  return { ...utils, user, store, repo };
}
