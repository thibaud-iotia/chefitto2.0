import { useState, type FormEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { plannedCount } from '../domain/logic';
import { MAX_SERVINGS, MIN_SERVINGS, servingsLabel } from '../domain/servings';
import { useApp } from '../store/storeContext';
import { Avatar, Button, Input, Stepper } from '../ui';
import s from './screens.module.css';

export default function Profile() {
  const { profile, recipes, favorites, plan, updateProfile, signOut } = useApp(
    useShallow((st) => ({
      profile: st.profile,
      recipes: st.recipes,
      favorites: st.favorites,
      plan: st.plan,
      updateProfile: st.updateProfile,
      signOut: st.signOut,
    })),
  );
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email);
  const [household, setHousehold] = useState(profile.household);
  const ids = new Set(recipes.map((r) => r.id));

  function save(e: FormEvent) {
    e.preventDefault();
    void updateProfile({ name, email, household });
  }

  const stat = (value: number, label: string) => (
    <div className={s.profileStat}>
      <div className={s.mono} style={{ fontWeight: 600, fontSize: 22, color: 'var(--gray-900)' }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--gray-600)' }}>{label}</div>
    </div>
  );

  return (
    <main className={s.page}>
      <h1 className={s.title}>Mon profil</h1>
      <div className={`${s.card} ${s.profileCard}`}>
        <Avatar name={profile.name} size="xl" ring />
        <div style={{ minWidth: 0 }}>
          <p className={s.profileName}>{profile.name || 'Sans nom'}</p>
          <p className={s.subtitle} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {profile.email}
          </p>
        </div>
      </div>
      <div className={s.profileStats}>
        {stat(recipes.length, 'recettes')}
        {stat(favorites.filter((f) => ids.has(f)).length, 'favoris')}
        {stat(plannedCount(plan, ids), 'planifiés')}
      </div>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Input label="Nom" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input
          label="Email de contact"
          type="email"
          autoComplete="email"
          hint="Affiché sur votre profil. L’email de connexion ne change pas."
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className={s.servingsRow}>
            <span className={s.stepsLabel} aria-hidden="true">
              Foyer
            </span>
            <Stepper
              label="Taille du foyer"
              value={household}
              min={MIN_SERVINGS}
              max={MAX_SERVINGS}
              onChange={setHousehold}
              format={servingsLabel}
              decLabel="Une personne de moins dans le foyer"
              incLabel="Une personne de plus dans le foyer"
            />
          </div>
          <p className={s.servingsNote}>Les recettes s’ouvrent avec les quantités pour ce nombre de personnes.</p>
        </div>
        <Button type="submit" size="lg" block>
          Mettre à jour
        </Button>
      </form>
      <p className={s.about}>Chefitto vous aide à décider quoi cuisiner : recettes, frigo, planning et suggestions.</p>
      <Button variant="ghost" block onClick={() => void signOut()}>
        Se déconnecter
      </Button>
    </main>
  );
}
