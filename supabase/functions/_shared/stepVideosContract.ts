// Contrat de l'API `step-videos`, sans dépendance : importable par l'app (bundle navigateur) comme par le serveur.

/** Étapes acceptées par requête (une recette importée dépasse rarement 15 étapes). */
export const MAX_STEPS = 30;
export const MAX_STEP_CHARS = 1000;
export const MAX_RECIPE_CHARS = 200;

/** Vidéo YouTube proposée pour une étape. */
export interface StepVideo {
  /** Identifiant YouTube (11 caractères). */
  id: string;
  title: string;
  channel: string;
}

export interface StepVideosRequest {
  recipe: string;
  steps: string[];
}

/**
 * `videos[i]` : vidéo de l'étape `i`, ou `null` si aucune (étape sans geste à montrer, aucun résultat).
 * `partial` : certaines étapes n'ont pas pu être cherchées (quota YouTube épuisé, erreur passagère) ;
 * le client ne garde pas la réponse en cache et pourra réessayer.
 */
export type StepVideosResponseBody = { videos: (StepVideo | null)[]; partial?: boolean } | { error: string };

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export const isVideoId = (id: unknown): id is string => typeof id === 'string' && VIDEO_ID.test(id);

/** Miniature 480×360 (bandes noires en haut et en bas, recadrées en 16:9 par `object-fit: cover`). */
export const videoThumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

/** Lecteur sans cookie de suivi tant que la vidéo n'est pas lancée. */
export const videoEmbedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
