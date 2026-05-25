#!/bin/bash
# Wazuh Indexer Security Initialization
# Run this AFTER the Wazuh Indexer container is running
# Usage: docker exec -it <wazuh-indexer-container> bash /usr/share/wazuh-indexer/plugins/opensearch-security/tools/securityadmin.sh -cd /usr/share/wazuh-indexer/plugins/opensearch-security/securityconfig -icl -nhnv -cacert /usr/share/wazuh-indexer/certs/ca.crt -cert /usr/share/wazuh-indexer/certs/admin.crt -key /usr/share/wazuh-indexer/certs/admin.key

set -e

echo "=== Wazuh Indexer Security Initialization ==="
echo "This script initializes the Wazuh Indexer security plugin."
echo ""

# Find the wazuh-indexer container
CONTAINER=$(docker ps --filter "name=monitoring_wazuh-indexer" --format "{{.ID}}")

if [ -z "$CONTAINER" ]; then
    echo "ERROR: Wazuh Indexer container not found."
    echo "Make sure the monitoring stack is deployed and the indexer is running."
    exit 1
fi

echo "Found Wazuh Indexer container: $CONTAINER"
echo "Initializing security..."

docker exec "$CONTAINER" bash /usr/share/wazuh-indexer/plugins/opensearch-security/tools/securityadmin.sh \
    -cd /usr/share/wazuh-indexer/plugins/opensearch-security/securityconfig \
    -icl -nhnv \
    -cacert /usr/share/wazuh-indexer/certs/ca.crt \
    -cert /usr/share/wazuh-indexer/certs/admin.crt \
    -key /usr/share/wazuh-indexer/certs/admin.key

echo ""
echo "=== Indexer security initialized ==="
echo "You can now access the Wazuh Dashboard at https://wazuh.clone.webyverse.com"
