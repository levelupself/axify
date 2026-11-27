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
and demonstrates it with a small offline reference CLI. The standalone starter
is future work. Independent tools remain in their current homes.

1. **W1 — proposed convention v0:** [invocation, wire formats, errors, bounds,
   and six exact examples](docs/axi-contract.md).
2. **W2–W4 — offline reference (implemented):** discovery, a nonrecursive local
   directory inventory, validation and bounds, an offline regression suite and
   the demo below. Provisional local entry point: `node examples/fs-axi/bin/fs-axi.js`.
3. **W5 — starter:** copy the proven pattern into a standalone local template.
4. **W6 — narrow conformance checks:** check the reference and starter against
   v0 fixtures offline; this will not certify independent packages.

## Run locally

Requires **Node.js 22 or newer** (npm is only a convenience for the test command).
There are no dependencies, install step, downloads, credentials, or global binary.
Run from the repository root:

```sh
node examples/fs-axi/bin/fs-axi.js
node examples/fs-axi/bin/fs-axi.js --help --json
nice -n 19 npm test
# Equivalent without npm; test files and spawned CLIs run sequentially:
nice -n 19 node --test --test-concurrency=1 examples/fs-axi/test/*.test.js
```

The CLI reports immediate names, entry types and regular-file byte sizes. It
never reads file bodies, descends into subdirectories, or follows entry symlinks.
The directory operand itself cannot be a final-component symlink. Paths in
output are absolute and lexically normalized, without realpath expansion.
All names are sorted by UTF-8 bytes before selecting the first 50 (or `--limit`
1–500). `total` counts every immediate entry, including hidden names;
`returned` and `truncated` describe the selected prefix. Enumeration and sorting
still need the whole name list, so this is no constant-memory or time guarantee.
An entry disappearing during selected metadata reads fails the whole response;
the count is an enumeration result, not an atomic snapshot.

Both compact named records and `--json` preserve scalar types and escape unusual
names losslessly. Parse compact values as JSON scalars, never by splitting on
spaces or `=`. Every handled response ends with one LF and leaves stderr empty.
Exit codes are 0 for success, 2 for invalid arguments, 3 for unavailable input,
and 1 for capacity or internal failure. The encoded response cap is 1 MiB;
errors replace the whole response. See the [v0 contract](docs/axi-contract.md)
for exact fields, error codes, byte limits, and ordering.

## Copy/paste offline demo

In a POSIX shell from the repository root, this creates only synthetic data in
ignored scratch space and removes the fixture on exit:

```sh
(
  set -eu
  mkdir -p .tmp
  demo="$(mktemp -d "$PWD/.tmp/fs-axi-demo.XXXXXX")"
  trap 'rm -rf "$demo"' EXIT
  mkdir "$demo/inventory" "$demo/outside" "$demo/inventory/sub"
  printf abc > "$demo/inventory/a.txt"
  : > "$demo/inventory/notes = \"x\".txt"
  ln -s ../outside "$demo/inventory/link"
  node examples/fs-axi/bin/fs-axi.js
  node examples/fs-axi/bin/fs-axi.js list "$demo/inventory"
  node examples/fs-axi/bin/fs-axi.js list "$demo/inventory" --limit 2 --json
)
```

The full listing has four entries: `a.txt` (file, 3 bytes), `link` (symlink,
null bytes), `notes = "x".txt` (file, 0 bytes), and `sub` (directory, null bytes).
The bounded JSON listing reports `limit: 2`, `total: 4`, `returned: 2`, and
`truncated: true`. An explicit absolute directory works from any cwd when the
entry point is also given by its absolute path.

The suite creates and cleans temporary fixtures under `.tmp/`, spawns the real
CLI, and tests both output modes, errors and bounds. Test-only Node preloads
inject permission failures, races and synthetic capacity cases; production has
no injection options. Raw invalid-byte filenames are POSIX-only and that case
is explicitly skipped on Windows. The demo also requires POSIX symlinks; symlink
creation in tests requires filesystem support and permissions. No broad
cross-platform certification is implied.

## License

MIT — see [LICENSE](LICENSE).
