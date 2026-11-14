import { useState, type CSSProperties } from 'react';
import { imageSrcSet, sizedImageUrl } from '../domain/images';

const BASE = import.meta.env.BASE_URL;
/** Ordre d'essai sans photo : WebP optimisé → PNG d'origine → illustration de secours. */
const SOURCES = [`${BASE}images/dish.webp`, `${BASE}images/dish1.png`];

interface Props {
  size: number;
  style?: CSSProperties;
  className?: string;
  eager?: boolean;
  /** Photo du plat (https). Absente : image de la maquette, puis illustration. */
  src?: string | null;
  /** La photo ne se charge pas (supprimée, bloquée…) : on bascule sur l'image par défaut. */
  onBroken?: (src: string) => void;
}

/**
 * Assiette ronde. Une photo de recette remplit le cercle (`object-fit: cover`) ; l'image par défaut reprend
 * le cadrage de la maquette (source non centrée : largeur 155 %, décalage -26 % / -56.5 %).
 */
export function DishImage({ size, style, className, eager, src, onBroken }: Props) {
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const photo = src && src !== failed ? src : null;
  const fallback = SOURCES[idx];
  const loading = eager ? 'eager' : 'lazy';
  const fetchPriority = eager ? 'high' : 'auto';
  return (
    <div
      className={className}
      data-photo={photo ? 'true' : undefined}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: photo || fallback ? '#fff' : 'radial-gradient(circle at 35% 30%, #fff 0 30%, #ffe9ed 31% 60%, #ffc9d2 61%)',
        flex: 'none',
        ...style,
      }}
    >
      {photo ? (
        <img
          key={photo}
          src={sizedImageUrl(photo, size)}
          srcSet={imageSrcSet(photo, size)}
          alt=""
          width={size}
          height={size}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
          // Pas de Referer : respect de la vie privée et pas de blocage anti-hotlink.
          referrerPolicy="no-referrer"
          onError={() => {
            setFailed(photo);
            onBroken?.(photo);
          }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', maxWidth: 'none' }}
        />
      ) : fallback ? (
        <img
          src={fallback}
          alt=""
          width={Math.round(size * 1.55)}
          height={Math.round(size * 1.55)}
          loading={loading}
          decoding="async"
          fetchPriority={fetchPriority}
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
