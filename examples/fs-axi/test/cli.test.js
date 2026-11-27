const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.resolve(__dirname, '../bin/fs-axi.js');
function run(args = [], options = {}) {
  const { nodeArgs = [], ...spawnOptions } = options;
  const result = spawnSync(process.execPath, [...nodeArgs, cli, ...args], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024, ...spawnOptions,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.endsWith('\n'));
  assert.ok(!result.stdout.endsWith('\n\n'));
  return result;
}
function fixture(t) {
  const scratch = path.resolve(__dirname, '../../../.tmp');
  fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'fs-axi-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('discovery is exact, with identical help forms', () => {
  const expected = 'axi v=0 tool="fs-axi" command="discover" ok=true\n'
    + 'discovery purpose="Nonrecursive directory inventory" scope="Immediate entries of an explicit local directory"\n'
    + 'usage syntax="fs-axi [--json] [--help]"\n'
    + 'usage syntax="fs-axi list <directory> [--limit N] [--json]"\n'
    + 'usage syntax="fs-axi list --help [--json]"\nlimits default=50 max=500\n';
  for (const args of [[], ['--help'], ['list', '--help']]) {
    const result = run(args);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, expected);
  }
  const json = run(['--json']);
  assert.equal(json.status, 0);
  assert.deepEqual(JSON.parse(json.stdout), {
    v: 0, tool: 'fs-axi', command: 'discover', ok: true,
    data: {
      purpose: 'Nonrecursive directory inventory',
      scope: 'Immediate entries of an explicit local directory',
      usage: ['fs-axi [--json] [--help]', 'fs-axi list <directory> [--limit N] [--json]', 'fs-axi list --help [--json]'],
      limits: { default: 50, max: 500 },
    }, error: null,
  });
});

test('mixed inventory uses explicit paths from another cwd and never follows entry symlinks', (t) => {
  const root = fixture(t);
  const source = path.join(root, 'demo');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'a.txt'), 'abc');
  fs.mkdirSync(path.join(source, 'sub'));
  fs.writeFileSync(path.join(source, 'sub', 'hidden'), 'not counted');
  fs.symlinkSync(root, path.join(source, 'link'), 'dir');
  const result = run(['list', 'demo', '--json'], { cwd: root });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    v: 0, tool: 'fs-axi', command: 'list', ok: true,
    data: { source, limit: 50, total: 3, returned: 3, truncated: false, entries: [
      { name: 'a.txt', type: 'file', bytes: 3 },
      { name: 'link', type: 'symlink', bytes: null },
      { name: 'sub', type: 'directory', bytes: null },
    ] }, error: null,
  });
  assert.equal(run(['list', source]).stdout,
    'axi v=0 tool="fs-axi" command="list" ok=true\n'
    + `listing source=${JSON.stringify(source)} limit=50 total=3 returned=3 truncated=false\n`
    + 'entry name="a.txt" type="file" bytes=3\nentry name="link" type="symlink" bytes=null\nentry name="sub" type="directory" bytes=null\n');
});

test('empty inventory has typed zero counts', (t) => {
  const source = fixture(t);
  const result = run(['list', source, '--json']);
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).data, {
    source, limit: 50, total: 0, returned: 0, truncated: false, entries: [],
  });
});

test('bounds count every immediate name but return only the sorted prefix', (t) => {
  const source = fixture(t);
  for (let i = 504; i >= 0; i--) fs.writeFileSync(path.join(source, `item-${String(i).padStart(3, '0')}`), '');
  for (const limit of [undefined, 1, 500]) {
    const result = run(['list', source, ...(limit ? ['--limit', String(limit)] : []), '--json']);
    assert.equal(result.status, 0);
    const data = JSON.parse(result.stdout).data;
    assert.equal(data.limit, limit ?? 50);
    assert.equal(data.total, 505);
    assert.equal(data.returned, limit ?? 50);
    assert.equal(data.truncated, true);
    assert.equal(data.entries.length, limit ?? 50);
    assert.equal(data.entries[0].name, 'item-000');
    assert.equal(data.entries.at(-1).name, `item-${String((limit ?? 50) - 1).padStart(3, '0')}`);
  }
});

