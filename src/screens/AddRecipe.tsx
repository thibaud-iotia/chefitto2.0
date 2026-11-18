import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DishImage } from '../components/DishImage';
import { Download } from '../components/icons';
import { buildRecipeDraft, formatTime } from '../domain/logic';
import { useApp } from '../store/storeContext';
import { useRecipeForm } from './formStore';
import { RecipeFields } from './RecipeFields';
import s from './screens.module.css';

export default function AddRecipe() {
  const navigate = useNavigate();
  const addRecipe = useApp((st) => st.addRecipe);
  const flash = useApp((st) => st.flash);
  const household = useApp((st) => st.profile.household);
  const f = useRecipeForm();
  const { form } = f;
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = buildRecipeDraft(form, household);
    if (!res.ok) return flash(res.error);
    setBusy(true);
    const recipe = await addRecipe(res.draft);
    setBusy(false);
    if (!recipe) return;
    f.reset(form.category);
    navigate('/home', { replace: true });
    flash('Recette ajoutée');
  }

  return (
    <main className={s.page}>
      <h1 className={s.title}>Nouvelle recette</h1>
      <Link to="/add/import" className={s.importBanner}>
        <span className={s.importIcon} aria-hidden="true">
          <Download />
        </span>
        <span style={{ flex: 1 }}>
          <span className={s.importTitle} style={{ display: 'block' }}>
            Importer une recette
          </span>
          <span className={s.importSub}>Cherchez sur Marmiton ou collez un lien</span>
        </span>
        <span aria-hidden="true" style={{ color: 'var(--red-500)', fontWeight: 700 }}>
          ›
        </span>
      </Link>
      {form.meta?.source && (
        <div className={s.importedFrom}>
          {form.imageUrl && <DishImage size={40} src={form.imageUrl} onBroken={() => f.set('imageUrl', null)} />}
          <span style={{ flex: 1 }}>
            Importée depuis{' '}
            <a href={form.meta.source.url} target="_blank" rel="noopener noreferrer">
              {form.meta.source.name}
            </a>{' '}
            · {formatTime(form.meta.timeMin)} · {form.meta.level}
          </span>
          <button type="button" aria-label="Oublier la source importée" onClick={f.clearMeta}>
            ×
          </button>
        </div>
      )}
      <RecipeFields f={f} household={household} submitLabel="Ajouter la recette" busy={busy} onSubmit={save} />
    </main>
  );
}
