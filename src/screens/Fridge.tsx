import { memo, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { FoodIcon } from '../components/FoodIcon';
import { cookableCount, groupFridge } from '../domain/logic';
import { FOOD_CATEGORIES, type FoodCategory, type FridgeItem } from '../domain/types';
import { useApp } from '../store/storeContext';
import { Button, Chip, Input, Tag } from '../ui';
import { FridgeScan } from './FridgeScan';
import s from './screens.module.css';

export default function Fridge() {
  const navigate = useNavigate();
  const { fridge, recipes, removeFridgeItem } = useApp(
    useShallow((st) => ({ fridge: st.fridge, recipes: st.recipes, removeFridgeItem: st.removeFridgeItem })),
  );
  const cookable = useMemo(() => cookableCount(recipes, fridge), [recipes, fridge]);
  const groups = useMemo(() => groupFridge(fridge), [fridge]);

  return (
    <main className={s.page}>
      <div>
        <h1 className={s.title}>Mon frigo</h1>
        <p className={s.subtitle}>
          {fridge.length} aliments · {cookable} recettes réalisables
        </p>
      </div>
      <FridgeScan />
      <AddFoodForm />
      {groups.map((g) => (
        <section key={g.category} className={s.group} aria-label={g.category}>
          <h2 className={s.overline}>{g.category}</h2>
          <ul className={s.tags}>
            {g.items.map((f) => (
              <FridgeTag key={f.id} item={f} onRemove={removeFridgeItem} />
            ))}
          </ul>
        </section>
      ))}
      {fridge.length === 0 && <p className={s.empty}>Votre frigo est vide. Ajoutez vos premiers aliments.</p>}
      <Button variant="accent" size="lg" block onClick={() => navigate('/suggestions')}>
        Voir mes suggestions
      </Button>
    </main>
  );
}

/** Saisie d'un aliment. État local au formulaire : taper ne redessine ni la liste ni le scan photo. */
function AddFoodForm() {
  const addFridgeItem = useApp((st) => st.addFridgeItem);
  const [name, setName] = useState('');
  const [cat, setCat] = useState<FoodCategory>('Légume');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await addFridgeItem(name, cat)) setName('');
  }

  return (
    <form className={`${s.card} ${s.fridgeForm}`} onSubmit={add}>
      <Input
        aria-label="Nouvel aliment"
        placeholder="Ajouter un aliment (ex. Poivron)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoCapitalize="sentences"
        enterKeyHint="done"
      />
      <div className={s.wrap} role="group" aria-label="Catégorie">
        {FOOD_CATEGORIES.map((c) => (
          <Chip key={c} on={cat === c} onClick={() => setCat(c)}>
            {c}
          </Chip>
        ))}
      </div>
      <Button type="submit" block>
        Ajouter au frigo
      </Button>
    </form>
  );
}

/** Étiquette d'un aliment. Mémoïsée : ajouter / retirer un aliment ne redessine pas les autres (`onRemove` stable). */
const FridgeTag = memo(function FridgeTag({ item, onRemove }: { item: FridgeItem; onRemove: (id: string) => void }) {
  return (
    <li>
      <Tag onRemove={() => onRemove(item.id)} removeLabel={`Retirer ${item.name}`}>
        <FoodIcon name={item.name} category={item.category} />
        {item.name}
      </Tag>
    </li>
  );
});
