import { useState, type CSSProperties } from 'react';

const BASE = import.meta.env.BASE_URL;
/** Ordre d'essai : WebP optimisé → PNG d'origine → illustration de secours. */
const SOURCES = [`${BASE}images/dish.webp`, `${BASE}images/dish1.png`];

interface Props {
  size: number;
  style?: CSSProperties;
  className?: string;
  eager?: boolean;
}

/**
 * Assiette ronde. Le cadrage reprend celui de la maquette
 * (l'image source n'est pas centrée : largeur 155 %, décalage -26 % / -56.5 %).
 */
export function DishImage({ size, style, className, eager }: Props) {
  const [idx, setIdx] = useState(0);
  const src = SOURCES[idx];
  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: src ? '#fff' : 'radial-gradient(circle at 35% 30%, #fff 0 30%, #ffe9ed 31% 60%, #ffc9d2 61%)',
        flex: 'none',
        ...style,
      }}
    >
      {src ? (
        <img
          src={src}
          alt=""
          width={Math.round(size * 1.55)}
          height={Math.round(size * 1.55)}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={eager ? 'high' : 'auto'}
          onError={() => setIdx((i) => i + 1)}
          style={{ position: 'absolute', width: '155%', height: 'auto', left: '-26%', top: '-56.5%', maxWidth: 'none' }}
        />
      ) : (
        <span aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: size * 0.4 }}>
          🍽️
        </span>
      )}
    </div>
  );
}
