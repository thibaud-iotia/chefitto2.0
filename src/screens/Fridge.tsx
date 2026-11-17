import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { FoodIcon } from '../components/FoodIcon';
import { cookableCount, groupFridge } from '../domain/logic';
import { FOOD_CATEGORIES, type FoodCategory } from '../domain/types';
import { useApp } from '../store/storeContext';
import { Button, Chip, Input, Tag } from '../ui';
import { FridgeScan } from './FridgeScan';
import s from './screens.module.css';

export default function Fridge() {
  const navigate = useNavigate();
  const { fridge, recipes, addFridgeItem, removeFridgeItem } = useApp(
    useShallow((st) => ({
      fridge: st.fridge,
      recipes: st.recipes,
      addFridgeItem: st.addFridgeItem,
      removeFridgeItem: st.removeFridgeItem,
    })),
  );
  const [name, setName] = useState('');
  const [cat, setCat] = useState<FoodCategory>('Légume');

  async function add(e: FormEvent) {
    e.preventDefault();
    if (await addFridgeItem(name, cat)) setName('');
  }

  return (
    <main className={s.page}>
      <div>
        <h1 className={s.title}>Mon frigo</h1>
        <p className={s.subtitle}>
          {fridge.length} aliments · {cookableCount(recipes, fridge)} recettes réalisables
        </p>
      </div>
      <FridgeScan />
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
      {groupFridge(fridge).map((g) => (
        <section key={g.category} className={s.group} aria-label={g.category}>
          <h2 className={s.overline}>{g.category}</h2>
          <ul className={s.tags}>
            {g.items.map((f) => (
              <li key={f.id}>
                <Tag onRemove={() => removeFridgeItem(f.id)} removeLabel={`Retirer ${f.name}`}>
                  <FoodIcon name={f.name} category={f.category} />
                  {f.name}
                </Tag>
              </li>
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
