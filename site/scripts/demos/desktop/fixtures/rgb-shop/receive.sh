#!/bin/sh
# Receiving side of the demo: a second RGB Lightning Node on the same test network.
set -eu
if [ "${1:-}" = refresh ]; then
  exec kaleido --node-url "$RECEIVER_NODE_URL" asset refresh
fi
kaleido --json --node-url "$RECEIVER_NODE_URL" asset invoice "$RGB_ASSET_ID" --amount "$1" | tee invoice.json
