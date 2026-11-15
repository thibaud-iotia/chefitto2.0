import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { LocalRepository } from '../data/localRepository';
import { noImageFinder, type ImageFinder } from '../data/recipeImages';
import type { FridgeScanner } from '../data/fridgeScan';
import { useRecipeForm } from '../screens/formStore';
import { createAppStore } from '../store/appStore';
import { StoreProvider } from '../store/context';

/** Scanner par défaut des tests : aucun appel réseau. */
const noScanner: FridgeScanner = { scan: async () => [] };

/**
 * Monte l'app complète sur un LocalRepository, éventuellement déjà connectée.
 * Par défaut, aucune photo n'est cherchée (`images`) : les tests restent sans réseau et déterministes.
 */
export async function renderApp({
  route = '/',
  signedIn = true,
  images = noImageFinder,
  scanner = noScanner,
}: { route?: string; signedIn?: boolean; images?: ImageFinder; scanner?: FridgeScanner } = {}) {
  useRecipeForm.getState().reset();
  const repo = new LocalRepository();
  const store = createAppStore(repo, undefined, images, scanner);
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
