#!/bin/bash
# usage: sparql.sh "<query>" [outfile]
Q="$1"
OUT="${2:-/dev/stdout}"
curl -s -G 'https://query.semlab.io/sparql' \
  --data-urlencode "query=$Q" \
  -H 'Accept: application/sparql-results+json' \
  -H 'User-Agent: semlab-data-process (claude-code; thisismattmiller@gmail.com)' \
  -o "$OUT"
