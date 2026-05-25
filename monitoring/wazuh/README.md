# Wazuh Security Stack Setup

## Overview

This directory contains configuration and scripts for the Wazuh security monitoring stack.

## Architecture

```
User → Traefik (SSL + basic auth) → Wazuh Dashboard (5601)
                                        ↓
                                   Wazuh Manager (55000)
                                        ↓
                                   Wazuh Indexer (9200)
```

## Services

| Service | Image | Purpose | Port |
|---------|-------|---------|------|
| wazuh-manager | wazuh/wazuh-manager:4.8.0 | Security alerts, FIM, log analysis | 1514, 55000 |
| wazuh-indexer | wazuh/wazuh-indexer:4.8.0 | Alert storage (OpenSearch) | 9200 |
| wazuh-dashboard | wazuh/wazuh-dashboard:4.8.0 | Web UI for alerts | 5601 |
| wazuh-exporter | python:3.11-slim | Prometheus metrics from alerts | 9101 |

## Setup Steps (Run on VPS)

### 1. Generate Certificates (ONE TIME)

```bash
cd /var/lib/dokploy/applications/framerclone-portal
bash monitoring/wazuh/setup-certs.sh
```

This downloads the Wazuh certificate tool and generates certificates for the indexer and dashboard.

### 2. Deploy the Stack

```bash
cd /var/lib/dokploy/applications/framerclone-portal
docker stack deploy -c docker-compose.monitoring.yml monitoring
```

### 3. Initialize Wazuh Indexer Security (ONE TIME)

Wait ~60 seconds for the indexer to start, then run:

```bash
cd /var/lib/dokploy/applications/framerclone-portal
bash monitoring/wazuh/initialize-indexer.sh
```

This initializes the OpenSearch security plugin with the generated certificates.

### 4. Verify

- Wazuh Dashboard: https://wazuh.clone.webyverse.com
  - Login: admin / (from .env WAZUH_DASHBOARD_PASSWORD)
- Wazuh API: https://wazuh.clone.webyverse.com (via Traefik basic auth)

## Grafana Integration

The `wazuh-exporter` service reads alerts from `/var/ossec/logs/alerts` and exposes Prometheus metrics on port 9101. These metrics are scraped by Prometheus and displayed in the "Security Monitoring" Grafana dashboard.

## File Integrity Monitoring (FIM)

The Wazuh Manager monitors these paths by default:
- `/etc` (system config)
- `/usr/bin` (binaries)
- `/usr/sbin` (system binaries)

To add custom paths, edit the manager's `ossec.conf` and restart the manager container.

## Active Response

Wazuh can auto-block IPs based on alert rules. This is configured in the manager's `ossec.conf`:

```xml
<active-response>
  <command>host-deny</command>
  <location>local</location>
  <level>10</level>
  <timeout>1800</timeout>
</active-response>
```

## Troubleshooting

### Indexer won't start
- Check certificates exist in `monitoring/wazuh/certs/`
- Check certificate permissions (400 for files, 500 for directory)
- Check indexer logs: `docker logs <wazuh-indexer-container>`

### Dashboard shows "No API connection"
- Verify manager is running: `docker ps | grep wazuh-manager`
- Check manager API: `curl -k https://wazuh-manager:55000/`
- Restart dashboard container

### No alerts in Grafana
- Check exporter is running: `docker ps | grep wazuh-exporter`
- Check exporter metrics: `curl http://monitoring_wazuh-exporter:9101/metrics`
- Verify alerts exist: `docker exec <wazuh-manager> cat /var/ossec/logs/alerts/alerts.log | tail`
