#!/bin/bash
set -e

echo "🚀 Lade Adapter hoch..."

cd /opt/iobroker
iobroker upload poolcontrol

echo "🔄 Starte Adapter neu..."
iobroker restart poolcontrol

echo "✅ Fertig!"
