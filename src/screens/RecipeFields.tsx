import { memo, type FormEvent } from 'react';
import { MAX_SERVINGS, MIN_SERVINGS, servingsLabel } from '../domain/servings';
import { RECIPE_CATEGORIES } from '../domain/types';
import { Button, Chip, Input, Stepper, TextArea } from '../ui';
import type { FormState } from './formStore';
import s from './screens.module.css';

/** Champs d'une recette, communs à « Nouvelle recette » et « Modifier la recette ». */
export function RecipeFields({
  f,
  household,
  submitLabel,
  busy,
  onSubmit,
}: {
  f: FormState;
  household: number;
  submitLabel: string;
  busy: boolean;
  onSubmit: (e: FormEvent) => void;
}) {
  const { form } = f;
  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Input label="Nom du plat" placeholder="Pizza maison" value={form.name} onChange={(e) => f.set('name', e.target.value)} />
      <div className={s.wrap} role="group" aria-label="Catégorie">
        {RECIPE_CATEGORIES.map((c) => (
          <Chip key={c} on={form.category === c} onClick={() => f.set('category', c)}>
            {c}
          </Chip>
        ))}
      </div>
      <div className={s.servingsRow}>
        <span className={s.stepsLabel} aria-hidden="true">
          Personnes
        </span>
        <Stepper
          label="Nombre de personnes"
          value={form.servings ?? household}
          min={MIN_SERVINGS}
          max={MAX_SERVINGS}
          onChange={(n) => f.set('servings', n)}
          format={servingsLabel}
          decLabel="Une personne de moins"
          incLabel="Une personne de plus"
        />
      </div>
      <TextArea
        label="Ingrédients"
        hint="Un par ligne, ou séparés par des virgules. Quantités pour le nombre de personnes ci-dessus."
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
          <StepRow
            key={i}
            index={i}
            text={text}
            last={i === form.steps.length - 1}
            setStep={f.setStep}
            moveStep={f.moveStep}
            removeStep={f.removeStep}
          />
        ))}
        <Button variant="outline" block onClick={f.addStep}>
          Ajouter une étape
        </Button>
      </fieldset>
      <Button type="submit" size="lg" block disabled={busy}>
        {submitLabel}
      </Button>
    </form>
  );
}

/**
 * Une étape du formulaire. Mémoïsée : taper dans un champ ne redessine que sa ligne
 * (les actions viennent du store du formulaire, donc stables).
 */
const StepRow = memo(function StepRow({
  index: i,
  text,
  last,
  setStep,
  moveStep,
  removeStep,
}: {
  index: number;
  text: string;
  last: boolean;
} & Pick<FormState, 'setStep' | 'moveStep' | 'removeStep'>) {
  return (
    <div className={`${s.card} ${s.stepRow}`}>
      <span className={s.stepN} aria-hidden="true">
        {i + 1}
      </span>
      <textarea
        aria-label={`Étape ${i + 1}`}
        rows={2}
        value={text}
        placeholder={i === 0 ? 'Ex. Couper les légumes en dés' : 'Étape suivante…'}
        onChange={(e) => setStep(i, e.target.value)}
      />
      <div className={s.stepMoves}>
        <button type="button" className={s.stepMove} aria-label={`Monter l'étape ${i + 1}`} disabled={i === 0} onClick={() => moveStep(i, -1)}>
          ↑
        </button>
        <button type="button" className={s.stepMove} aria-label={`Descendre l'étape ${i + 1}`} disabled={last} onClick={() => moveStep(i, 1)}>
          ↓
        </button>
      </div>
      <button type="button" className={s.stepRemove} aria-label={`Supprimer l'étape ${i + 1}`} onClick={() => removeStep(i)}>
        ×
      </button>
    </div>
  );
});
