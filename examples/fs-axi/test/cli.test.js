const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const cli = path.resolve(__dirname, '../bin/fs-axi.js');
function run(args = [], options = {}) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024, ...options,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.stderr, '');
  assert.ok(result.stdout.endsWith('\n'));
  assert.ok(!result.stdout.endsWith('\n\n'));
  return result;
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-axi-'));
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