// Parse the public compact grammar without splitting strings on spaces or '='.
function compact(stdout) {
  return stdout.trimEnd().split('\n').map((line) => {
    const name = /^[a-z][a-z0-9_]*/.exec(line)[0];
    let rest = line.slice(name.length);
    const fields = {};
    while (rest) {
      const match = /^ ([a-z][a-z0-9_]*)=("(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-f]{4}))*"|null|true|false|-?(?:0|[1-9][0-9]*))/.exec(rest);
      assert.ok(match, `Invalid compact field: ${rest}`);
      assert.ok(!Object.hasOwn(fields, match[1]));
      fields[match[1]] = JSON.parse(match[2]);
      rest = rest.slice(match[0].length);
    }
    return { name, fields };
  });
}

test('filenames round-trip in both modes and sort by UTF-8 bytes', (t) => {
  const source = fixture(t);
  const names = ['.hidden', 'a', 'Z', 'é', '雪', '😀', 'line\nnext\t\\雪,|=:', 'notes = "x".txt', '\b\f\r\u0001'];
  for (const name of names) fs.writeFileSync(path.join(source, name), '雪');
  const json = run(['list', source, '--json']);
  const data = JSON.parse(json.stdout).data;
  const expected = names.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
    .map((name) => ({ name, type: 'file', bytes: 3 }));
  assert.deepEqual(data.entries, expected);
  const text = run(['list', source]);
  assert.deepEqual(compact(text.stdout).slice(2).map((row) => row.fields), expected);
  assert.deepEqual(compact(text.stdout)[1].fields, {
    source, limit: 50, total: names.length, returned: names.length, truncated: false,
  });
  assert.equal(text.stdout, run(['list', source]).stdout);
  assert.equal(json.stdout, run(['list', source, '--json']).stdout);
});

function expectError(args, code, status, target, command = 'list', options) {
  const result = run(args, options);
  assert.equal(result.status, status);
  const messages = {
    E_USAGE: 'Invalid arguments', E_NOT_FOUND: 'Directory not found',
    E_NOT_DIRECTORY: 'Input is not a directory', E_READ: 'Directory inventory unavailable',
    E_ENCODING: 'Input is not valid Unicode', E_CAPACITY: 'Response capacity exceeded',
    E_INTERNAL: 'Internal failure',
  };
  const error = { code, message: messages[code], target };
  if (result.stdout.startsWith('{')) assert.deepEqual(JSON.parse(result.stdout), {
    v: 0, tool: 'fs-axi', command, ok: false, data: null, error,
  });
  else assert.deepEqual(compact(result.stdout), [
    { name: 'axi', fields: { v: 0, tool: 'fs-axi', command, ok: false } },
    { name: 'error', fields: error },
  ]);
}

test('invalid limits and malformed invocations have bounded usage errors in both modes', () => {
  for (const json of [[], ['--json']]) {
    for (const value of ['0', '501', '-1', '01', ' 1', '1.5', '1e2', '', '9'.repeat(1000)]) {
      expectError(['list', 'missing', '--limit', value, ...json], 'E_USAGE', 2, '--limit');
    }
    for (const args of [['list'], ['list', 'a', 'b'], ['list', '--wat'], ['list', 'a', '--help', 'b']]) {
      expectError([...args, ...json], 'E_USAGE', 2, null);
    }
    expectError(['list', '--limit', ...json], 'E_USAGE', 2, '--limit');
    expectError(['list', 'x', '--limit', '1', '--limit', '2', ...json], 'E_USAGE', 2, '--limit');
    expectError(['unknown', ...json], 'E_USAGE', 2, null, 'invalid');
    expectError(['--wat', ...json], 'E_USAGE', 2, null, 'invalid');
    expectError(['--limit', '1', ...json], 'E_USAGE', 2, '--limit', 'discover');
  }
  expectError(['list', 'x', '--json', '--json'], 'E_USAGE', 2, null);
  expectError(['list', 'x', '--help', '--help'], 'E_USAGE', 2, null);
  expectError(['list', 'x', '--wat', '--limit', '0', '--json'], 'E_USAGE', 2, null);
  expectError(['list', 'x', '--limit', '0', '--wat', '--json'], 'E_USAGE', 2, '--limit');
  expectError(['list', 'x', '--limit', '--help', '--json'], 'E_USAGE', 2, '--limit');
});

