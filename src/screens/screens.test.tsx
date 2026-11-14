import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';

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
  it('ingrédients au frigo, favori, planifier, cuisiner jusqu’au bout', async () => {
    const { user, store } = await renderApp({ route: '/home' });
    await user.click(screen.getByRole('link', { name: 'Veggie tomato mix' }));
    expect(screen.getByText('4/5 au frigo')).toBeInTheDocument();
    expect(screen.getAllByText('À acheter')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Ajouter aux favoris' }));
    expect(screen.getByRole('button', { name: 'Retirer des favoris' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Planifier' }));
    const sheet = screen.getByRole('dialog', { name: /Planifier Veggie/ });
    await user.click(within(sheet).getByRole('button', { name: /Mardi · Soir/ }));
    expect(Object.keys(store.getState().plan)).toEqual(['1-1']);
    expect(await screen.findByText('Ajouté au planning')).toBeInTheDocument();

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

  it('recette inconnue → accueil', async () => {
    await renderApp({ route: '/recipe/nope' });
    expect(screen.getByText(/Que cuisine-t-on/)).toBeInTheDocument();
    await renderApp({ route: '/recipe/nope/cook' });
    expect(screen.getAllByText(/Que cuisine-t-on/).length).toBeGreaterThan(0);
  });
});

describe('Planning', () => {
  it('choisir, changer puis retirer un repas', async () => {
    const { user, store } = await renderApp({ route: '/planning' });
    await user.click(screen.getByRole('tab', { name: 'Lundi' }));
    await user.click(screen.getByRole('button', { name: /Choisir le repas du Lundi midi/ }));
    const sheet = screen.getByRole('dialog', { name: 'Lundi · Midi' });
    await user.click(within(sheet).getByRole('button', { name: /Mousse au chocolat/ }));
    expect(within(screen.getByTestId('slot-0')).getByText('Mousse au chocolat')).toBeInTheDocument();
    expect(screen.getByText(/1 repas sur 14/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Changer le repas du Lundi midi/ }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retirer ce repas' }));
    expect(store.getState().plan).toEqual({});
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

  it('importe un modèle dans le formulaire', async () => {
    const { user } = await renderApp({ route: '/add' });
    await user.click(screen.getByRole('link', { name: /Importer une recette/ }));
    await user.type(screen.getByRole('searchbox'), 'xyz');
    expect(screen.getByText(/Aucun modèle/)).toBeInTheDocument();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'taco');
    await user.click(screen.getByRole('button', { name: /Tacos/ }));
    expect(await screen.findByLabelText('Nom du plat')).toHaveValue('Tacos');
    expect(screen.getByLabelText('Étape 3')).toHaveValue('Gratinez');
  });
});

describe('Profil', () => {
  it('met à jour le profil et se déconnecte', async () => {
    const { user, store } = await renderApp({ route: '/profile' });
    const name = screen.getByLabelText('Nom');
    await user.clear(name);
    await user.type(name, 'Toto Lacuisine');
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }));
    await waitFor(() => expect(store.getState().profile.name).toBe('Toto Lacuisine'));
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
