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
ask_var() {
  local label="$1" help="$2" regex="$3" hint="$4"
  local value="" attempts=0
  while [ "$attempts" -lt 5 ]; do
    attempts=$((attempts + 1))
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "  $label"
    echo "═══════════════════════════════════════════════════════════════"
    echo "$help"
    printf 'Colle la valeur ici (invisible) : ' >&2
    IFS= read -r -s value || { echo "✗ lecture impossible — abandon." >&2; exit 1; }
    echo ""
    if [ -z "$value" ]; then
      echo "✗ champ vide — abandon." >&2
      exit 1
    fi
    if [[ "$value" =~ $regex ]]; then
      printf '%s' "$value"
      return 0
    fi
    echo "✗ format invalide. Exemple : $hint" >&2
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
  "📌 Où la trouver sur Telnyx (portal.telnyx.com) :
   • Menu latéral gauche → 'API Keys'
   • Bouton 'Create API Key'
   • Nom : xos-dialer-dev
   • Permissions : cocher 'Call Control' (et Voice si proposé)
   • Cliquer 'Create' → LA CLÉ N'EST AFFICHÉE QU'UNE SEULE FOIS.
     Copie-la immédiatement (elle commence par 'KEY…').
   • Si tu l'as perdue : révoque-la et recrée-en une." \
  '^(KEY[A-Za-z0-9_-]+|[A-Za-z0-9]{32,64})$' \
  'KEY… (commence par KEY, ~40+ caractères)')"

TELNYX_CALLER_ID_DEV="$(ask_var \
  "2/4 — TELNYX_CALLER_ID_DEV (numéro appelant)" \
  "📌 Où le trouver sur Telnyx :
   • Menu latéral gauche → 'Numbers' → 'My Numbers'
   • Repère le numéro FR approuvé (statut 'Active')
   • Clique dessus pour afficher le numéro complet
   • Saisis-le au format E.164 : +33 suivi de 9 chiffres
     (ex : 01 23 45 67 89 → +33123456789)." \
  '^\+33[0-9]{9}$' \
  '+33123456789')"

# Alerte réglementaire si le numéro est un mobile 06/07 (interdit pour l'usage
# automatisé en France, cf. docs/compliance/demarchage-b2b-france.md).
if [[ "$TELNYX_CALLER_ID_DEV" =~ ^\+33[67] ]]; then
  echo "⚠️  Mobile (06/07) détecté : interdit pour l'appel automatisé en France." >&2
  echo "   Le smoke test technique reste possible ; l'usage réel exigera un fixe (01–05)." >&2
fi

WEBHOOK_TELNYX_PUBLIC_KEY="$(ask_var \
  "3/4 — WEBHOOK_TELNYX_PUBLIC_KEY (clé de signature webhook)" \
  "📌 Où la trouver sur Telnyx :
   • Menu latéral gauche → 'Voice' (Programmable Voice) → 'Applications'
   • Ouvre ton application (ex : xos-dialer-dev)
   • Section 'Webhook' → champ 'Webhook public key'
   • Copie la chaîne complète (clé Ed25519, base64 ~44 caractères).
     ⚠️  C'est la clé PUBLIQUE (pas le secret) — ne pas confondre avec l'API key." \
  '^[A-Za-z0-9+/]{40,}={0,2}$' \
  'base64 (chaîne de ~44 caractères)')"

CONNECTION_ID="$(ask_var \
  "4/4 — connection_id (ID de connexion de l'application)" \
  "📌 Où le trouver sur Telnyx :
   • Menu latéral gauche → 'Voice' (Programmable Voice) → 'Applications'
   • Ouvre ton application (ex : xos-dialer-dev)
   • En-tête / paramètres de l'application → 'Connection ID'
   • Copie l'UUID (format xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
   C'est le connection_id utilisé par le dial (POST /v2/calls)." \
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' \
  '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d')"

# --- écriture ----------------------------------------------------------------
if [ -f "$ENV_FILE" ]; then
  cp "$ENV_FILE" "$BACKUP"
  echo "" >&2
  echo "Sauvegarde : $BACKUP" >&2
fi

upsert() {
  local var="$1" value="$2"
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
