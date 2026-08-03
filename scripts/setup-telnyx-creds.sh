#!/usr/bin/env bash
#
# setup-telnyx-creds.sh — collecte sécurisée des 4 credentials Telnyx (GO runbook,
# étape 5) directement dans .env.local.
#
# Sécurité :
#   - saisie en mode silencieux (read -s) quand stdin est un TTY : les valeurs
#     ne sont jamais ré-échoées à l'écran, donc jamais capturées dans le chat ;
#   - tous les messages passent sur stderr ; seule la valeur transite sur stdout ;
#   - aucune valeur complète n'est imprimée : confirmations tronquées (début***fin) ;
#   - sauvegarde horodatée de .env.local avant toute écriture ;
#   - chmod 600 sur .env.local après écriture.
#
# Usage : ./scripts/setup-telnyx-creds.sh   (depuis la racine du dépôt)
#
# ⚠️  Portée : TELNYX_CALLER_ID_DEV est un fallback DEV (smoke test). En usage
# réel, chaque utilisateur opt-in aura son/ses numéros alloués en base
# (allocation autonome via l'API Telnyx) — pas de variable d'env par user.

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_FILE=".env.local"
BACKUP="${ENV_FILE}.bak.$(date +%Y%m%d-%H%M%S)"

# --- masquage (début***fin) ---------------------------------------------------
mask() {
  local v="$1" n="${#1}"
  if [ "$n" -le 10 ]; then printf '***'; return; fi
  printf '%s***%s' "${v:0:3}" "${v: -3}"
}

# --- collecte d'une variable : messages sur stderr, valeur seule sur stdout ----
# Pas de validation de format : non vide suffit (Telnyx valide au moment du dial,
# les formats d'IDs varient — UUID, identifiants numériques, chaînes longues).
# Si optional=1, un Entrée sans valeur = skip (on renvoie la chaîne vide).
ask_var() {
  local label="$1" where="$2" what="$3" optional="${4:-0}"
  local value="" attempts=0
  while [ "$attempts" -lt 5 ]; do
    attempts=$((attempts + 1))
    echo "" >&2
    echo "═══════════════════════════════════════════════════════════════" >&2
    echo "  ÉTAPE $label" >&2
    echo "═══════════════════════════════════════════════════════════════" >&2
    echo "  1) Où la trouver :" >&2
    echo "$where" | sed 's/^/     /' >&2
    echo "" >&2
    echo "  2) Ce que tu colles :" >&2
    echo "$what" | sed 's/^/     /' >&2
    printf '\n  Colle la valeur ici (invisible) puis Entrée : ' >&2
    IFS= read -r -s value || { echo "✗ lecture impossible — abandon." >&2; exit 1; }
    echo "" >&2
    if [ -z "$value" ] && [ "$optional" -eq 1 ]; then
      echo "→ Champ laissé vide (optionnel) : on continue." >&2
      printf '%s' ""
      return 0
    fi
    if [ -z "$value" ]; then
      echo "✗ champ vide — abandon." >&2
      exit 1
    fi
    printf '%s' "$value"
    return 0
  done
  echo "✗ trop de tentatives — abandon." >&2
  exit 1
}

echo "═══════════════════════════════════════════════════════════════" >&2
echo " Collecte sécurisée des credentials Telnyx → $ENV_FILE" >&2
echo " (saisie invisible ; valeurs jamais affichées ni loguées)" >&2
echo "═══════════════════════════════════════════════════════════════" >&2

TELNYX_API_KEY_DEV="$(ask_var \
  "1/4 — TELNYX_API_KEY_DEV (clé API)" \
  "Menu gauche → API Keys → bouton 'Create API Key' → nom 'xos-dialer-dev'
   → permission 'Call Control' → 'Create'.
   ⚠️ La clé n'est affichée qu'UNE SEULE FOIS à la création :
   copie-la immédiatement." \
  "La clé complète telle qu'affichée par Telnyx (elle commence par KEY…).")"

