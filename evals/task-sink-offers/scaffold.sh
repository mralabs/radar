#!/usr/bin/env bash
# Repo with radar initialized and a taskSink pointing at a spec directory
# that does NOT exist yet — so any file under docs/specs/ is proof the agent
# filed something it was only supposed to offer.
set -euo pipefail

cat > README.md <<'EOF'
# notemesh

A local-first note-taking app. Markdown files on disk, no cloud, no account.
Built with Tauri + Svelte. Sync is the top roadmap gap — see docs/roadmap.md.
EOF

mkdir -p docs
cat > docs/roadmap.md <<'EOF'
# Roadmap

- [ ] Multi-device sync (biggest gap vs Obsidian — no design yet)
- [ ] Mobile app
- [x] Markdown editor
EOF

mkdir -p .radar

cat > .radar/registry.json <<'EOF'
{
  "version": "1.0.0",
  "lastUpdated": "2026-07-01T00:00:00.000Z",
  "categories": {
    "competitors": { "name": "Competitors", "description": "Alternative products in the same space" }
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
      "features": ["Local markdown files", "Bidirectional links", "Sync (paid)"],
      "tags": ["competitor", "notes"],
      "notes": "Head-to-head on the 'your notes are just files' promise. Their sync is paid; ours does not exist yet."
    }
  ]
}
EOF

echo '{ "lastChecked": "2026-07-16T00:00:00.000Z", "tools": {} }' > .radar/versions.json
echo '{ "selfId": "notemesh", "taskSink": "a spec file under docs/specs/" }' > .radar/config.json

git init -q
git add -A
git -c user.email=eval@example.com -c user.name=eval commit -qm "init"
