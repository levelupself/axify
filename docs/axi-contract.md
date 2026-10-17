# Axi contract v0 (proposed)

This is an authoring contract for axify's future reference and starter, not a
description of existing external packages. W1 ships documentation only. The
provisional `fs-axi` name denotes a local example, not a reserved package name.
The version identifier is the integer `0`; incompatible changes require a new
version. No cross-version negotiation or compatibility guarantee is proposed.

## Invocation and discovery

Future direct entry point: `node examples/fs-axi/bin/fs-axi.js`. Below, `fs-axi`
is shorthand for that invocation, not a globally installed command.

```text
fs-axi [--json] [--help]
fs-axi list <directory> [--limit N] [--json]
fs-axi list --help [--json]
```

Bare invocation, root `--help`, and `list --help` return the same discovery
response (example 1), exit 0, and perform no filesystem access. It states the
purpose, visible scope, complete invocation forms, and limit defaults. The
listed forms are the next callable surface, not recommendations.

Arguments are tokens supplied by the caller's process API or shell; shell
quoting is not part of this protocol. `--json` and `--help` may occur anywhere
before `--`. `--limit` is list-only and consumes the next token. Options may be
interspersed with operands. `--` ends option parsing, permitting a directory
whose name starts with `-`. A directory named `list` at root still requires
the `list` command. No short options, `--key=value`, option abbreviations,
implicit current directory, recursion, or additional commands exist in v0.

Validate the whole invocation before discovery or I/O: reject unknown commands
or options, repeated options, extra or missing operands, missing option values,
and invalid limits. `--help` does not bypass validation; for `list --help` the
directory is optional, but at most one is allowed. `--limit` must match
`[1-9][0-9]*` and numerically lie in 1–500 (no sign, leading zero, whitespace,
fraction, or exponent). The default is 50. A `--json` token parsed as an option
selects JSON even if another token is invalid; after `--` it is an operand.
For a missing `--limit` value followed by a recognized flag, report usage
failure and still honor `--json`. For multiple errors report the first in
left-to-right token order, then missing required operands. Do not perform I/O
for an invalid invocation.

## Streams and encoding

Every completed response uses UTF-8 without BOM, ANSI, progress, or timestamps,
with exactly one final LF. Stdout contains one complete response. Stderr is
empty for every handled success and failure, including usage errors. Buffer
the response before writing; a failing read must not leave success records on
stdout. Process termination or a broken output pipe may prevent a complete
response and is outside the wire guarantee; exit 1 if controllable.

Default compact encoding is **named records with JSON values**:

```text
record key=value key=value
```

Record and key identifiers match `[a-z][a-z0-9_]*`. A single ASCII space separates
the record name and each field; no indentation, blank lines, duplicate keys,
or trailing spaces. A value is one JSON scalar: string, integer, boolean, or
null. Parse a key and `=`, then consume the entire JSON value before looking
for the next separating space; splitting a line on spaces or `=` is incorrect.
Field order and record order are specified below. No CSV or table delimiter
interpretation is involved.

Strings are always double quoted, even when they contain no whitespace. Escape
`"` as `\"`, backslash as `\\`, and backspace/form feed/LF/CR/tab as
`\b`, `\f`, `\n`, `\r`, `\t`. Other U+0000–U+001F characters use lowercase
`\u00xx`. Emit other Unicode scalar values literally, without normalization
or escaping `/`. Thus spaces, `=`, commas, pipes, and colons stay inside the
quoted string. Unpaired surrogates and names not decodable as UTF-8 are input
errors, not replacement characters. Integers use plain decimal, never exponent
notation; booleans and null use JSON spelling.

`--json` emits a single minified JSON object and LF, using the same scalar
encoding. Keys appear in the documented order for exact reference bytes.
Consumers should access JSON keys by name. No fields are optional or omitted;
null means explicitly inapplicable, never zero or an empty string.

## Envelope and payloads

All JSON responses have these keys, in order:

| Field | Type and meaning |
|---|---|
| `v` | Integer 0, the contract version. |
| `tool` | String `fs-axi` for this reference. |
| `command` | `discover`, `list`, or `invalid` if no recognized command can be selected. Root help/bare invocation uses `discover`; list help also uses `discover`. A valid `list` command with bad arguments uses `list`. |
| `ok` | Boolean; true exactly when exit status is 0. |
| `data` | Discovery object or listing object on success; null on failure. |
| `error` | Null on success; the error object below on failure. |

The first compact record is always `axi v=… tool=… command=… ok=…`.
There is no compact `data` or null `error` field: the following records select
the payload. A failure has exactly one `error` record after `axi`.

Discovery `data` keys and corresponding compact records:

| JSON key | Definition | Compact record |
|---|---|---|
| `purpose` | Fixed string `Nonrecursive directory inventory`. | `discovery purpose=… scope=…` |
| `scope` | Fixed string `Immediate entries of an explicit local directory`. No claim of access to the current directory. | Same `discovery` record. |
| `usage` | Three strings, exactly the invocation forms above, in that order. | One `usage syntax=…` per string. |
| `limits` | Object with integer `default` 50 and `max` 500, in that order. | `limits default=50 max=500` |

