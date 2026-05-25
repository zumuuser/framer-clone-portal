#!/bin/bash
set -e

# FramerClone Blue-Green Deployment Script
# Usage: ./scripts/deploy-bluegreen.sh [blue|green|auto]
# If no argument, auto-detects inactive color and deploys there.

STACK_NAME="framerclone"
REPO_DIR="/var/lib/dokploy/applications/framerclone-portal"
PROD_DOMAIN="clone.webyverse.com"
LOG_FILE="/var/log/framerclone-deploy.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Determine which color is currently active (has production router)
get_active_color() {
  local blue_labels=$(docker service inspect "${STACK_NAME}_blue" --format '{{ json .Spec.Labels }}' 2>/dev/null || echo '{}')
  local green_labels=$(docker service inspect "${STACK_NAME}_green" --format '{{ json .Spec.Labels }}' 2>/dev/null || echo '{}')
  
  if echo "$blue_labels" | grep -q '"traefik.http.routers.framerclone.rule"'; then
    echo "blue"
  elif echo "$green_labels" | grep -q '"traefik.http.routers.framerclone.rule"'; then
    echo "green"
  else
    # Default to blue if neither has prod router (first deploy)
    echo "blue"
  fi
}

# Add production router labels to a service
add_prod_labels() {
  local service="$1"
  local service_name="${STACK_NAME}_${service}"
  
  log "Adding production router to $service..."
  docker service update \
    --label-add "traefik.http.routers.framerclone.rule=Host(\`$PROD_DOMAIN\`)" \
    --label-add "traefik.http.routers.framerclone.entrypoints=websecure" \
    --label-add "traefik.http.routers.framerclone.tls.certresolver=letsencrypt" \
    --label-add "traefik.http.routers.framerclone.service=framerclone-${service}" \
    --label-add "traefik.http.routers.framerclone-http.rule=Host(\`$PROD_DOMAIN\`)" \
    --label-add "traefik.http.routers.framerclone-http.entrypoints=web" \
    --label-add "traefik.http.routers.framerclone-http.middlewares=framerclone-${service}-https" \
    --label-add "traefik.http.middlewares.framerclone-${service}-https.redirectscheme.scheme=https" \
    "$service_name" >/dev/null 2>&1
}

# Remove production router labels from a service
remove_prod_labels() {
  local service="$1"
  local service_name="${STACK_NAME}_${service}"
  
  log "Removing production router from $service..."
  docker service update \
    --label-rm "traefik.http.routers.framerclone.rule" \
    --label-rm "traefik.http.routers.framerclone.entrypoints" \
    --label-rm "traefik.http.routers.framerclone.tls.certresolver" \
    --label-rm "traefik.http.routers.framerclone.service" \
    --label-rm "traefik.http.routers.framerclone-http.rule" \
    --label-rm "traefik.http.routers.framerclone-http.entrypoints" \
    --label-rm "traefik.http.routers.framerclone-http.middlewares" \
    --label-rm "traefik.http.middlewares.framerclone-${service}-https.redirectscheme.scheme" \
    "$service_name" >/dev/null 2>&1 || true
}

# Run smoke tests against a color
test_color() {
  local color="$1"
  local test_domain="${color}.${PROD_DOMAIN}"
  local max_attempts=30
  local attempt=0
  
  log "Waiting for $color to be healthy at https://$test_domain..."
  
  while [ $attempt -lt $max_attempts ]; do
    local status=$(curl -s -o /dev/null -w '%{http_code}' "https://$test_domain" 2>/dev/null || echo "000")
    if [ "$status" = "200" ] || [ "$status" = "307" ] || [ "$status" = "302" ]; then
      log "✓ $color health check passed (HTTP $status)"
      return 0
    fi
    attempt=$((attempt + 1))
    log "  Attempt $attempt/$max_attempts: HTTP $status"
    sleep 5
  done
  
  log "✗ $color health check FAILED after $max_attempts attempts"
  return 1
}

# Main deploy flow
main() {
  local target_color="$1"
  
  log "=== Blue-Green Deploy Started ==="
  
  cd "$REPO_DIR"
  
  # Pull latest code
  log "Pulling latest code..."
  git stash push --include-untracked -m "deploy-stash" >/dev/null 2>&1 || true
  git fetch origin main
  git reset --hard origin/main
  git stash pop >/dev/null 2>&1 || true
  
  # Build image
  log "Building Docker image..."
  docker build -t framerclone-portal:latest .
  
  # Determine colors
  local active_color=$(get_active_color)
  if [ -z "$target_color" ] || [ "$target_color" = "auto" ]; then
    target_color=$([ "$active_color" = "blue" ] && echo "green" || echo "blue")
  fi
  
  log "Active: $active_color → Target: $target_color"
  
  if [ "$target_color" = "$active_color" ]; then
    log "WARNING: Target color is already active. Forcing update on $target_color anyway."
  fi
  
  # Update target (inactive) color with new image
  log "Updating $target_color with new image..."
  docker service update \
    --image framerclone-portal:latest \
    --force \
    "${STACK_NAME}_${target_color}" >/dev/null 2>&1
  
  # Scale target to 1 if it's 0
  docker service scale "${STACK_NAME}_${target_color}=1" >/dev/null 2>&1
  
  # Wait and test
  if ! test_color "$target_color"; then
    log "✗ DEPLOY FAILED: $target_color did not pass health checks"
    log "Keeping $active_color as production. Fix issues and retry."
    exit 1
  fi
  
  # Swap production labels
  log "Switching production traffic to $target_color..."
  remove_prod_labels "$active_color"
  sleep 3
  add_prod_labels "$target_color"
  
  # Scale old active down to 0 (optional - keeps it warm for fast rollback)
  # Uncomment next line to scale down old color:
  # docker service scale "${STACK_NAME}_${active_color}=0" >/dev/null 2>&1
  
  log "=== Deploy Complete ==="
  log "Production is now on: $target_color"
  log "Test URLs: https://blue.${PROD_DOMAIN} | https://green.${PROD_DOMAIN}"
  log "Production: https://${PROD_DOMAIN}"
}

main "$@"