function fault(root, mode) {
  return {
    nodeArgs: ['--require', path.join(__dirname, 'faults.cjs')],
    env: { ...process.env, FS_AXI_TEST_ROOT: root, FS_AXI_TEST_FAULT: mode },
  };
}

test('directory validation errors compete with limit errors in token order', (t) => {
  const root = fixture(t);
  const cases = [
    { directory: '', code: 'E_USAGE', status: 2 },
    { directory: 'x'.repeat(4097), code: 'E_USAGE', status: 2 },
    // The token fits the byte limit, but resolving against cwd exceeds it.
    { directory: 'x'.repeat(4096), code: 'E_USAGE', status: 2 },
    { directory: root, code: 'E_ENCODING', status: 3, mode: 'surrogate-input' },
    { directory: root, code: 'E_ENCODING', status: 3, mode: 'surrogate-source' },
  ];
  for (const { directory, code, status, mode } of cases) {
    const options = { cwd: root, ...(mode ? fault(root, mode) : fault(root, 'no-io')) };
    for (const json of [[], ['--json']]) {
      for (const help of [[], ['--help']]) {
        expectError(['list', directory, '--limit', '0', ...help, ...json], code, status, null, 'list', options);
        expectError(['list', '--limit', '0', directory, ...help, ...json], 'E_USAGE', 2, '--limit', 'list', options);
      }
    }
  }
});

test('discovery and invalid invocations never access the filesystem', (t) => {
  const root = fixture(t);
  const options = fault(root, 'no-io');
  for (const args of [[], ['--help'], ['list', '--help'], ['list', root, '--help', '--json']]) {
    assert.equal(run(args, options).status, 0);
  }
  expectError(['list', root, '--limit', '0', '--json'], 'E_USAGE', 2, '--limit', 'list', options);
});

test('controlled read failures replace the entire result with E_READ', (t) => {
  const source = fixture(t);
  fs.writeFileSync(path.join(source, 'a'), '');
  fs.writeFileSync(path.join(source, 'b'), '');
  for (const json of [[], ['--json']]) {
    for (const mode of ['initial-denied', 'enumeration-denied', 'enumeration-gone', 'selected-gone', 'selected-denied']) {
      expectError(['list', source, ...json], 'E_READ', 3, source, 'list', fault(source, mode));
    }
    assert.equal(run(['list', source, '--limit', '1', ...json], fault(source, 'selected-gone')).status, 0);
  }
});

test('all enumerated names must be valid UTF-8 even outside the selected prefix', (t) => {
  const source = fixture(t);
  fs.writeFileSync(path.join(source, 'a'), '');
  // Raw POSIX names cannot be represented by a JS string. Windows lacks this interface.
  if (process.platform === 'win32') { t.skip('raw POSIX filename bytes'); return; }
  fs.writeFileSync(Buffer.concat([Buffer.from(source + path.sep), Buffer.from([0xff])]), '');
  for (const json of [[], ['--json']]) expectError(['list', source, '--limit', '1', ...json], 'E_ENCODING', 3, null);
});

