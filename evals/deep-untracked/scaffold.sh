#!/usr/bin/env bash
# Fake consuming repo with radar already initialized and ONE tracked tool.
# The eval asks for a deep-dive on a tool that is NOT in the registry.
set -euo pipefail

cat > README.md <<'EOF'
# notemesh

A local-first note-taking app. Markdown files on disk, no cloud, no account.
Built with Tauri + Svelte. We compete with Obsidian on the "your notes are
just files" promise.
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
      "features": ["Local markdown files", "Bidirectional links", "Plugin ecosystem"],
      "tags": ["competitor", "notes"],
      "notes": "Head-to-head on the 'your notes are just files' promise."
    }
  ]
}
EOF

echo '{ "lastChecked": null, "tools": {} }' > .radar/versions.json
echo '{ "selfId": "notemesh", "taskSink": null }' > .radar/config.json

git init -q
git add -A
git -c user.email=eval@example.com -c user.name=eval commit -qm "init"
