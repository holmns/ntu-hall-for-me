#!/bin/bash
# .env is gitignored, so a new git worktree checkout never has one. This copies
# it in from the main worktree the first time a session lands in a worktree
# that doesn't have its own .env yet. Never overwrites an existing .env, so a
# worktree-specific edit is left alone.
main_root=$(git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2; exit}')
cwd_root=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -n "$main_root" ] && [ -n "$cwd_root" ] && [ "$cwd_root" != "$main_root" ] && [ -f "$main_root/.env" ] && [ ! -f "$cwd_root/.env" ]; then
  cp "$main_root/.env" "$cwd_root/.env"
  echo '{"systemMessage":"Copied .env from main repo into this worktree."}'
fi
