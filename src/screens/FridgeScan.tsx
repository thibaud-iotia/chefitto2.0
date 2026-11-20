import { memo, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { FoodIcon } from '../components/FoodIcon';
import { Camera, Images } from '../components/icons';
import { MAX_IMAGES, type DetectedFood } from '../data/fridgeScan';
import { prepareImage } from '../data/imagePrep';
import { sameFood } from '../domain/logic';
import { FOOD_CATEGORIES, type FoodCategory } from '../domain/types';
import { useApp } from '../store/storeContext';
import { Badge, Button } from '../ui';
import s from './screens.module.css';

interface Row {
  key: number;
  name: string;
  category: FoodCategory;
  confidence: DetectedFood['confidence'];
  selected: boolean;
  known: boolean;
}

type Phase = { t: 'idle' } | { t: 'busy'; count: number } | { t: 'review'; rows: Row[] };

const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/**
 * Remplit le frigo depuis des photos (frigo, placard, courses, ticket de caisse) :
 * photo → redimensionnement local → détection (Claude) → revue par l'utilisateur → ajout groupé.
 * Mémoïsé (pas de props) : la page Frigo peut se redessiner sans lui.
 */
export const FridgeScan = memo(function FridgeScan() {
  const { fridge, scanner, addFridgeItems, flash } = useApp(
    useShallow((st) => ({ fridge: st.fridge, scanner: st.scanner, addFridgeItems: st.addFridgeItems, flash: st.flash })),
  );
  const [phase, setPhase] = useState<Phase>({ t: 'idle' });
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function analyse(e: ChangeEvent<HTMLInputElement>) {
    const all = Array.from(e.target.files ?? []);
    e.target.value = ''; // permet de re-choisir la même photo
    if (all.length === 0) return;
    if (all.length > MAX_IMAGES) flash(`${MAX_IMAGES} photos maximum : seules les premières sont analysées`);
    const files = all.slice(0, MAX_IMAGES);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase({ t: 'busy', count: files.length });
    try {
      const images = await Promise.all(files.map(prepareImage));
      const found = await scanner.scan(images, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (found.length === 0) {
        flash('Aucun aliment reconnu. Essayez une photo plus nette et mieux éclairée.');
        setPhase({ t: 'idle' });
        return;
      }
      setPhase({
        t: 'review',
        rows: found.map((f, i) => {
          const known = fridge.some((x) => sameFood(x.name, f.name));
          return { key: i, ...f, known, selected: !known };
        }),
      });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      flash(err instanceof Error ? err.message : 'Analyse impossible');
      setPhase({ t: 'idle' });
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    setPhase({ t: 'idle' });
  }

  function update(key: number, patch: Partial<Row>) {
    setPhase((p) => (p.t === 'review' ? { t: 'review', rows: p.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)) } : p));
  }

  async function confirm(rows: Row[]) {
    const picked = rows.filter((r) => r.selected && r.name.trim());
    if (picked.every((r) => fridge.some((f) => sameFood(f.name, r.name)))) {
      flash('Ces aliments sont déjà dans votre frigo');
      return;
    }
    const added = await addFridgeItems(picked); // en cas d'échec, le store affiche l'erreur
    if (added > 0) {
      flash(`${plural(added, 'aliment ajouté', 'aliments ajoutés')} au frigo`);
      setPhase({ t: 'idle' });
    }
  }

  if (phase.t === 'review') {
    const count = phase.rows.filter((r) => r.selected && r.name.trim()).length;
    return (
      <section className={`${s.card} ${s.scanCard}`} aria-labelledby="scan-title">
        <div>
          <h2 id="scan-title" className={s.h3}>
            {plural(phase.rows.length, 'aliment détecté', 'aliments détectés')}
          </h2>
          <p className={s.scanHint}>Vérifiez la liste : décochez les erreurs, corrigez un nom ou une catégorie.</p>
        </div>
        <ul className={s.scanList}>
          {phase.rows.map((r) => (
            <li key={r.key} className={`${s.scanRow} ${r.selected ? '' : s.scanRowOff}`}>
              <input
                type="checkbox"
                className={s.scanCheck}
                checked={r.selected}
                onChange={(e) => update(r.key, { selected: e.target.checked })}
                aria-label={`Ajouter ${r.name || 'cet aliment'}`}
              />
              <FoodIcon name={r.name} category={r.category} size="md" />
              <div className={s.scanFields}>
                <input
                  className={s.scanName}
                  value={r.name}
                  onChange={(e) => update(r.key, { name: e.target.value })}
                  aria-label="Nom de l'aliment"
                  autoCapitalize="sentences"
                />
                <div className={s.scanMeta}>
                  <select
                    className={s.scanSelect}
                    value={r.category}
                    onChange={(e) => update(r.key, { category: e.target.value as FoodCategory })}
                    aria-label={`Catégorie de ${r.name || 'cet aliment'}`}
                  >
                    {FOOD_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  {r.known && <Badge>Déjà au frigo</Badge>}
                  {!r.known && r.confidence === 'low' && <Badge tone="warning">À vérifier</Badge>}
                </div>
              </div>
            </li>
          ))}
        </ul>
        <Button block disabled={count === 0} onClick={() => void confirm(phase.rows)}>
          {count === 0 ? 'Aucun aliment sélectionné' : `Ajouter ${plural(count, 'aliment', 'aliments')}`}
        </Button>
        <Button variant="ghost" block onClick={cancel}>
          Annuler
        </Button>
      </section>
    );
  }

  const busy = phase.t === 'busy';
  return (
    <section className={`${s.card} ${s.scanCard}`} aria-labelledby="scan-title" aria-busy={busy}>
      <div>
        <h2 id="scan-title" className={s.h3}>
          Remplir avec une photo
        </h2>
        <p className={s.scanHint}>Frigo, placard, sac de courses ou ticket de caisse : les aliments sont reconnus automatiquement.</p>
      </div>
      {busy ? (
        <>
          <p className={s.scanBusy} role="status">
            <span className={s.spinner} aria-hidden="true" />
            Analyse {phase.count > 1 ? `des ${phase.count} photos` : 'de la photo'}…
          </p>
          <Button variant="ghost" block onClick={cancel}>
            Annuler
          </Button>
        </>
      ) : (
        <div className={s.row}>
          <Button variant="secondary" className={s.grow} onClick={() => cameraRef.current?.click()}>
            <Camera /> Photo
          </Button>
          <Button variant="secondary" className={s.grow} onClick={() => libraryRef.current?.click()}>
            <Images /> Galerie
          </Button>
        </div>
      )}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={analyse} aria-label="Prendre une photo" />
      <input ref={libraryRef} type="file" accept="image/*" multiple hidden onChange={analyse} aria-label="Choisir des photos" />
    </section>
  );
});
