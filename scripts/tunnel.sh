#!/usr/bin/env bash
#
# tunnel.sh — gère le tunnel cloudflared vers vercel dev et PERSISTE l'URL
# publique dans .tunnel-url (gitignoré) pour ne pas la chercher dans les logs.
#
# Usage :
#   ./scripts/tunnel.sh start   # lance (ou relance) le tunnel, écrit .tunnel-url
#   ./scripts/tunnel.sh url     # affiche l'URL publique actuelle + endpoint webhook
#   ./scripts/tunnel.sh stop    # arrête le tunnel (s'il tourne)
#   ./scripts/tunnel.sh status  # état + URL si dispo
#
# Prérequis : cloudflared installé (brew install cloudflared).
# NB : Quick Tunnel = URL aléatoire à chaque lancement. Pour une URL FIXE, il
# faudra un tunnel nommé Cloudflare (compte + domaine) ou un déploiement Vercel.

set -euo pipefail
cd "$(dirname "$0")/.."

ROOT="$(pwd -P)"
TUNNEL_URL_FILE="$ROOT/.tunnel-url"
TUNNEL_LOG="$ROOT/.tunnel.log"
PORT="${TUNNEL_PORT:-5174}"
TUNNEL_PID_FILE="$ROOT/.tunnel.pid"

extract_url() {
  # Dernière URL trycloudflare trouvée dans le log
  grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$TUNNEL_LOG" 2>/dev/null | tail -1 || true
}

url() {
  if [ -f "$TUNNEL_URL_FILE" ]; then
    cat "$TUNNEL_URL_FILE"
  else
    echo ""
  fi
}

start() {
  # Un tunnel tourne déjà ? → afficher son URL, ne pas en créer un autre.
  local existing
  existing="$(url)"
  if [ -n "$existing" ] && curl -sf -o /dev/null "$existing/api/dialer?resource=config"; then
    echo "Tunnel déjà actif : $existing"
    echo "Webhook : $existing/api/dialer?resource=webhooks"
    return 0
  fi

  # Vérifier que vercel dev (ou vite) écoute sur le port.
  if ! curl -sf -o /dev/null "http://localhost:$PORT/api/dialer?resource=config"; then
    echo "⚠️  Rien ne répond sur http://localhost:$PORT — lance d'abord :" >&2
    echo "    vercel dev --listen $PORT  (avec .env.local sourcé)" >&2
    exit 1
  fi

  rm -f "$TUNNEL_LOG"
  nohup cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate \
    >"$TUNNEL_LOG" 2>&1 &
  echo $! > "$TUNNEL_PID_FILE"

  # Attendre que l'URL apparaisse dans le log (jusqu'à ~20s).
  local attempts=0
  local u=""
  while [ "$attempts" -lt 20 ]; do
    u="$(extract_url)"
    if [ -n "$u" ]; then
      printf '%s\n' "$u" > "$TUNNEL_URL_FILE"
      echo "Tunnel démarré : $u"
      echo "Webhook : $u/api/dialer?resource=webhooks"
      echo "URL persistée dans .tunnel-url"
      return 0
    fi
    sleep 1
    attempts=$((attempts + 1))
  done
  echo "⚠️  L'URL n'est pas apparue dans le log. Détails :" >&2
  tail -20 "$TUNNEL_LOG" >&2
  exit 1
}

stop() {
  if [ -f "$TUNNEL_PID_FILE" ]; then
    local pid
    pid="$(cat "$TUNNEL_PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      echo "Tunnel arrêté (pid $pid)."
    fi
    rm -f "$TUNNEL_PID_FILE"
  else
    echo "Pas de pid enregistré — rien à arrêter (ou tunnel lancé manuellement)."
  fi
  rm -f "$TUNNEL_URL_FILE"
  echo ".tunnel-url supprimé."
}

status() {
  local u
  u="$(url)"
  if [ -n "$u" ]; then
    echo "URL enregistrée : $u"
    if curl -sf -o /dev/null "$u/api/dialer?resource=config"; then
      echo "État : RÉPOND (endpoint public joignable)"
    else
      echo "État : enregistrée mais ne répond pas (tunnel arrêté ?)"
    fi
  else
    echo "Pas d'URL enregistrée (tunnel non démarré via ./scripts/tunnel.sh)."
  fi
}

case "${1:-}" in
  start) start ;;
  url) url ;;
  stop) stop ;;
  status) status ;;
  *) echo "Usage: $0 {start|url|stop|status}" >&2; exit 1 ;;
esac
