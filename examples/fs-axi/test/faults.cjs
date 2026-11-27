// Test-only preload: controlled filesystem failures in a real spawned CLI.
// Production has no fault-injection flags or environment hooks.
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.FS_AXI_TEST_ROOT;
const mode = process.env.FS_AXI_TEST_FAULT;
const originalLstat = fs.lstatSync;
const originalReaddir = fs.readdirSync;
function denied(code = 'EACCES') { throw Object.assign(new Error('injected read failure'), { code }); }
function stat(type, size = 0n) {
  return { size, isFile: () => type === 'file', isDirectory: () => type === 'directory', isSymbolicLink: () => type === 'symlink' };
}
if (mode === 'surrogate-input') process.argv[process.argv.indexOf(root, 2)] = '\ud800';
if (mode === 'surrogate-source') {
  const originalResolve = path.resolve;
  path.resolve = function (...args) {
    return args.length === 1 && args[0] === root ? '\ud800' : originalResolve(...args);
  };
}
fs.lstatSync = function (target, options) {
  if (mode === 'no-io') process.exit(99);
  if (target === root && mode === 'initial-denied') denied();
  if (target === path.join(root, 'b') && mode === 'selected-gone') denied('ENOENT');
  if (target === path.join(root, 'b') && mode === 'selected-denied') denied();
  if (target !== root) {
    if (mode === 'unsafe-size') return stat('file', 9007199254740992n);
    if (mode === 'negative-size') return stat('file', -1n);
    if (mode === 'response-size') return stat('file');
    if (mode === 'types') return target === path.join(root, 'a') ? stat('file', 9007199254740991n) : stat('other');
  }
  return originalLstat(target, options);
};
fs.readdirSync = function (target, options) {
  if (mode === 'no-io') process.exit(99);
  if (target === root) {
    if (mode === 'enumeration-denied') denied();
    if (mode === 'enumeration-gone') denied('ENOENT');
    if (mode === 'long-name') return [Buffer.from('x'.repeat(4097))];
    if (mode === 'unsafe-total') return { length: 9007199254740992 };
    if (['unsafe-size', 'negative-size'].includes(mode)) return [Buffer.from('a')];
    if (mode === 'types') return [Buffer.from('b'), Buffer.from('a')];
    if (mode === 'response-size') return Array.from({ length: 500 }, (_, i) => Buffer.from('x'.repeat(4090) + i));
  }
  return originalReaddir(target, options);
};
