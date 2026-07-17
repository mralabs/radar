#!/usr/bin/env bash
# Fake consuming repo. ponytail: a README + a manifest is all the agent needs
# to propose seed entries from — no real project required.
set -euo pipefail

cat > README.md <<'EOF'
# notemesh

A local-first note-taking app. Markdown files on disk, no cloud, no account.
Built with Tauri + Svelte. We compete with Obsidian and Logseq on the "your
notes are just files" promise, and lean on remark for markdown parsing.
EOF

cat > package.json <<'EOF'
{
  "name": "notemesh",
  "version": "0.3.0",
  "dependencies": { "remark": "^15.0.0", "svelte": "^5.0.0" }
}
EOF

git init -q
git add -A
git -c user.email=eval@example.com -c user.name=eval commit -qm "init"
