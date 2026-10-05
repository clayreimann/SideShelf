#!/usr/bin/env bash
# Runs all Maestro regression flows in sequence.
# Credentials are sourced from .env.maestro (see .env.maestro.example).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env.maestro"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "ERROR: ${ENV_FILE} not found."
  echo "Copy .env.maestro.example to .env.maestro and fill in your credentials."
  exit 1
fi

# Source credentials
set -a
# shellcheck source=/dev/null
. "${ENV_FILE}"
set +a

ENV_FLAGS=(
  --env "MAESTRO_USERNAME=${MAESTRO_USERNAME}"
  --env "MAESTRO_PASSWORD=${MAESTRO_PASSWORD}"
  --env "MAESTRO_SERVER_URL=${MAESTRO_SERVER_URL}"
)

FLOWS=(
  library-navigation
  playback
  download
)

for flow in "${FLOWS[@]}"; do
  echo ">> Running ${flow}.yaml..."
  maestro test "${ENV_FLAGS[@]}" "${REPO_ROOT}/.maestro/${flow}.yaml"
  echo ">> ${flow}.yaml passed."
done

echo "All Maestro regression flows passed."
