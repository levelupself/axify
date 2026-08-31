# axify

Turning repeatable processes into **axi tools**: compact, agent-friendly CLIs
that return structured output instead of prose.

## What an axi tool is

An axi tool is a command-line program written to be driven by an agent rather
than read by a person. The convention, as the shipped tools follow it:

- **Structured output by default.** Records over paragraphs, with a `--json`
  escape hatch where a caller needs exact types.
- **Self-describing.** Running the bare command prints what it is, what state it
  can see, and what to run next — so a caller never has to guess the surface.
- **Compact.** Output is sized for a context window. Long results are bounded and
  say that they are bounded, with a pointer to the full source.
- **Data, not advice.** A tool reports what is true. Deciding what to do about it
  belongs to the caller.

## The tools that already exist

These ship independently on npm, each versioned on its own:

| Tool | What it reports on |
|---|---|
| `gh-axi` | GitHub — pull requests, issues, repository state |
| `quota-axi` | Local agent-provider quota windows, for routing-aware callers |
| `tasks-axi` | A markdown-backed task backlog |
| `lavish-axi` | Rich HTML artifacts turned into human review surfaces |
| `chrome-devtools-axi` | A Chrome browser session |

## Status

**This repository is a starting point.** The tools above live in their own
packages; nothing has been moved here and no structure has been chosen yet.
Whether axify becomes an umbrella for those packages, a template for writing new
ones, or the written-down convention itself is an open question.

## License

MIT — see [LICENSE](LICENSE).
