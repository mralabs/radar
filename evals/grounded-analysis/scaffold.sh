#!/usr/bin/env bash
# Fake consuming repo with radar initialized, one tracked competitor with a
# pending update, and a roadmap the analysis SHOULD be grounded in. The eval
# pastes the CLI output and grades whether 🔥/💡 claims cite THIS repo.
set -euo pipefail

cat > README.md <<'EOF'
# notemesh

A local-first note-taking app. Markdown files on disk, no cloud, no account.
Built with Tauri + Svelte. We compete with Obsidian on the "your notes are
just files" promise.
EOF

mkdir -p docs

cat > docs/ROADMAP.md <<'EOF'
# Roadmap

## Q3 2026 — committed

- **Device sync**: encrypted, peer-to-peer, no server. Our most requested
  feature by far; design doc in progress. We will NOT ship an
  account-based cloud relay — local-first is the product.

## Exploring (no commitment)

- Table/database views over note frontmatter properties. Users keep asking
  for "Notion databases but files". Undecided whether this fits.

## Not planned this year

- Mobile apps. Desktop focus until sync ships.
EOF

mkdir -p .radar

cat > .radar/registry.json <<'EOF'
{
  "version": "1.0.0",
  "lastUpdated": "2026-07-01T00:00:00.000Z",
  "categories": {
    "official": { "name": "Official / Upstream", "description": "Tools this project builds on" },
    "competitors": { "name": "Competitors", "description": "Alternative products in the same space" },
    "deps": { "name": "Key Dependencies", "description": "Libraries whose breaking changes affect this project" },
    "inspiration": { "name": "Inspiration", "description": "Sources of ideas" }
  },
  "tools": [
    {
      "id": "obsidianmd-obsidian-releases",
      "name": "Obsidian",
      "category": "competitors",
      "type": "github",
      "source": "obsidianmd/obsidian-releases",
      "url": "https://github.com/obsidianmd/obsidian-releases",
      "description": "Local-first markdown notes as plain files on disk.",
      "status": "active",
      "features": ["Local markdown files", "Bidirectional links", "Plugin ecosystem", "Paid sync service"],
      "tags": ["competitor", "notes"],
      "notes": "Head-to-head on the 'your notes are just files' promise."
    }
  ]
}
EOF

cat > .radar/versions.json <<'EOF'
{
  "lastChecked": "2026-07-15T07:00:00.000Z",
  "tools": {
    "obsidianmd-obsidian-releases": {
      "currentVersion": "1.9.0",
      "lastAnalyzedVersion": "1.8.10",
      "latestReleaseDate": "2026-07-10T00:00:00.000Z",
      "lastChecked": "2026-07-15T07:00:00.000Z"
    }
  }
}
EOF

echo '{ "taskSink": null }' > .radar/config.json

git init -q
git add -A
git -c user.email=eval@example.com -c user.name=eval commit -qm "init"