Listing `data` has `source`, `limit`, `total`, `returned`, `truncated`, `entries`
in that order. Compact output has a `listing` record with the first five fields,
then one `entry` record per element of `entries`, in array order.

| Field | Type, bound, and meaning |
|---|---|
| `source` | Nonempty absolute directory path, lexically normalized against invocation cwd (as Node `path.resolve` would do); no realpath expansion. At most 4,096 UTF-8 bytes. It points to the full input for another explicit invocation; it is not an output file or a stable snapshot. |
| `limit` | Integer 1–500; requested cap, default 50. |
| `total` | Integer 0–9,007,199,254,740,991; count of all immediate names from the successful enumeration, including hidden names, excluding `.` and `..`. |
| `returned` | Integer `min(total, limit)`, equal to `entries.length`. |
| `truncated` | Boolean `returned < total`. False for an empty directory. |
| `entries` | Array of at most 500 entry objects. No placeholder or omitted-row record. |
| `entry.name` | Nonempty immediate basename, at most 4,096 UTF-8 bytes, preserved losslessly. No path prefix. |
| `entry.type` | One of `file`, `directory`, `symlink`, `other`, from metadata without following the entry's symlink. |
| `entry.bytes` | Integer 0–9,007,199,254,740,991 for regular-file byte length; null for every other type. No content read. |

Each entry object's key order is `name`, `type`, `bytes`. Sort all names by
unsigned UTF-8 byte order before taking the first `limit`; no locale sorting,
case folding, or directory-first grouping. Validate name encoding for all
enumerated names, and obtain metadata only for selected entries. Never descend
into subdirectories or follow entry symlinks, including links outside the input.
The directory operand itself must be a directory, not a final-component symlink;
symlinks in ancestor components may be resolved by the OS. This is an inventory,
not a sandbox against concurrent filesystem changes.

If the directory or any selected entry disappears or becomes unreadable during
enumeration/metadata collection, fail the whole invocation with `E_READ`, exit 3.
An unselected entry is not inspected after enumeration. Counts describe the
enumerated names, not an atomic filesystem snapshot. Changes between runs may
change outputs; a fixed input produces deterministic bytes.

## Errors, exits, and capacity

An error object/compact record has exactly `code`, `message`, `target`, in that
order. `code` is a string from this table; `message` is its fixed string, not an
OS exception or stack trace. `target` is null or a string of at most 4,096 UTF-8
bytes, as specified below. It contains facts identifying the failing input,
never advice or an unbounded reflection of command arguments.

| Exit | Code | Exact message | Target |
|---|---|---|---|
| 0 | — | Success, including discovery, empty, and bounded results. | — |
| 2 | `E_USAGE` | `Invalid arguments` | `--limit` for a limit error; null for every other validation error. |
| 3 | `E_NOT_FOUND` | `Directory not found` | Resolved source; initial directory lookup only. |
| 3 | `E_NOT_DIRECTORY` | `Input is not a directory` | Resolved source; initial nondirectory or final symlink. |
| 3 | `E_READ` | `Directory inventory unavailable` | Resolved source; all other filesystem read errors, including initial permission denial. |
| 3 | `E_ENCODING` | `Input is not valid Unicode` | Null; invalid Unicode input path or any enumerated name. |
| 1 | `E_CAPACITY` | `Response capacity exceeded` | Null. |
| 1 | `E_INTERNAL` | `Internal failure` | Null; unexpected handled failures. |

Exit 1 is a tool/capacity failure, 2 is caller usage, 3 is unavailable input;
these mappings are stable throughout v0. No error object carries partial data,
errno, retry instructions, raw argument arrays, or stack traces.

Validate path encoding first; empty directory tokens and input or resolved
paths exceeding 4,096 UTF-8 bytes are `E_USAGE` with null target. A name exceeding
4,096 bytes, a total or byte size outside the integer range, or an encoded
response exceeding **1,048,576 bytes including final LF** is `E_CAPACITY`.
On capacity failure replace the entire response with its small error response
in the selected mode; never clip a string or emit invalid JSON. This applies
to compact and JSON separately. The finite field schemas, entry cap and byte
ceiling bound all output; there are no extension fields in v0. Discovery uses
only the fixed strings and arrays given above. Error strings are fixed too.

The record cap is not a constant-memory or execution-time promise for arbitrarily
large directories: enumeration and sorting may need the whole name list.
There is no pagination token; use the explicit source for a fresh inventory.
Increasing `--limit` only reaches 500 and may still hit the byte ceiling.

## Six exact acceptance examples

These are synthetic future acceptance targets, not captured executions. Each
stdout block includes exactly one LF after its last line. Stderr is **empty**
in every example, in both modes. Commands are shown separately from stdout.
Fixtures use a synthetic POSIX cwd `/fixture`; paths below are not real user
data. `/fixture/demo` contains `a.txt` (3 bytes), `notes = "x".txt` (0 bytes),
and `sub` (directory); `/fixture/empty` has no entries. For example 4, the
filesystem adapter deterministically denies directory enumeration of
`/fixture/locked`; do not rely on chmod-only tests under privileged accounts.