TELNYX_CALLER_ID_DEV="$(ask_var \
  "2/4 — TELNYX_CALLER_ID_DEV (numéro appelant)" \
  "Menu gauche → Numbers → My Numbers → clique sur ton numéro FR approuvé
   (statut 'Active') pour afficher le numéro complet." \
  "Le numéro au format international : +33 puis 9 chiffres.
   Si Telnyx affiche 01 23 45 67 89, tu colles : +33123456789")"

# Alerte réglementaire si le numéro est un mobile 06/07 (interdit pour l'usage
# automatisé en France, cf. docs/compliance/demarchage-b2b-france.md).
if [[ "$TELNYX_CALLER_ID_DEV" =~ ^\+33[67] ]]; then
  echo "⚠️  Mobile (06/07) détecté : interdit pour l'appel automatisé en France." >&2
  echo "   Le smoke test technique reste possible ; l'usage réel exigera un fixe (01–05)." >&2
fi

WEBHOOK_TELNYX_PUBLIC_KEY="$(ask_var \
  "3/4 — WEBHOOK_TELNYX_PUBLIC_KEY (clé publique du webhook) — OPTIONNEL" \
  "Menu gauche → Real-Time Communication → Voice → Programmable Voice
   → onglet 'Voice API Applications' → ouvre ton application
   → section 'Webhook' → champ 'Webhook public key'.
   ⚠️ Feature PAID-ONLY : indisponible en trial. En trial, appuie sur Entrée
   sans rien coller pour passer (le dial réel fonctionne sans, seule la
   validation des webhooks attend le passage paid)." \
  "La chaîne base64 complète telle qu'affichée (clé Ed25519)." \
  1)"

CONNECTION_ID="$(ask_var \
  "4/4 — connection_id (= Application ID)" \
  "Menu gauche → Real-Time Communication → Voice → Programmable Voice
   → onglet 'Voice API Applications' → ouvre ton application
   → champ 'Application ID' en haut de la fiche.
   ⚠️ C'est CET ID qu'on passe comme connection_id du dial (la doc Telnyx
   dit explicitement : 'connection_id: which is the Application ID')." \
  "L'Application ID tel qu'affiché par Telnyx (UUID ou autre format).")"

# --- écriture ----------------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$BACKUP"
  echo "" >&2
  echo "Sauvegarde : $BACKUP" >&2
fi

upsert() {
  local var="$1" value="$2"
  # Ne pas écrire une variable vide (ex. clé webhook skip en trial) :
  # on retire juste une éventuelle ancienne valeur.
  if [ -z "$value" ]; then
    if [ -f "$ENV_FILE" ]; then
      grep -v "^${var}=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
      mv "$ENV_FILE.tmp" "$ENV_FILE"
    fi
    return 0
  fi
  if [ -f "$ENV_FILE" ]; then
    grep -v "^${var}=" "$ENV_FILE" > "$ENV_FILE.tmp" || true
    mv "$ENV_FILE.tmp" "$ENV_FILE"
  fi
  printf '%s=%s\n' "$var" "$value" >> "$ENV_FILE"
}

upsert TELNYX_API_KEY_DEV        "$TELNYX_API_KEY_DEV"
upsert TELNYX_CALLER_ID_DEV      "$TELNYX_CALLER_ID_DEV"
upsert WEBHOOK_TELNYX_PUBLIC_KEY "$WEBHOOK_TELNYX_PUBLIC_KEY"
upsert CONNECTION_ID             "$CONNECTION_ID"
chmod 600 "$ENV_FILE"

echo ""
echo "✅ Écrit dans $ENV_FILE (mode 600)."
echo "   TELNYX_API_KEY_DEV        = $(mask "$TELNYX_API_KEY_DEV")"
echo "   TELNYX_CALLER_ID_DEV      = $(mask "$TELNYX_CALLER_ID_DEV")"
echo "   WEBHOOK_TELNYX_PUBLIC_KEY = $(mask "$WEBHOOK_TELNYX_PUBLIC_KEY")"
echo "   connection_id             = $(mask "$CONNECTION_ID")"
echo ""
echo "Les valeurs complètes ne sont apparues ni à l'écran, ni dans le chat."
