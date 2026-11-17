import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DishImage } from '../components/DishImage';
import { Download } from '../components/icons';
import { buildRecipeDraft, formatTime } from '../domain/logic';
import { RECIPE_CATEGORIES } from '../domain/types';
import { useApp } from '../store/storeContext';
import { Button, Chip, Input, TextArea } from '../ui';
import { useRecipeForm } from './formStore';
import s from './screens.module.css';

export default function AddRecipe() {
  const navigate = useNavigate();
  const addRecipe = useApp((st) => st.addRecipe);
  const flash = useApp((st) => st.flash);
  const f = useRecipeForm();
  const { form } = f;
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const res = buildRecipeDraft(form);
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
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="Nom du plat" placeholder="Pizza maison" value={form.name} onChange={(e) => f.set('name', e.target.value)} />
        <div className={s.wrap} role="group" aria-label="Catégorie">
          {RECIPE_CATEGORIES.map((c) => (
            <Chip key={c} on={form.category === c} onClick={() => f.set('category', c)}>
              {c}
            </Chip>
          ))}
        </div>
        <TextArea
          label="Ingrédients"
          hint="Un par ligne, ou séparés par des virgules"
          placeholder="Tomate, mozzarella, basilic"
          rows={Math.min(8, Math.max(2, form.ingredients.split('\n').length))}
          value={form.ingredients}
          onChange={(e) => f.set('ingredients', e.target.value)}
        />
        <Input
          label="Description"
          placeholder="En une phrase"
          value={form.description}
          onChange={(e) => f.set('description', e.target.value)}
        />
        <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className={s.stepsHead}>
            <legend className={s.stepsLabel}>Étapes</legend>
            <span className={s.mono} style={{ fontSize: 12, color: 'var(--gray-600)' }}>
              {form.steps.length} étape(s)
            </span>
          </div>
          {form.steps.map((text, i) => (
            <div key={i} className={`${s.card} ${s.stepRow}`}>
              <span className={s.stepN} aria-hidden="true">
                {i + 1}
              </span>
              <textarea
                aria-label={`Étape ${i + 1}`}
                rows={2}
                value={text}
                placeholder={i === 0 ? 'Ex. Couper les légumes en dés' : 'Étape suivante…'}
                onChange={(e) => f.setStep(i, e.target.value)}
              />
              <div className={s.stepMoves}>
                <button type="button" className={s.stepMove} aria-label={`Monter l'étape ${i + 1}`} disabled={i === 0} onClick={() => f.moveStep(i, -1)}>
                  ↑
                </button>
                <button
                  type="button"
                  className={s.stepMove}
                  aria-label={`Descendre l'étape ${i + 1}`}
                  disabled={i === form.steps.length - 1}
                  onClick={() => f.moveStep(i, 1)}
                >
                  ↓
                </button>
              </div>
              <button type="button" className={s.stepRemove} aria-label={`Supprimer l'étape ${i + 1}`} onClick={() => f.removeStep(i)}>
                ×
              </button>
            </div>
          ))}
          <Button variant="outline" block onClick={f.addStep}>
            Ajouter une étape
          </Button>
        </fieldset>
        <Button type="submit" size="lg" block disabled={busy}>
          Ajouter la recette
        </Button>
      </form>
    </main>
  );
}
