#!/bin/bash
set -e

# FramerClone Security Scan
# Runs on every deploy. Exits with code 1 if critical issues found.
# ACSS Layer: DETECT

REPO_DIR="/var/lib/dokploy/applications/framerclone-portal"
ERRORS=0
WARNINGS=0

log_check() {
  local name="$1"
  local status="$2"
  local detail="$3"
  local severity="${4:-info}"
  local ts
  ts=$(date -Iseconds)
  echo "[$ts] [$severity] $name: $status | $detail"
}

cd "$REPO_DIR"

# ===== CHECK 1: npm audit =====
log_check "npm_audit" "running" "Checking for known vulnerabilities" "info"
if npm audit --audit-level=moderate 2>&1 | tee /tmp/npm-audit.log; then
  log_check "npm_audit" "pass" "No moderate+ vulnerabilities found" "info"
else
  CRITICAL_COUNT=$(grep -c '"severity":"critical"' /tmp/npm-audit.log 2>/dev/null || echo "0")
  HIGH_COUNT=$(grep -c '"severity":"high"' /tmp/npm-audit.log 2>/dev/null || echo "0")
  if [ "$CRITICAL_COUNT" -gt 0 ] || [ "$HIGH_COUNT" -gt 0 ]; then
    log_check "npm_audit" "fail" "Found $CRITICAL_COUNT critical, $HIGH_COUNT high vulnerabilities" "error"
    ERRORS=$((ERRORS + 1))
  else
    log_check "npm_audit" "pass" "Only moderate/low vulnerabilities found" "warn"
    WARNINGS=$((WARNINGS + 1))
  fi
fi

# ===== CHECK 2: Environment variables =====
log_check "env_vars" "running" "Validating required environment variables" "info"

check_env() {
  local name="$1"
  local min_len="${2:-1}"
  local val
  val=$(grep "^${name}=" .env 2>/dev/null | cut -d= -f2- || echo "")
  if [ -z "$val" ]; then
    log_check "env_vars" "fail" "$name is missing or empty" "error"
    ERRORS=$((ERRORS + 1))
    return 1
  fi
  if [ "${#val}" -lt "$min_len" ]; then
    log_check "env_vars" "fail" "$name is too short (${#val} < $min_len chars)" "error"
    ERRORS=$((ERRORS + 1))
    return 1
  fi
  log_check "env_vars" "pass" "$name is set (${#val} chars)" "info"
  return 0
}

check_env "NEXTAUTH_SECRET" 32
check_env "GITHUB_CLIENT_ID" 10
check_env "GITHUB_CLIENT_SECRET" 10
check_env "GITHUB_TOKEN_ENCRYPTION_KEY" 32
check_env "DATABASE_URL" 5

# ===== CHECK 3: Secret pattern grep =====
log_check "secret_grep" "running" "Scanning source for hardcoded secrets" "info"
PATTERN_MATCHES=$(grep -rnE '(password|secret|token|api_key)\s*=\s*["\x27][^"\x27]{8,}' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v 'process\.env\.' | grep -v '\.test\.' | grep -v 'lib/auth\.ts' | grep -v 'lib/admin\.ts' | wc -l)
if [ "$PATTERN_MATCHES" -gt 0 ]; then
  log_check "secret_grep" "warn" "Found $PATTERN_MATCHES potential hardcoded secrets (review required)" "warn"
  grep -rnE '(password|secret|token|api_key)\s*=\s*["\x27][^"\x27]{8,}' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | grep -v 'process\.env\.' | grep -v '\.test\.' | grep -v 'lib/auth\.ts' | grep -v 'lib/admin\.ts' || true
  WARNINGS=$((WARNINGS + 1))
else
  log_check "secret_grep" "pass" "No hardcoded secrets detected" "info"
fi

# ===== CHECK 4: Prisma index check =====
log_check "prisma_index" "running" "Checking Prisma indexes" "info"
if grep -q '@index\|@@index' prisma/schema.prisma; then
  log_check "prisma_index" "pass" "Indexes found in schema" "info"
else
  log_check "prisma_index" "warn" "No indexes found in Prisma schema" "warn"
  WARNINGS=$((WARNINGS + 1))
fi

# ===== SUMMARY =====
echo ""
echo "========================================"
echo "Security Scan Complete"
echo "Errors: $ERRORS | Warnings: $WARNINGS"
echo "========================================"

if [ "$ERRORS" -gt 0 ]; then
  echo "DEPLOYMENT ABORTED due to critical security issues."
  exit 1
fi

exit 0
