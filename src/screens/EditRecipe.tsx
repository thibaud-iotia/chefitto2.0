import { useState, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useStore } from 'zustand';
import { useBack } from '../components/hooks';
import { ChevronLeft } from '../components/icons';
import { buildRecipeDraft, recipeToForm } from '../domain/logic';
import type { Recipe } from '../domain/types';
import { useApp } from '../store/storeContext';
import { IconButton } from '../ui';
import { createRecipeFormStore } from './formStore';
import { RecipeFields } from './RecipeFields';
import s from './screens.module.css';

/** Modifier une recette (ouvert depuis l'appui long sur une carte de l'accueil). */
export default function EditRecipe() {
  const { id } = useParams();
  const recipe = useApp((st) => st.recipes.find((r) => r.id === id));
  if (!recipe) return <Navigate to="/home" replace />;
  // `key` : un formulaire neuf, pré-rempli, par recette.
  return <EditForm key={recipe.id} recipe={recipe} />;
}

function EditForm({ recipe }: { recipe: Recipe }) {
  const back = useBack();
  const updateRecipe = useApp((st) => st.updateRecipe);
  const flash = useApp((st) => st.flash);
  const household = useApp((st) => st.profile.household);
  // Formulaire propre à cet écran : le brouillon de « Nouvelle recette » reste intact.
  const [store] = useState(() => createRecipeFormStore(recipeToForm(recipe)));
  const f = useStore(store);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = buildRecipeDraft(f.form, household);
    if (!res.ok) return flash(res.error);
    setBusy(true);
    const ok = await updateRecipe(recipe.id, res.draft);
    setBusy(false);
    if (!ok) return;
    back();
    flash('Recette modifiée');
  }

  return (
    <main className={s.page}>
      <IconButton label="Retour" onClick={back}>
        <ChevronLeft />
      </IconButton>
      <h1 className={s.title}>Modifier la recette</h1>
      <RecipeFields f={f} household={household} submitLabel="Enregistrer" busy={busy} onSubmit={save} />
    </main>
  );
}