test('BOM and replacement-character names are valid scalars and preserved', (t) => {
  const source = fixture(t);
  const names = ['\ufeffname', '\ufffdname'];
  for (const name of names) fs.writeFileSync(path.join(source, name), '');
  const data = JSON.parse(run(['list', source, '--json']).stdout).data;
  assert.deepEqual(data.entries.map((entry) => entry.name), names.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
});

test('unpaired surrogate input is E_ENCODING before filesystem access', (t) => {
  const source = fixture(t);
  expectError(['list', source, '--json'], 'E_ENCODING', 3, null, 'list', fault(source, 'surrogate-input'));
});

test('capacity failures cover name size, byte size, and encoded output in both modes', (t) => {
  const source = fixture(t);
  for (const json of [[], ['--json']]) {
    for (const mode of ['long-name', 'unsafe-total', 'unsafe-size', 'negative-size', 'response-size']) {
      expectError(['list', source, '--limit', '500', ...json], 'E_CAPACITY', 1, null, 'list', fault(source, mode));
    }
  }
});

test('file sizes remain exact up to the safe integer ceiling and other types have null bytes', (t) => {
  const source = fixture(t);
  const result = run(['list', source, '--json'], fault(source, 'types'));
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout).data.entries, [
    { name: 'a', type: 'file', bytes: Number.MAX_SAFE_INTEGER },
    { name: 'b', type: 'other', bytes: null },
  ]);
});

test('a final symlink is rejected while ancestor symlinks retain the lexical source', (t) => {
  const root = fixture(t);
  fs.mkdirSync(path.join(root, 'real'));
  fs.mkdirSync(path.join(root, 'real', 'child'));
  fs.symlinkSync(path.join(root, 'real'), path.join(root, 'alias'), 'dir');
  const source = path.join(root, 'alias', 'child');
  const result = run(['list', source, '--json']);
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).data.source, source);
  expectError(['list', path.join(root, 'alias') + path.sep, '--json'], 'E_NOT_DIRECTORY', 3, path.join(root, 'alias'));
});

test('repeated limits report the first offending token and JSON survives a missing limit value', () => {
  expectError(['--limit', '--json', 'list', 'x'], 'E_USAGE', 2, '--limit');
  expectError(['list', 'x', '--json', '--limit=1'], 'E_USAGE', 2, null);
  expectError(['list', 'x', '--limit', '1', '--limit', '--json'], 'E_USAGE', 2, '--limit');
  expectError(['list', '--help', 'x', 'extra', '--limit', '0', '--json'], 'E_USAGE', 2, null);
  expectError(['list', '--help', '', '--json'], 'E_USAGE', 2, null);
});

test('interspersed options and -- preserve explicit directory operands', (t) => {
  const root = fixture(t);
  for (const name of ['--json', '-dash', 'list']) fs.mkdirSync(path.join(root, name));
  for (const args of [
    ['--json', 'list', '--limit', '1', '--', '-dash'],
    ['list', '--json', '--', '--json'], ['--json', 'list', 'list'],
  ]) {
    const result = run(args, { cwd: root });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).data.source, path.resolve(root, args.at(-1)));
  }
  assert.equal(run(['list', '--', '--json'], { cwd: root }).stdout.startsWith('axi '), true);
  assert.equal(run(['--help', 'list', '--json']).status, 0);
});

test('missing, nondirectory, symlink, empty and overlong inputs fail without partial data', (t) => {
  const root = fixture(t);
  fs.writeFileSync(path.join(root, 'file'), '');
  fs.symlinkSync(root, path.join(root, 'link'), 'dir');
  for (const json of [[], ['--json']]) {
    expectError(['list', path.join(root, 'absent'), ...json], 'E_NOT_FOUND', 3, path.join(root, 'absent'));
    for (const name of ['file', 'link']) expectError(['list', path.join(root, name), ...json], 'E_NOT_DIRECTORY', 3, path.join(root, name));
    expectError(['list', '', ...json], 'E_USAGE', 2, null);
    expectError(['list', 'x'.repeat(4097), ...json], 'E_USAGE', 2, null);
  }
});