### 1. Discovery — exit 0

Command: `fs-axi` (also either help form).

```text
axi v=0 tool="fs-axi" command="discover" ok=true
discovery purpose="Nonrecursive directory inventory" scope="Immediate entries of an explicit local directory"
usage syntax="fs-axi [--json] [--help]"
usage syntax="fs-axi list <directory> [--limit N] [--json]"
usage syntax="fs-axi list --help [--json]"
limits default=50 max=500
```

Command: `fs-axi --json` (also either help form with `--json`).

```json
{"v":0,"tool":"fs-axi","command":"discover","ok":true,"data":{"purpose":"Nonrecursive directory inventory","scope":"Immediate entries of an explicit local directory","usage":["fs-axi [--json] [--help]","fs-axi list <directory> [--limit N] [--json]","fs-axi list --help [--json]"],"limits":{"default":50,"max":500}},"error":null}
```

### 2. Success, including quotes and delimiters — exit 0

Command: `fs-axi list demo`.

```text
axi v=0 tool="fs-axi" command="list" ok=true
listing source="/fixture/demo" limit=50 total=3 returned=3 truncated=false
entry name="a.txt" type="file" bytes=3
entry name="notes = \"x\".txt" type="file" bytes=0
entry name="sub" type="directory" bytes=null
```

Command: `fs-axi list demo --json`.

```json
{"v":0,"tool":"fs-axi","command":"list","ok":true,"data":{"source":"/fixture/demo","limit":50,"total":3,"returned":3,"truncated":false,"entries":[{"name":"a.txt","type":"file","bytes":3},{"name":"notes = \"x\".txt","type":"file","bytes":0},{"name":"sub","type":"directory","bytes":null}]},"error":null}
```

### 3. Invalid arguments — exit 2

Command: `fs-axi list demo --limit 0`.

```text
axi v=0 tool="fs-axi" command="list" ok=false
error code="E_USAGE" message="Invalid arguments" target="--limit"
```

Command: `fs-axi list demo --limit 0 --json`.

```json
{"v":0,"tool":"fs-axi","command":"list","ok":false,"data":null,"error":{"code":"E_USAGE","message":"Invalid arguments","target":"--limit"}}
```

### 4. Inaccessible input — exit 3

Command: `fs-axi list locked`.

```text
axi v=0 tool="fs-axi" command="list" ok=false
error code="E_READ" message="Directory inventory unavailable" target="/fixture/locked"
```

Command: `fs-axi list locked --json`.

```json
{"v":0,"tool":"fs-axi","command":"list","ok":false,"data":null,"error":{"code":"E_READ","message":"Directory inventory unavailable","target":"/fixture/locked"}}
```

### 5. Empty results — exit 0

Command: `fs-axi list empty`.

```text
axi v=0 tool="fs-axi" command="list" ok=true
listing source="/fixture/empty" limit=50 total=0 returned=0 truncated=false
```

Command: `fs-axi list empty --json`.

```json
{"v":0,"tool":"fs-axi","command":"list","ok":true,"data":{"source":"/fixture/empty","limit":50,"total":0,"returned":0,"truncated":false,"entries":[]},"error":null}
```

### 6. Bounded results — exit 0

Command: `fs-axi list demo --limit 1`.

```text
axi v=0 tool="fs-axi" command="list" ok=true
listing source="/fixture/demo" limit=1 total=3 returned=1 truncated=true
entry name="a.txt" type="file" bytes=3
```

Command: `fs-axi list demo --limit 1 --json`.

```json
{"v":0,"tool":"fs-axi","command":"list","ok":true,"data":{"source":"/fixture/demo","limit":1,"total":3,"returned":1,"truncated":true,"entries":[{"name":"a.txt","type":"file","bytes":3}]},"error":null}
```

Additional scalar round-trip vector (the decoded name contains one literal LF,
one tab, one backslash, then Unicode):

```text
entry name="line\nnext\t\\雪,|=:" type="file" bytes=0
```

## Review against the README principles

| Principle | Review of examples 1–6 |
|---|---|
| Structured by default; exact JSON types | Every example has named compact fields and an equivalent typed JSON envelope. Quoted strings distinguish null from `"null"`; booleans and byte sizes remain typed. Example 2 and the scalar vector exercise escaping. |
| Self-describing | Example 1 supplies purpose, scope, every invocation form and limits without needing accessible input. Errors use stable codes; help is available without a successful listing. |
| Compact and explicitly bounded | Examples 2, 5, 6 expose source, limit, total, returned and truncated, including zero and truncation. At most 500 entries and 1 MiB per response; failures replace rather than clip data. |
| Data, not advice | Discovery lists callable syntax, and all six examples report facts or stable failure classifications. No recommended action, routing decision, or interpretation of file contents is emitted. |

W2–W4 must turn these targets into an offline CLI and behavioral tests. W1 has
no executable behavior to test; checking these serialized examples validates
the document's consistency, not an implementation or an external package.
