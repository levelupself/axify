# axify

Turning repeatable processes into **axi tools**: compact, agent-friendly CLIs
that return structured output instead of prose.

## What an axi tool is

An axi tool is a command-line program designed to be driven by an agent.
The proposed [v0 contract](docs/axi-contract.md) makes these principles concrete:

- **Structured output by default.** Records over paragraphs, with a `--json`
  escape hatch where a caller needs exact types.
- **Self-describing.** Running the bare command prints what it is, what state it
  can see, and what to run next — so a caller never has to guess the surface.
- **Compact.** Output is sized for a context window. Long results are bounded and
  say that they are bounded, with a pointer to the full source.
- **Data, not advice.** A tool reports what is true. Deciding what to do about it
  belongs to the caller.

## Independent references

These names are prior references for the idea, maintained outside this repository.
Their availability, behavior, and conformance to v0 have not been verified here.

| Tool | What it reports on |
|---|---|
| `gh-axi` | GitHub — pull requests, issues, repository state |
| `quota-axi` | Local agent-provider quota windows, for routing-aware callers |
| `tasks-axi` | A markdown-backed task backlog |
| `lavish-axi` | Rich HTML artifacts turned into human review surfaces |
| `chrome-devtools-axi` | A Chrome browser session |

## Purpose and local roadmap

**Axify is a convention plus starter repository.** It documents the convention,
then will demonstrate it with a small offline reference CLI and a standalone
starter. Independent tools remain in their current homes.

1. **W1 — proposed convention v0:** [invocation, wire formats, errors, bounds,
   and six exact examples](docs/axi-contract.md). This checkout is documentation
   only; the commands in that document are future acceptance targets.
2. **W2–W4 — offline reference:** implement discovery and a nonrecursive local
   directory inventory, add validation and bounds, then an offline regression
   suite and copy/paste demo. Provisional entry point:
   `node examples/fs-axi/bin/fs-axi.js`.
3. **W5 — starter:** copy the proven pattern into a standalone local template.
4. **W6 — narrow conformance checks:** check the reference and starter against
   v0 fixtures offline; this will not certify independent packages.

No CLI, package, runtime test suite, or conformance checker ships in W1.

## License

MIT — see [LICENSE](LICENSE).
