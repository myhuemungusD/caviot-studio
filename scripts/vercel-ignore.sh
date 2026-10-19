#!/bin/bash
# Vercel "Ignored Build Step": exit 0 = skip this deployment, exit 1 = build it.
# Deploy only when the published site (dist/ or vercel.json) changed, never for bot branches, and previews only for PRs.
set -u
ref="${VERCEL_GIT_COMMIT_REF:-}"
author="${VERCEL_GIT_COMMIT_AUTHOR_LOGIN:-}"
case "$ref" in dependabot/*|renovate/*|release-please--*) echo "Skip: bot branch $ref"; exit 0;; esac
case "$author" in *'[bot]') echo "Skip: bot author $author"; exit 0;; esac
if [ "${VERCEL_ENV:-}" = "preview" ] && [ -z "${VERCEL_GIT_PULL_REQUEST_ID:-}" ]; then
  echo "Skip: preview for a branch without an open pull request"; exit 0
fi
paths=(dist vercel.json .vercelignore)
base="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -n "$base" ] && ! git cat-file -e "$base^{commit}" 2>/dev/null; then
  git fetch --quiet --depth=100 origin "$ref" 2>/dev/null || true
  git cat-file -e "$base^{commit}" 2>/dev/null || base=""
fi
[ -z "$base" ] && base="HEAD^"
if ! git rev-parse --quiet --verify "$base" >/dev/null; then echo "Build: no base commit to compare with"; exit 1; fi
if git diff --quiet "$base" HEAD -- "${paths[@]}"; then echo "Skip: no changes in ${paths[*]} since $base"; exit 0; fi
echo "Build: site files changed since $base"; exit 1
