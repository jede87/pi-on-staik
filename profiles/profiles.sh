# Pi role profiles — source this from ~/.zshrc.
# Each alias appends a role system prompt on top of the universal global AGENTS.md,
# so persistence/subagents/lookup rules still apply; only the role flavour is added.
alias pi-research='pi --model qwen3.5:35b-a3b-thinking --append-system-prompt ~/.pi/profiles/research.md'
alias pi-data='pi --model qwen3.5:35b-a3b-thinking --append-system-prompt ~/.pi/profiles/data.md'
alias pi-spec='pi --model qwen3.5:35b-a3b-thinking --append-system-prompt ~/.pi/profiles/spec.md'
alias pi-analyze='pi --model qwen3.5:35b-a3b-thinking --append-system-prompt ~/.pi/profiles/analyze.md'
