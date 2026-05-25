#!/usr/bin/env python3
"""
Wazuh Alert Exporter for Prometheus
Reads Wazuh alerts and exposes aggregated metrics.
"""
import os
import json
import time
import glob
from prometheus_client import start_http_server, Gauge, Counter, Info

ALERTS_TOTAL = Counter("wazuh_alerts_total", "Total Wazuh alerts processed")
ALERTS_BY_LEVEL = Gauge("wazuh_alerts_by_level", "Alerts by severity level", ["level"])
FIM_CHANGES_TOTAL = Counter("wazuh_fim_changes_total", "Total FIM file changes")
SYSCHECK_EVENTS = Gauge("wazuh_syscheck_events", "Syscheck events by type", ["event_type"])
WAZUH_INFO = Info("wazuh_exporter", "Wazuh exporter info")

ALERTS_DIR = os.environ.get("WAZUH_ALERTS_DIR", "/var/ossec/logs/alerts")
SCRAPE_INTERVAL = int(os.environ.get("SCRAPE_INTERVAL", "60"))

def parse_alert_line(line):
    """Parse a single line from alerts.json (each line is a JSON object)."""
    try:
        return json.loads(line)
    except json.JSONDecodeError:
        return None

def process_alerts():
    """Process all alert files and update metrics."""
    alerts_pattern = os.path.join(ALERTS_DIR, "alerts.json*")
    files = glob.glob(alerts_pattern)

    level_counts = {}
    fim_count = 0
    syscheck_counts = {}
    total = 0

    for filepath in files:
        try:
            with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    alert = parse_alert_line(line.strip())
                    if not alert:
                        continue
                    total += 1

                    # Count by rule level
                    rule = alert.get("rule", {})
                    level = str(rule.get("level", "0"))
                    level_counts[level] = level_counts.get(level, 0) + 1

                    # Count FIM events
                    if rule.get("groups", []):
                        groups = rule.get("groups", [])
                        if any("syscheck" in g for g in groups):
                            syscheck_counts["syscheck"] = syscheck_counts.get("syscheck", 0) + 1
                        if any("ossec" in g for g in groups):
                            syscheck_counts["ossec"] = syscheck_counts.get("ossec", 0) + 1

                    # Count FIM changes specifically
                    if "syscheck" in str(alert).lower():
                        fim_count += 1
        except Exception as e:
            print(f"Error reading {filepath}: {e}")

    # Update Prometheus metrics
    ALERTS_TOTAL._value.set(total)

    for level, count in level_counts.items():
        ALERTS_BY_LEVEL.labels(level=level).set(count)

    for event_type, count in syscheck_counts.items():
        SYSCHECK_EVENTS.labels(event_type=event_type).set(count)

    FIM_CHANGES_TOTAL._value.set(fim_count)

    print(f"Processed {total} alerts, {fim_count} FIM changes")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "9101"))
    start_http_server(port)
    WAZUH_INFO.info({"version": "4.8.0", "alerts_dir": ALERTS_DIR})
    print(f"Wazuh Alert Exporter started on port {port}")
    print(f"Reading alerts from: {ALERTS_DIR}")

    while True:
        process_alerts()
        time.sleep(SCRAPE_INTERVAL)
