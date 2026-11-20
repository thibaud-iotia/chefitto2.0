import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toIsoDate } from '../domain/calendar';
import { SEED_RECIPES } from '../domain/seed';
import { renderApp } from '../test/renderApp';

/** Fige la date du jour à midi. Seul `Date` est simulé : les minuteries restent réelles (userEvent, toasts). */
function setToday(year: number, month: number, day: number) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(year, month - 1, day, 12));
}

describe('Splash & Auth', () => {
  it('splash → auth → connexion → accueil', async () => {
    const { user } = await renderApp({ signedIn: false });
    expect(screen.getByRole('heading', { name: /votre frigo/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(screen.getByRole('heading', { name: 'Content de vous revoir.' })).toBeInTheDocument();
    expect(screen.getByText(/Mode démo/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Me connecter' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Email invalide');

    await user.type(screen.getByLabelText('Email'), 'toto@cuisine.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'secret1');
    await user.click(screen.getByRole('button', { name: 'Me connecter' }));
    expect(await screen.findByText(/Que cuisine-t-on/)).toBeInTheDocument();
  });

  it('inscription : vérifie la confirmation du mot de passe', async () => {
    const { user } = await renderApp({ signedIn: false, route: '/auth' });
    await user.click(screen.getByRole('tab', { name: 'Inscription' }));
    expect(screen.getByRole('heading', { name: 'Créez votre compte.' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), 'a@b.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'secret1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'autre12');
    await user.click(screen.getByRole('button', { name: "Je m'inscris" }));
    expect(screen.getByRole('alert')).toHaveTextContent('ne correspondent pas');
  });

  it('inscription avec confirmation email', async () => {
    const { user, repo } = await renderApp({ signedIn: false, route: '/auth' });
    vi.spyOn(repo, 'signUp').mockResolvedValueOnce(null as never);
    await user.click(screen.getByRole('tab', { name: 'Inscription' }));
    await user.type(screen.getByLabelText('Email'), 'a@b.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'secret1');
    await user.type(screen.getByLabelText('Confirmer le mot de passe'), 'secret1');
    await user.click(screen.getByRole('button', { name: "Je m'inscris" }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Confirmez votre email/);
  });

  it('mot de passe oublié', async () => {
    const { user } = await renderApp({ signedIn: false, route: '/auth' });
    await user.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Saisissez votre email/);
    await user.type(screen.getByLabelText('Email'), 'a@b.fr');
    await user.click(screen.getByRole('button', { name: 'Mot de passe oublié ?' }));
    expect(await screen.findByText(/lien de réinitialisation/)).toBeInTheDocument();
  });

  it('affiche l’erreur de connexion du serveur', async () => {
    const { user, repo } = await renderApp({ signedIn: false, route: '/auth' });
    vi.spyOn(repo, 'signIn').mockRejectedValueOnce(new Error('Email ou mot de passe incorrect'));
    await user.type(screen.getByLabelText('Email'), 'a@b.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'secret1');
    await user.click(screen.getByRole('button', { name: 'Me connecter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email ou mot de passe incorrect');
  });

  it('redirige une route inconnue vers le splash quand déconnecté', async () => {
    await renderApp({ signedIn: false, route: '/fridge' });
    expect(screen.getByRole('button', { name: 'Commencer' })).toBeInTheDocument();
  });
});

describe('Accueil', () => {
  it('filtre par catégorie, recherche et favoris', async () => {
    const { user } = await renderApp({ route: '/home' });
    const list = screen.getByRole('list', { name: 'Recettes' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(8);

    await user.click(screen.getByRole('tab', { name: 'Desserts' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);

    await user.click(screen.getByRole('tab', { name: 'Tout' }));
    await user.type(screen.getByRole('searchbox'), 'salade');
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Ajouter Salade de légumes aux favoris' }));
    await user.clear(screen.getByRole('searchbox'));
    await user.click(screen.getByRole('tab', { name: /Favoris/ }));
    expect(within(screen.getByRole('list', { name: 'Recettes' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('affiche un état vide', async () => {
    const { user } = await renderApp({ route: '/home' });
    await user.type(screen.getByRole('searchbox'), 'zzzz');
    expect(screen.getByText(/Aucune recette ici/)).toBeInTheDocument();
  });

  it('le héros ouvre la meilleure recette', async () => {
    const { user } = await renderApp({ route: '/home' });
    await user.click(screen.getByRole('button', { name: /Voir la recette/ }));
    expect(screen.getByRole('heading', { level: 1, name: 'Salade de tomate' })).toBeInTheDocument();
  });

  it('navigation basse et avatar', async () => {
    const { user } = await renderApp({ route: '/home' });
    await user.click(screen.getByRole('button', { name: 'Mon profil' }));
    expect(screen.getByRole('heading', { name: 'Mon profil' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Frigo' }));
    expect(screen.getByRole('heading', { name: 'Mon frigo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter une recette' }));
    expect(screen.getByRole('heading', { name: 'Nouvelle recette' })).toBeInTheDocument();
  });
});

describe('Détail, planification et cuisine', () => {
  afterEach(() => vi.useRealTimers());

  it('ingrédients au frigo, favori, planifier, cuisiner jusqu’au bout', async () => {
    setToday(2026, 11, 16); // lundi
    const { user, store } = await renderApp({ route: '/home' });
    await user.click(screen.getByRole('link', { name: 'Veggie tomato mix' }));
    expect(screen.getByText('4/5 au frigo')).toBeInTheDocument();
    expect(screen.getAllByText('À acheter')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));
    expect(screen.getByRole('button', { name: 'Retirer des favoris' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    const sheet = screen.getByRole('dialog', { name: /Planifier Veggie/ });
    await user.click(within(sheet).getByRole('button', { name: /Mardi 17 · Soir/ }));
    expect(Object.keys(store.getState().plan)).toEqual(['2026-11-17:1']);
    expect(await screen.findByText('Ajouté au planning · mardi 17 nov. soir')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Commencer à cuisiner' }));
    expect(screen.getByText('ÉTAPE 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Précédent' })).toBeDisabled();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Étape suivante' }));
    await user.click(screen.getByRole('button', { name: 'Précédent' }));
    expect(screen.getByText('ÉTAPE 3')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Étape suivante' }));
    await user.click(screen.getByRole('button', { name: 'Terminer' }));
    expect(await screen.findByText('Bon appétit !')).toBeInTheDocument();
    expect(screen.getByText(/Que cuisine-t-on/)).toBeInTheDocument();
  });

  it('« Planifier » : à partir d’aujourd’hui, sur 4 semaines, semaine par semaine', async () => {
    setToday(2026, 11, 20); // vendredi
    const { user, store } = await renderApp({ route: '/home' });
    const recipe = store.getState().recipes[0]!;
    await user.click(screen.getByRole('link', { name: recipe.name }));
    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    const sheet = screen.getByRole('dialog', { name: `Planifier ${recipe.name}` });
    const slots = () => within(sheet).getAllByRole('button', { name: / · (Midi|Soir)/ });
    const prev = () => within(sheet).getByRole('button', { name: 'Semaine précédente' });
    // Fonctions : la feuille recrée ses flèches à chaque ouverture.
    const next = () => within(sheet).getByRole('button', { name: 'Semaine suivante' });

    // Semaine en cours : vendredi, samedi, dimanche (pas de créneau dans le passé), pas de retour en arrière.
    expect(within(sheet).getByText('Semaine du 16 au 22 nov.')).toBeInTheDocument();
    expect(slots().map((b) => b.textContent)).toEqual([
      'Vendredi 20 · Midilibre',
      'Vendredi 20 · Soirlibre',
      'Samedi 21 · Midilibre',
      'Samedi 21 · Soirlibre',
      'Dimanche 22 · Midilibre',
      'Dimanche 22 · Soirlibre',
    ]);
    expect(prev()).toHaveAttribute('aria-disabled', 'true');
    await user.click(prev());
    expect(within(sheet).getByText('Semaine du 16 au 22 nov.')).toBeInTheDocument();

    // Semaine suivante : les 14 créneaux.
    await user.click(next());
    expect(within(sheet).getByText('Semaine du 23 au 29 nov.')).toBeInTheDocument();
    expect(slots()).toHaveLength(14);
    expect(next()).toHaveFocus(); // le focus reste sur la flèche
    await user.click(within(sheet).getByRole('button', { name: /Lundi 23 · Midi/ }));
    expect(store.getState().plan).toEqual({ '2026-11-23:0': recipe.id });
    expect(await screen.findByText('Ajouté au planning · lundi 23 nov. midi')).toBeInTheDocument();

    // Rouverte : semaine en cours ; le créneau choisi est marqué « déjà prévu ».
    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    expect(within(sheet).getByText('Semaine du 16 au 22 nov.')).toBeInTheDocument();
    await user.click(next());
    expect(within(sheet).getByRole('button', { name: /Lundi 23 · Midi/ })).toHaveTextContent('déjà prévu');

    // Horizon : la semaine du 7 déc. est la dernière.
    await user.click(next());
    await user.click(next());
    expect(within(sheet).getByText('Semaine du 7 au 13 déc.')).toBeInTheDocument();
    expect(next()).toHaveAttribute('aria-disabled', 'true');
    await user.click(next());
    expect(within(sheet).getByText('Semaine du 7 au 13 déc.')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: /Dimanche 13 · Soir/ }));
    expect(store.getState().plan['2026-12-13:1']).toBe(recipe.id);
  });

  it('« Planifier » : un échec n’affiche pas « Ajouté au planning »', async () => {
    const { user, store, repo } = await renderApp({ route: '/home' });
    vi.spyOn(repo, 'setPlanEntry').mockRejectedValueOnce(new Error('Connexion réseau impossible'));
    await user.click(screen.getByRole('link', { name: store.getState().recipes[0]!.name }));
    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    await user.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: / · Midi/ })[0]!);
    expect(await screen.findByText('Connexion réseau impossible')).toBeInTheDocument();
    expect(screen.queryByText(/Ajouté au planning/)).not.toBeInTheDocument();
    expect(store.getState().plan).toEqual({});
  });

  it('quitter le mode cuisine revient au détail ; Échap ferme la sheet', async () => {
    const { user, store } = await renderApp({ route: '/home' });
    const id = store.getState().recipes[0]!.id;
    await user.click(screen.getByRole('link', { name: store.getState().recipes[0]!.name }));
    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    await user.keyboard('{Escape}');
    expect(store.getState().sheet).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Commencer à cuisiner' }));
    await user.click(screen.getByRole('button', { name: 'Quitter' }));
    expect(screen.getByRole('button', { name: 'Commencer à cuisiner' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByText(/Que cuisine-t-on/)).toBeInTheDocument();
    expect(id).toBeTruthy();
  });

  it('nombre de personnes : s’ouvre pour le foyer, recalcule les quantités, revient à la recette', async () => {
    const { user, store } = await renderApp({ route: '/home' });
    await act(() =>
      store.getState().addRecipe({
        ...SEED_RECIPES[0]!,
        name: 'Crêpes',
        ingredients: ['250 g de farine', '3 oeufs', '1/2 l de lait', 'Sel'],
        servings: 4,
      }),
    );
    await user.click(screen.getAllByRole('link', { name: 'Crêpes' })[0]!);
    const stepper = screen.getByRole('group', { name: 'Nombre de personnes' });
    const ingredients = () => within(screen.getByRole('region', { name: 'Ingrédients' })).getAllByRole('listitem').map((li) => li.textContent);

    // Foyer par défaut : 2 personnes → quantités divisées par 2.
    expect(within(stepper).getByText('2 personnes')).toHaveAttribute('aria-live', 'polite');
    expect(ingredients()).toEqual([
      expect.stringContaining('125 g de farine'),
      expect.stringContaining('1 ½ oeufs'),
      expect.stringContaining('¼ l de lait'),
      expect.stringContaining('Sel'),
    ]);
    expect(screen.getByText(/Quantités recalculées · recette prévue pour 4 personnes/)).toBeInTheDocument();

    await user.click(within(stepper).getByRole('button', { name: 'Une personne de plus' }));
    await user.click(within(stepper).getByRole('button', { name: 'Une personne de plus' }));
    expect(within(stepper).getByText('4 personnes')).toBeInTheDocument();
    expect(ingredients()[0]).toContain('250 g de farine');
    expect(screen.queryByText(/Quantités recalculées/)).not.toBeInTheDocument();

    await user.click(within(stepper).getByRole('button', { name: 'Une personne de plus' }));
    expect(ingredients().slice(0, 2)).toEqual([expect.stringContaining('315 g de farine'), expect.stringContaining('3 ¾ oeufs')]);
    await user.click(screen.getByRole('button', { name: 'Revenir à 4' }));
    expect(ingredients()[0]).toContain('250 g de farine');

    const minus = within(stepper).getByRole('button', { name: 'Une personne de moins' });
    for (let i = 0; i < 3; i++) await user.click(minus);
    expect(within(stepper).getByText('1 personne')).toBeInTheDocument();
    expect(minus).toBeDisabled();
    // Le recalcul ne touche pas la recette enregistrée.
    expect(store.getState().recipes[0]).toMatchObject({ servings: 4, ingredients: ['250 g de farine', '3 oeufs', '1/2 l de lait', 'Sel'] });
  });

  it('recette inconnue → accueil', async () => {
    await renderApp({ route: '/recipe/nope' });
    expect(screen.getByText(/Que cuisine-t-on/)).toBeInTheDocument();
    await renderApp({ route: '/recipe/nope/cook' });
    expect(screen.getAllByText(/Que cuisine-t-on/).length).toBeGreaterThan(0);
  });
});

describe('Planning', () => {
  afterEach(() => vi.useRealTimers());

  it('choisir, changer puis retirer un repas (jour passé compris)', async () => {
    setToday(2026, 11, 20); // vendredi
    const { user, store } = await renderApp({ route: '/planning' });
    const friday = screen.getByRole('tab', { name: 'Vendredi 20 novembre' });
    expect(friday).toHaveAttribute('aria-selected', 'true');
    expect(friday).toHaveAttribute('aria-current', 'date');
    expect(screen.getByRole('heading', { name: 'Vendredi 20 novembre' })).toBeInTheDocument();

    const monday = screen.getByRole('tab', { name: 'Lundi 16 novembre' });
    expect(monday).toHaveAttribute('data-past');
    expect(friday).not.toHaveAttribute('data-past');
    await user.click(monday);
    await user.click(screen.getByRole('button', { name: /Choisir le repas du Lundi 16 novembre midi/ }));
    const sheet = screen.getByRole('dialog', { name: 'Lundi 16 nov. · Midi' });
    await user.click(within(sheet).getByRole('button', { name: /Mousse au chocolat/ }));
    expect(within(screen.getByTestId('slot-0')).getByText('Mousse au chocolat')).toBeInTheDocument();
    expect(screen.getByText('1 repas sur 14 cette semaine')).toBeInTheDocument();
    expect(Object.keys(store.getState().plan)).toEqual(['2026-11-16:0']);

    await user.click(screen.getByRole('button', { name: /Changer le repas du Lundi 16 novembre midi/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retirer ce repas' }));
    expect(store.getState().plan).toEqual({});
  });

  it('semaine suivante, horizon de 4 semaines, historique, retour à aujourd’hui', async () => {
    setToday(2026, 11, 20); // vendredi
    const { user, store } = await renderApp({ route: '/planning' });
    const next = screen.getByRole('button', { name: 'Semaine suivante' });
    const prev = screen.getByRole('button', { name: 'Semaine précédente' });
    expect(screen.getByText('Semaine du 16 au 22 nov.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: "Aujourd'hui" })).not.toBeInTheDocument();

    // Semaine prochaine : même jour de la semaine sélectionné.
    await user.click(next);
    expect(screen.getByText('Semaine du 23 au 29 nov.')).toBeInTheDocument();
    expect(screen.getByText('0 repas sur 14 la semaine prochaine')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Vendredi 27 novembre' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Vendredi 20 novembre' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Lundi 23 novembre' }));
    await user.click(screen.getByRole('button', { name: /Choisir le repas du Lundi 23 novembre soir/ }));
    await user.click(within(screen.getByRole('dialog', { name: 'Lundi 23 nov. · Soir' })).getByRole('button', { name: /Mousse au chocolat/ }));
    expect(store.getState().plan).toEqual({ [`2026-11-23:1`]: expect.any(String) });
    expect(screen.getByText('1 repas sur 14 la semaine prochaine')).toBeInTheDocument();

    // Horizon : 3 semaines après la semaine en cours.
    await user.click(next);
    await user.click(next);
    expect(screen.getByText('Semaine du 7 au 13 déc.')).toBeInTheDocument();
    expect(screen.getByText('0 repas sur 14 dans 3 semaines')).toBeInTheDocument();
    expect(next).toHaveAttribute('aria-disabled', 'true');
    await user.click(next);
    expect(screen.getByText('Semaine du 7 au 13 déc.')).toBeInTheDocument();

    // Retour à aujourd'hui.
    await user.click(screen.getByRole('button', { name: "Aujourd'hui" }));
    expect(screen.getByText('Semaine du 16 au 22 nov.')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Vendredi 20 novembre' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('0 repas sur 14 cette semaine')).toBeInTheDocument();

    // Historique : semaines passées sans limite.
    expect(prev).toHaveAttribute('aria-disabled', 'false');
    await user.click(prev);
    expect(screen.getByText('Semaine du 9 au 15 nov.')).toBeInTheDocument();
    expect(screen.getByText('0 repas sur 14 la semaine dernière')).toBeInTheDocument();
    await user.click(prev);
    expect(screen.getByText('0 repas sur 14 il y a 2 semaines')).toBeInTheDocument();
  });

  it('accueil (semaine en cours) et profil (repas à venir) ne comptent que ce qui les concerne', async () => {
    setToday(2026, 11, 20); // vendredi
    const { store, unmount } = await renderApp({ route: '/home' });
    const [a, b] = store.getState().recipes;
    await act(async () => {
      await store.getState().setPlanEntry('2026-11-16', 0, a!.id); // lundi passé, cette semaine
      await store.getState().setPlanEntry('2026-11-20', 1, b!.id); // ce soir
      await store.getState().setPlanEntry('2026-11-24', 0, a!.id); // semaine prochaine
      await store.getState().setPlanEntry('2026-11-09', 0, a!.id); // semaine dernière
    });
    expect(screen.getByRole('link', { name: /repas planifiés/ })).toHaveTextContent('2/14');
    unmount();

    await renderApp({ route: '/profile' });
    // Nouvelle instance : mêmes données locales (même utilisateur).
    expect(screen.getByText('repas à venir').previousSibling).toHaveTextContent('2');
  });

  it('clic sur le fond ferme la sheet', async () => {
    const { user, store } = await renderApp({ route: '/planning' });
    await user.click(screen.getAllByRole('button', { name: /^Choisir/ })[0]!);
    await user.click(screen.getByTestId('sheet-scrim'));
    expect(store.getState().sheet).toBeNull();
  });
});

describe('Frigo & suggestions', () => {
  it('ajoute, retire et propose des suggestions', async () => {
    const { user } = await renderApp({ route: '/fridge' });
    expect(screen.getByText(/6 aliments · 4 recettes réalisables/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ajouter au frigo' }));
    expect(await screen.findByText('Saisissez un aliment')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Poisson' }));
    await user.type(screen.getByLabelText('Nouvel aliment'), 'truite{Enter}');
    const group = await screen.findByRole('region', { name: 'Poisson' });
    expect(within(group).getByText('Truite')).toBeInTheDocument();
    expect(screen.getByLabelText('Nouvel aliment')).toHaveValue('');

    await user.click(screen.getByRole('button', { name: 'Retirer Truite' }));
    expect(screen.queryByRole('region', { name: 'Poisson' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voir mes suggestions' }));
    expect(screen.getByRole('heading', { name: 'Suggestions' })).toBeInTheDocument();
    const first = screen.getAllByRole('link')[0]!;
    expect(first).toHaveTextContent('Salade de tomate');
    expect(first).toHaveTextContent('3/3 ingrédients');
    await user.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByRole('heading', { name: 'Mon frigo' })).toBeInTheDocument();
  });

  it('affiche une image par aliment, masquée aux lecteurs d’écran', async () => {
    const { user } = await renderApp({ route: '/fridge' });
    const legumes = screen.getByRole('region', { name: 'Légume' });
    const tomate = within(legumes).getByText('Tomate').closest('li')!;
    expect(within(tomate).getByTestId('food-icon')).toHaveTextContent('🍅');
    expect(within(tomate).getByTestId('food-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(within(tomate).getByRole('button')).toHaveAccessibleName('Retirer Tomate');
    expect(screen.getAllByTestId('food-icon')).toHaveLength(6);

    // Aliment inconnu : image de la catégorie choisie.
    await user.click(screen.getByRole('button', { name: 'Poisson' }));
    await user.type(screen.getByLabelText('Nouvel aliment'), 'espadon{Enter}');
    await user.click(screen.getByRole('button', { name: 'Viande' }));
    await user.type(screen.getByLabelText('Nouvel aliment'), 'caille{Enter}');
    const poisson = await screen.findByRole('region', { name: 'Poisson' });
    expect(within(poisson).getByTestId('food-icon')).toHaveTextContent('🐟');
    const viande = await screen.findByRole('region', { name: 'Viande' });
    expect(within(viande).getByTestId('food-icon')).toHaveTextContent('🥩');
  });

  it('frigo vide', async () => {
    const { user } = await renderApp({ route: '/fridge' });
    for (const b of screen.getAllByRole('button', { name: /^Retirer / })) await user.click(b);
    expect(screen.getByText(/Votre frigo est vide/)).toBeInTheDocument();
  });
});

describe('Nouvelle recette & import', () => {
  it('exige un nom puis crée la recette avec étapes réordonnées', async () => {
    const { user, store } = await renderApp({ route: '/add' });
    await user.click(screen.getByRole('button', { name: 'Ajouter la recette' }));
    expect(await screen.findByText('Donnez un nom au plat')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nom du plat'), 'Pizza maison');
    await user.click(screen.getByRole('button', { name: 'Desserts' }));
    await user.type(screen.getByLabelText(/Ingrédients/), 'Pâte, Tomate');
    await user.type(screen.getByLabelText('Description'), 'Croustillante');
    await user.type(screen.getByLabelText('Étape 1'), 'Cuire');
    await user.click(screen.getByRole('button', { name: 'Ajouter une étape' }));
    await user.type(screen.getByLabelText('Étape 2'), 'Étaler');
    await user.click(screen.getByRole('button', { name: "Monter l'étape 2" }));
    await user.click(screen.getByRole('button', { name: 'Ajouter une étape' }));
    await user.click(screen.getByRole('button', { name: "Supprimer l'étape 3" }));
    await user.click(screen.getByRole('button', { name: "Descendre l'étape 1" }));
    await user.click(screen.getByRole('button', { name: "Monter l'étape 2" }));
    await user.click(screen.getByRole('button', { name: 'Ajouter la recette' }));

    expect(await screen.findByText('Recette ajoutée')).toBeInTheDocument();
    const r = store.getState().recipes[0]!;
    expect(r).toMatchObject({ name: 'Pizza maison', category: 'Desserts', steps: ['Étaler', 'Cuire'], ingredients: ['Pâte', 'Tomate'] });
  });

  it('nombre de personnes : la taille du foyer par défaut, réglable', async () => {
    const { user, store } = await renderApp({ route: '/add' });
    const stepper = screen.getByRole('group', { name: 'Nombre de personnes' });
    expect(within(stepper).getByText('2 personnes')).toBeInTheDocument();
    await user.click(within(stepper).getByRole('button', { name: 'Une personne de plus' }));
    await user.type(screen.getByLabelText('Nom du plat'), 'Gratin');
    await user.click(screen.getByRole('button', { name: 'Ajouter la recette' }));
    await screen.findByText('Recette ajoutée');
    expect(store.getState().recipes[0]).toMatchObject({ name: 'Gratin', servings: 3 });
  });

  it('importe un modèle dans le formulaire', async () => {
    stubImportApi();
    const { user } = await renderApp({ route: '/add' });
    await user.click(screen.getByRole('link', { name: /Importer une recette/ }));
    expect(screen.getByRole('heading', { name: 'Idées rapides' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'x');
    expect(screen.getByText(/Tapez au moins 2 lettres/)).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'yz');
    expect(await screen.findByText('Aucune recette trouvée sur Marmiton pour « xyz ».')).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'taco');
    expect(screen.getByRole('heading', { name: 'Modèles' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Tacos/ }));
    expect(await screen.findByLabelText('Nom du plat')).toHaveValue('Tacos');
    expect(screen.getByLabelText('Ingrédients')).toHaveValue('Tortilla\nPoulet\nOignon\nFromage');
    expect(screen.getByLabelText('Étape 3')).toHaveValue('Gratinez');
  });
});

/* ---------- Import en ligne (API simulée ; les vraies données sont couvertes par e2e/live.spec.ts) ---------- */

const RESULT = (n: number, name: string) => ({
  url: `https://www.marmiton.org/recettes/recette_${n}.aspx`,
  name,
  imageUrl: n === 1 ? 'https://assets.afcdn.com/recipe/1.webp' : null,
  rating: n === 1 ? 4.6 : null,
  reviews: n === 1 ? 104 : null,
  category: 'Plat principal',
  source: 'marmiton.org',
});

const IMPORTED = {
  name: 'Risotto au chorizo',
  category: 'Plats',
  timeMin: 25,
  level: 'Moyen',
  price: '€',
  description: 'Source : marmiton.org, par milou.g.',
  ingredients: ['4 verres de riz', '1,5 l de bouillon', 'chorizo'],
  steps: ['Faire bouillir le bouillon.', 'Ajouter le riz.'],
  servings: '6 personnes',
  servingsCount: 6,
  imageUrl: null,
  sourceUrl: 'https://www.marmiton.org/recettes/recette_1.aspx',
  sourceName: 'marmiton.org',
};

type Handler = (params: URLSearchParams) => { status?: number; body: unknown } | Promise<never>;

/** Remplace `fetch` : simule `/api/recipe-import` (middleware Vite / Edge Function). */
function stubImportApi(handler: Handler = () => ({ body: { results: [], page: 1, hasMore: false } })) {
  const fetchMock = vi.fn(async (input: string) => {
    const r = await handler(new URL(input).searchParams);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}


/**
 * Fin d'un import : le toast s'affiche tout de suite, mais le retour au formulaire (`navigate(-1)`)
 * passe par une transition React, de priorité plus basse. On attend donc aussi le formulaire,
 * sinon le test dépend de la vitesse de la machine (échec en CI sous instrumentation coverage).
 */
async function imported() {
  await screen.findByText('Recette importée');
  return screen.findByLabelText('Nom du plat');
}
describe('Import en ligne', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('cherche sur Marmiton pendant la saisie, pagine, importe puis enregistre', async () => {
    const fetchMock = stubImportApi((p) => {
      if (p.get('url')) return { body: { recipe: IMPORTED } };
      return p.get('page') === '2'
        ? { body: { results: [RESULT(2, 'Risotto aux cèpes'), RESULT(3, 'Risotto au potiron')], page: 2, hasMore: false } }
        : { body: { results: [RESULT(1, 'Risotto au chorizo'), RESULT(2, 'Risotto aux cèpes')], page: 1, hasMore: true } };
    });
    const { user, store } = await renderApp({ route: '/add' });
    await user.click(screen.getByRole('link', { name: /Importer une recette/ }));
    await user.type(screen.getByRole('searchbox'), 'risotto');

    const results = await screen.findByRole('list', { name: 'Résultats Marmiton' });
    expect(await within(results).findByRole('button', { name: /Risotto au chorizo/ })).toHaveTextContent('★ 4,6 · 104 avis · Plat principal');
    // Anti-rebond : une seule requête pour toute la saisie.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toContain('q=risotto');
    expect(screen.getByText('2 recette(s) trouvée(s) sur Marmiton')).toHaveAttribute('aria-live', 'polite');

    await user.click(screen.getByRole('button', { name: 'Plus de résultats' }));
    expect(await within(results).findByRole('button', { name: /Risotto au potiron/ })).toBeInTheDocument();
    expect(within(results).getAllByRole('button')).toHaveLength(3); // doublon fusionné
    expect(screen.queryByRole('button', { name: 'Plus de résultats' })).not.toBeInTheDocument();

    await user.click(within(results).getByRole('button', { name: /Risotto au chorizo/ }));
    expect(await imported()).toHaveValue('Risotto au chorizo');
    expect(screen.getByLabelText('Ingrédients')).toHaveValue('4 verres de riz\n1,5 l de bouillon\nchorizo');
    expect(screen.getByLabelText('Étape 2')).toHaveValue('Ajouter le riz.');
    expect(screen.getByRole('link', { name: 'marmiton.org' })).toHaveAttribute('href', IMPORTED.sourceUrl);
    expect(screen.getByText(/25 min · Moyen/)).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Nombre de personnes' })).getByText('6 personnes')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ajouter la recette' }));
    expect(await screen.findByText('Recette ajoutée')).toBeInTheDocument();
    expect(store.getState().recipes[0]).toMatchObject({
      name: 'Risotto au chorizo',
      timeMin: 25,
      level: 'Moyen',
      price: '€',
      ingredients: ['4 verres de riz', '1,5 l de bouillon', 'chorizo'],
      description: IMPORTED.description,
      servings: 6,
    });
  });

  it('importe depuis un lien collé (touche Entrée) et permet d’oublier la source', async () => {
    const fetchMock = stubImportApi((p) => ({
      // Edge Function déployée avant `servingsCount` : seul le texte « 4 personnes » est renvoyé.
      body: {
        recipe: { ...IMPORTED, servings: '4 personnes', servingsCount: undefined, name: 'Pâte pour crêpes', category: 'Desserts', sourceName: '750g.com', sourceUrl: p.get('url') },
      },
    }));
    const { user, store } = await renderApp({ route: '/add/import' });
    await user.type(screen.getByRole('searchbox'), 'www.750g.com/pate-a-crepes-r17175.htm');
    expect(screen.getByRole('button', { name: /Importer depuis 750g\.com/ })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Idées rapides' })).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(await screen.findByLabelText('Nom du plat')).toHaveValue('Pâte pour crêpes');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(new URL(fetchMock.mock.calls[0]![0]).searchParams.get('url')).toBe('https://www.750g.com/pate-a-crepes-r17175.htm');
    expect(screen.getByRole('button', { name: 'Desserts' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Oublier la source importée' }));
    expect(screen.queryByText(/Importée depuis/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajouter la recette' }));
    await screen.findByText('Recette ajoutée');
    expect(store.getState().recipes[0]).toMatchObject({ name: 'Pâte pour crêpes', price: '—', level: 'Facile', servings: 4 });
  });

  it('affiche les erreurs de recherche, réessaie, et signale un import impossible', async () => {
    let fail = true;
    stubImportApi((p) => {
      if (p.get('url')) return { status: 422, body: { error: 'Aucune recette trouvée sur cette page' } };
      if (fail) return { status: 502, body: { error: 'Le site source est injoignable' } };
      return { body: { results: [RESULT(1, 'Tarte au citron')], page: 1, hasMore: false } };
    });
    const { user } = await renderApp({ route: '/add/import' });
    await user.type(screen.getByRole('searchbox'), 'tarte');
    expect(await screen.findByRole('alert')).toHaveTextContent('Le site source est injoignable');
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    const item = await screen.findByRole('button', { name: /Tarte au citron/ });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(item);
    expect(await screen.findByText('Aucune recette trouvée sur cette page')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Importer une recette' })).toBeInTheDocument();
    expect(item).toBeEnabled();
  });

  it('service injoignable : message clair, les modèles restent utilisables', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    const { user } = await renderApp({ route: '/add/import' });
    await user.type(screen.getByRole('searchbox'), 'lasagnes');
    expect(await screen.findByRole('alert')).toHaveTextContent(/injoignable/);
    expect(screen.getByRole('button', { name: /Lasagnes/ })).toBeEnabled();
  });

  it('garde la photo de la page importée et l’enregistre avec la recette', async () => {
    stubImportApi((p) =>
      p.get('url')
        ? { body: { recipe: { ...IMPORTED, imageUrl: 'https://img.test/risotto.jpg' } } }
        : { body: { results: [RESULT(2, 'Risotto aux cèpes')], page: 1, hasMore: false } },
    );
    const { user, store } = await renderApp({ route: '/add/import' });
    await user.type(screen.getByRole('searchbox'), 'risotto');
    await user.click(await screen.findByRole('button', { name: /Risotto aux cèpes/ }));
    await imported();
    expect(document.querySelector('[data-photo] img')).toHaveAttribute('src', 'https://img.test/risotto.jpg');
    await user.click(screen.getByRole('button', { name: 'Ajouter la recette' }));
    await screen.findByText('Recette ajoutée');
    expect(store.getState().recipes[0]).toMatchObject({ name: 'Risotto au chorizo', imageUrl: 'https://img.test/risotto.jpg' });
  });

  it('page sans photo : reprend la vignette du résultat ; oublier la source retire la photo', async () => {
    stubImportApi((p) =>
      p.get('url') ? { body: { recipe: IMPORTED } } : { body: { results: [RESULT(1, 'Risotto au chorizo')], page: 1, hasMore: false } },
    );
    const { user, store } = await renderApp({ route: '/add/import' });
    await user.type(screen.getByRole('searchbox'), 'risotto');
    await user.click(await screen.findByRole('button', { name: /Risotto au chorizo/ }));
    await imported();
    expect(document.querySelector('[data-photo] img')).toHaveAttribute('src', 'https://assets.afcdn.com/recipe/1.webp');
    await user.click(screen.getByRole('button', { name: 'Oublier la source importée' }));
    expect(document.querySelector('[data-photo]')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Ajouter la recette' }));
    await screen.findByText('Recette ajoutée');
    expect(store.getState().recipes[0]!.imageUrl).toBeNull();
  });

  it('aperçu cassé : la photo importée est abandonnée', async () => {
    stubImportApi(() => ({ body: { recipe: { ...IMPORTED, imageUrl: 'https://img.test/casse.jpg' } } }));
    const { user, store } = await renderApp({ route: '/add/import' });
    await user.type(screen.getByRole('searchbox'), 'https://www.marmiton.org/recettes/recette_1.aspx');
    await user.keyboard('{Enter}');
    await imported();
    fireEvent.error(document.querySelector('[data-photo] img')!);
    await user.click(screen.getByRole('button', { name: 'Ajouter la recette' }));
    await screen.findByText('Recette ajoutée');
    expect(store.getState().recipes[0]!.imageUrl).toBeNull();
  });
});

describe('Photos automatiques', () => {
  /** Photo déterministe par nom ; une photo exclue (cassée) est remplacée par une variante « -2 ». */
  const finder = () => ({
    find: vi.fn(async (r: { name: string }, exclude?: ReadonlySet<string>) => {
      const url = `https://img.test/${encodeURIComponent(r.name)}.webp`;
      return exclude?.has(url) ? url.replace('.webp', '-2.webp') : url;
    }),
  });
  const photos = () => [...document.querySelectorAll('[data-photo] img')].map((i) => i.getAttribute('src'));

  it('chaque recette reçoit une photo, cherchée une seule fois, visible sur l’accueil et le détail', async () => {
    const images = finder();
    const { user, store } = await renderApp({ images });
    const count = store.getState().recipes.length;
    // Une photo par carte + celle du héros.
    await waitFor(() => expect(photos()).toHaveLength(count + 1));
    expect(photos()).toContain('https://img.test/Mousse%20au%20chocolat.webp');
    expect(images.find).toHaveBeenCalledTimes(count);
    expect(store.getState().recipes.every((r) => r.imageUrl?.startsWith('https://img.test/'))).toBe(true);

    await user.click(screen.getByRole('link', { name: 'Mousse au chocolat' }));
    await screen.findByRole('heading', { name: 'Mousse au chocolat' });
    expect(photos()).toEqual(['https://img.test/Mousse%20au%20chocolat.webp']);
    expect(images.find).toHaveBeenCalledTimes(count);

    // La photo ne se charge plus : une autre est cherchée et affichée.
    fireEvent.error(document.querySelector('[data-photo] img')!);
    await waitFor(() => expect(photos()).toEqual(['https://img.test/Mousse%20au%20chocolat-2.webp']));
  });

  it('une recette saisie à la main reçoit une photo après l’ajout', async () => {
    const images = finder();
    const { user, store } = await renderApp({ route: '/add', images });
    await user.type(screen.getByLabelText('Nom du plat'), 'Pizza maison');
    await user.click(screen.getByRole('button', { name: 'Ajouter la recette' }));
    await screen.findByText('Recette ajoutée');
    await waitFor(() => expect(photos()).toContain('https://img.test/Pizza%20maison.webp'));
    expect(store.getState().recipes[0]).toMatchObject({ name: 'Pizza maison', imageUrl: 'https://img.test/Pizza%20maison.webp' });
  });

  it('suggestions et planning affichent aussi la photo', async () => {
    const images = finder();
    const { store } = await renderApp({ route: '/suggestions', images });
    const count = store.getState().recipes.length;
    await waitFor(() => expect(photos()).toHaveLength(count));
    cleanup();

    const again = await renderApp({ route: '/planning', images });
    const id = again.store.getState().recipes[0]!.id;
    // Le planning s'ouvre sur le jour courant.
    await act(() => again.store.getState().setPlanEntry(toIsoDate(), 1, id));
    await waitFor(() =>
      expect(screen.getByTestId('slot-1').querySelector('[data-photo] img')?.getAttribute('src')).toMatch(/^https:\/\/img\.test\//),
    );
  });
});

describe('Profil', () => {
  it('met à jour le profil et se déconnecte', async () => {
    const { user, store } = await renderApp({ route: '/profile' });
    const name = screen.getByLabelText('Nom');
    await user.clear(name);
    await user.type(name, 'Toto Lacuisine');
    const foyer = screen.getByRole('group', { name: 'Taille du foyer' });
    expect(within(foyer).getByText('2 personnes')).toBeInTheDocument();
    await user.click(within(foyer).getByRole('button', { name: 'Une personne de plus dans le foyer' }));
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));
    await waitFor(() => expect(store.getState().profile).toMatchObject({ name: 'Toto Lacuisine', household: 3 }));
    expect(screen.getByText('Profil mis à jour')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByRole('button', { name: 'Commencer' })).toBeInTheDocument();
  });
});

describe('États globaux', () => {
  it('erreur de chargement : réessayer', async () => {
    const { user, store, repo } = await renderApp({ signedIn: false });
    vi.spyOn(repo, 'loadAll').mockRejectedValueOnce(new Error('Connexion réseau impossible'));
    await act(() => store.getState().signIn('a@b.fr', 'x'));
    expect(screen.getByRole('alert')).toHaveTextContent('Connexion réseau impossible');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(/Que cuisine-t-on/)).toBeInTheDocument();
  });

  it('le toast disparaît après un délai', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { store } = await renderApp({ route: '/home' });
    act(() => store.getState().flash('Coucou'));
    expect(screen.getByText('Coucou')).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.queryByText('Coucou')).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
