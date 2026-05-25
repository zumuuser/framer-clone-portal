#!/bin/bash
# Wazuh Certificate Setup Script
# Run this ONCE on the VPS before deploying the Wazuh stack
# Usage: cd /var/lib/dokploy/applications/framerclone-portal && bash monitoring/wazuh/setup-certs.sh

set -e

CERTS_DIR="/var/lib/dokploy/applications/framerclone-portal/monitoring/wazuh/certs"
MANAGER_CONFIG="/var/lib/dokploy/applications/framerclone-portal/monitoring/wazuh/manager"

echo "=== Wazuh Certificate Setup ==="
echo "This script generates certificates for Wazuh Indexer and Dashboard."
echo ""

# Create directories
mkdir -p "$CERTS_DIR"
mkdir -p "$MANAGER_CONFIG"

# Download Wazuh certificate tool if not present
if [ ! -f "$CERTS_DIR/wazuh-certs-tool.sh" ]; then
    echo "Downloading Wazuh certificate tool..."
    curl -sO https://packages.wazuh.com/4.8/wazuh-certs-tool.sh
    curl -sO https://packages.wazuh.com/4.8/config.yml
    bash wazuh-certs-tool.sh -A
    mv wazuh-certificates/* "$CERTS_DIR/"
    rm -rf wazuh-certificates wazuh-certs-tool.sh config.yml
fi

# Set proper permissions
echo "Setting certificate permissions..."
chmod 500 "$CERTS_DIR"
chmod 400 "$CERTS_DIR"/*

# Rename certs for indexer
if [ -f "$CERTS_DIR/root-ca.pem" ]; then
    cp "$CERTS_DIR/root-ca.pem" "$CERTS_DIR/ca.crt"
fi
if [ -f "$CERTS_DIR/admin.pem" ]; then
    cp "$CERTS_DIR/admin.pem" "$CERTS_DIR/admin.crt"
fi
if [ -f "$CERTS_DIR/admin-key.pem" ]; then
    cp "$CERTS_DIR/admin-key.pem" "$CERTS_DIR/admin.key"
fi
if [ -f "$CERTS_DIR/wazuh-indexer.pem" ]; then
    cp "$CERTS_DIR/wazuh-indexer.pem" "$CERTS_DIR/indexer.crt"
fi
if [ -f "$CERTS_DIR/wazuh-indexer-key.pem" ]; then
    cp "$CERTS_DIR/wazuh-indexer-key.pem" "$CERTS_DIR/indexer.key"
fi
if [ -f "$CERTS_DIR/wazuh-dashboard.pem" ]; then
    cp "$CERTS_DIR/wazuh-dashboard.pem" "$CERTS_DIR/dashboard.crt"
fi
if [ -f "$CERTS_DIR/wazuh-dashboard-key.pem" ]; then
    cp "$CERTS_DIR/wazuh-dashboard-key.pem" "$CERTS_DIR/dashboard.key"
fi

echo ""
echo "=== Certificates generated in $CERTS_DIR ==="
echo "Files:"
ls -la "$CERTS_DIR"
echo ""
echo "Next steps:"
echo "1. Deploy the monitoring stack: docker stack deploy -c docker-compose.monitoring.yml monitoring"
echo "2. Initialize the Wazuh Indexer security (see initialize-indexer.sh)"
