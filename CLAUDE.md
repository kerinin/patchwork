# Claude Code Notes

## Shell Environment

This environment uses zsh with aliases that prompt for confirmation on destructive commands:
- `rm` prompts "remove file?"
- `cp` prompts "overwrite file?"
- `mv` may also prompt

**Use `command rm`, `command cp`, `command mv` to bypass these aliases.**

## Worktrees

Worktrees are stored in `.worktrees/` (git-ignored).
