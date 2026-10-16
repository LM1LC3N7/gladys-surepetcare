// -----------------------------------------------------------------------------
// Texts shown in Gladys (connection status, button, device and feature names,
// lock mode labels), in English and French.
// -----------------------------------------------------------------------------

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** The text of `texts` in `language`, English otherwise. */
export const word = (texts, language) => texts[language] ?? texts.en;

/** Device names when Sure Petcare has none. */
export const PRODUCT_NAMES = {
  1: { en: 'Hub', fr: 'Hub' },
  3: { en: 'Pet door', fr: 'Porte pour animaux' },
  4: { en: 'Feeder', fr: 'Distributeur' },
  6: { en: 'Cat flap', fr: 'Chatière' },
  7: { en: 'Feeder Lite', fr: 'Distributeur Lite' },
  8: { en: 'Felaqua', fr: 'Felaqua' },
  pet: { en: 'Pet', fr: 'Animal' },
};

/** Feature names, in the language chosen in the configuration. */
export const FEATURE_NAMES = {
  online: { en: 'Online', fr: 'En ligne' },
  battery: { en: 'Battery', fr: 'Batterie' },
  'lock-mode': { en: 'Lock mode', fr: 'Mode de verrouillage' },
  'bowl-single': { en: 'Bowl (g)', fr: 'Gamelle (g)' },
  'bowl-0': { en: 'Left bowl (g)', fr: 'Gamelle gauche (g)' },
  'bowl-1': { en: 'Right bowl (g)', fr: 'Gamelle droite (g)' },
  'last-meal': { en: 'Last meal (g)', fr: 'Dernier repas (g)' },
  'last-meal-pet': { en: 'Last meal by', fr: 'Dernier repas de' },
  water: { en: 'Water left', fr: 'Eau restante' },
  'water-level': { en: 'Water level', fr: "Niveau d'eau" },
  presence: { en: 'Inside', fr: "À l'intérieur" },
  'location-duration': { en: 'Time since the last move', fr: 'Depuis le dernier passage' },
  'last-drink': { en: 'Last drink', fr: 'Dernière boisson' },
};

/** Labels of the lock mode options (plain strings in Gladys). */
export const LOCK_MODE_NAMES = {
  unlocked: { en: 'Unlocked', fr: 'Ouverte' },
  keep_in: { en: 'Keep pets in', fr: "Garder à l'intérieur" },
  keep_out: { en: 'Keep pets out', fr: "Garder à l'extérieur" },
  locked: { en: 'Locked', fr: 'Fermée' },
  curfew: { en: 'Curfew', fr: 'Couvre-feu' },
};

/** "25 min" / "3 h", for the pauses. */
export function age(ms) {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 120) {
    return { en: `${minutes} min`, fr: `${minutes} min` };
  }
  const hours = Math.round(minutes / 60);
  return { en: `${hours} h`, fr: `${hours} h` };
}

/** "2026-11-15" (UTC), for the session expiry. */
const day = (ms) => new Date(ms).toISOString().slice(0, 10);

export const T = {
  session: (expiresAt) =>
    expiresAt === undefined
      ? { en: '', fr: '' }
      : {
          en: `Session valid until ${day(expiresAt)}.`,
          fr: `Session valable jusqu'au ${day(expiresAt)}.`,
        },
  noCredentials: {
    en: 'Enter the e-mail and password of your Sure Petcare account (the one of the app).',
    fr: "Saisissez l'e-mail et le mot de passe de votre compte Sure Petcare (celui de l'application).",
  },
  connecting: {
    en: 'Signing in to Sure Petcare…',
    fr: 'Connexion à Sure Petcare…',
  },
  connected: ({ devices, pets }, expiresAt) => {
    const tail = T.session(expiresAt);
    const en = `Connected to Sure Petcare: ${plural(devices, 'device', 'devices')}, ${plural(pets, 'pet', 'pets')}. Open Discovery to add them.`;
    const fr = `Connecté à Sure Petcare : ${plural(devices, 'appareil', 'appareils')}, ${plural(pets, 'animal', 'animaux')}. Ouvrez Découverte pour les ajouter.`;
    return {
      en: tail.en ? `${en} ${tail.en}` : en,
      fr: tail.fr ? `${fr} ${tail.fr}` : fr,
    };
  },
  refused: {
    en: 'Sure Petcare refused the e-mail or password: check them in the configuration (the integration waits for a change).',
    fr: "Sure Petcare a refusé l'e-mail ou le mot de passe : vérifiez-les dans la configuration (l'intégration attend une modification).",
  },
  expired: {
    en: 'The Sure Petcare session expired and the new sign-in was refused: check the e-mail and password.',
    fr: "La session Sure Petcare a expiré et la nouvelle connexion a été refusée : vérifiez l'e-mail et le mot de passe.",
  },
  unreachable: (reason, wait) => ({
    en: `Sure Petcare cannot be reached (${reason}). Next try in ${wait.en}.`,
    fr: `Sure Petcare est injoignable (${reason}). Nouvel essai dans ${wait.fr}.`,
  }),
  rateLimited: (wait) => ({
    en: `Sure Petcare asks to slow down: pausing for ${wait.en}.`,
    fr: `Sure Petcare demande de ralentir : pause de ${wait.fr}.`,
  }),
  forbidden: (wait) => ({
    en: `Sure Petcare refuses the requests (HTTP 403): pausing for ${wait.en}.`,
    fr: `Sure Petcare refuse les requêtes (HTTP 403) : pause de ${wait.fr}.`,
  }),
  offline: {
    en: 'The hub reports this device offline.',
    fr: 'Le hub signale cet appareil hors ligne.',
  },
  noCurfew: {
    en: 'No curfew times on this flap: set them once in the Sure Petcare app.',
    fr: "Aucun horaire de couvre-feu sur cette chatière : réglez-les une fois dans l'application Sure Petcare.",
  },
  notApplied: {
    en: 'Sure Petcare did not apply the lock mode.',
    fr: "Sure Petcare n'a pas appliqué le mode de verrouillage.",
  },
  test: {
    cooldown: {
      en: 'Already read less than 30 seconds ago.',
      fr: 'Déjà lu il y a moins de 30 secondes.',
    },
    summary: ({ households, devices, pets }) => ({
      en: `${plural(households, 'household', 'households')}, ${plural(devices, 'device', 'devices')}, ${plural(pets, 'pet', 'pets')}.`,
      fr: `${plural(households, 'foyer', 'foyers')}, ${plural(devices, 'appareil', 'appareils')}, ${plural(pets, 'animal', 'animaux')}.`,
    }),
    pet: (name, where) => ({
      en: `${name}: ${where === 1 ? 'inside' : where === 2 ? 'outside' : 'unknown'}.`,
      fr: `${name} : ${where === 1 ? "à l'intérieur" : where === 2 ? "à l'extérieur" : 'inconnu'}.`,
    }),
  },
};
