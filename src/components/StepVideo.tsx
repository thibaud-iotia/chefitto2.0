import { memo, useState } from 'react';
import { videoEmbedUrl, videoThumbnail, type StepVideo as Video } from '../data/stepVideos';
import { Play } from './icons';
import st from './stepVideo.module.css';

interface Props {
  /** `'loading'` : recherche en cours ; `null` : pas de vidéo pour cette étape (rien n'est affiché). */
  video: Video | null | 'loading';
}

/**
 * Vidéo YouTube d'une étape. Miniature seule tant qu'on ne la touche pas : aucun lecteur chargé, aucun cookie,
 * peu de données en 4G. Au toucher, lecteur `youtube-nocookie` lancé sur place (`playsinline` : pas de plein écran forcé
 * sur iPhone). À remonter avec une `key` par étape : changer d'étape arrête la vidéo.
 */
export const StepVideo = memo(function StepVideo({ video }: Props) {
  const [playing, setPlaying] = useState(false);
  const [thumbOk, setThumbOk] = useState(true);

  if (video === null) return null;
  if (video === 'loading') {
    return (
      <div className={st.video} aria-busy="true">
        <div className={`${st.frame} ${st.loading}`} aria-hidden="true" />
        <span className="sr-only">Recherche d’une vidéo pour cette étape…</span>
      </div>
    );
  }

  return (
    <figure className={st.video}>
      {playing ? (
        <div className={st.frame}>
          <iframe
            className={st.player}
            src={videoEmbedUrl(video.id)}
            title={`Vidéo : ${video.title}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            // YouTube refuse la lecture intégrée sans référent (erreur 153) : pas de `no-referrer` ici.
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      ) : (
        <button type="button" className={st.frame} onClick={() => setPlaying(true)} aria-label={`Lire la vidéo « ${video.title} »`}>
          {thumbOk && (
            <img className={st.thumb} src={videoThumbnail(video.id)} alt="" decoding="async" onError={() => setThumbOk(false)} />
          )}
          <span className={st.play} aria-hidden="true">
            <Play />
          </span>
        </button>
      )}
      <figcaption className={st.caption}>
        <p className={st.title}>{video.title}</p>
        <p className={st.meta}>{video.channel ? `${video.channel} · YouTube` : 'YouTube'}</p>
      </figcaption>
    </figure>
  );
});
