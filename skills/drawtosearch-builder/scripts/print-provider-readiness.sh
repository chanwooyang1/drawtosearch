#!/usr/bin/env bash

set -euo pipefail

echo "DrawToSearch provider readiness"
echo "  NAVER_CLIENT_ID: ${NAVER_CLIENT_ID:+set}"
echo "  NAVER_CLIENT_SECRET: ${NAVER_CLIENT_SECRET:+set}"
echo "  HUGGINGFACE_API_KEY: ${HUGGINGFACE_API_KEY:+set}"
echo "  GOOGLE_CUSTOM_SEARCH_API_KEY: ${GOOGLE_CUSTOM_SEARCH_API_KEY:+set}"
echo "  GOOGLE_CUSTOM_SEARCH_CX: ${GOOGLE_CUSTOM_SEARCH_CX:+set}"
echo "  DATABASE_URL: ${DATABASE_URL:+set}"
