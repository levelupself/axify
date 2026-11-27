#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const discovery = {
  purpose: 'Nonrecursive directory inventory',
  scope: 'Immediate entries of an explicit local directory',
  usage: ['fs-axi [--json] [--help]', 'fs-axi list <directory> [--limit N] [--json]', 'fs-axi list --help [--json]'],
  limits: { default: 50, max: 500 },
};

function record(name, fields) {
  return name + Object.entries(fields).map(([key, value]) => ` ${key}=${JSON.stringify(value)}`).join('');
}

function encode(response, json) {
  if (json) return JSON.stringify(response) + '\n';
  const { v, tool, command, ok, data, error } = response;
  const lines = [record('axi', { v, tool, command, ok })];
  if (error) lines.push(record('error', error));
  else if (command === 'discover') {
    lines.push(record('discovery', { purpose: data.purpose, scope: data.scope }));
    for (const syntax of data.usage) lines.push(record('usage', { syntax }));
    lines.push(record('limits', data.limits));
  } else {
    const { entries, ...listing } = data;
    lines.push(record('listing', listing));
    for (const entry of entries) lines.push(record('entry', entry));
  }
  return lines.join('\n') + '\n';
}

const errors = {
  E_USAGE: [2, 'Invalid arguments'],
  E_NOT_FOUND: [3, 'Directory not found'],
  E_NOT_DIRECTORY: [3, 'Input is not a directory'],
  E_READ: [3, 'Directory inventory unavailable'],
  E_ENCODING: [3, 'Input is not valid Unicode'],
  E_CAPACITY: [1, 'Response capacity exceeded'],
  E_INTERNAL: [1, 'Internal failure'],
};
class Failure extends Error {
  constructor(code, target = null) {
    super(errors[code][1]);
    this.code = code;
    this.target = target;
  }
}
function fail(code, target) { throw new Failure(code, target); }

function parse(args) {
  const options = new Set();
  const operands = [];
  const issues = [];
  let ended = false;
  let unknownOption = false;
  let limit = 50;
  let limitIndex;
  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    if (!ended && token === '--') { ended = true; continue; }
    if (!ended && token.startsWith('-')) {
      if (!['--json', '--help', '--limit'].includes(token)) {
        unknownOption = true;
        issues.push({ index: i, target: null });
        continue;
      }
      if (options.has(token)) issues.push({ index: i, target: token === '--limit' ? token : null });
      options.add(token);
      if (token === '--limit') {
        limitIndex ??= i;
        const value = args[i + 1];
        if (value === undefined || ['--json', '--help', '--limit', '--'].includes(value)) {
          issues.push({ index: i, target: token });
        } else {
          if (!/^[1-9][0-9]*$/.test(value) || Number(value) > 500) issues.push({ index: i, target: token });
          else limit = Number(value);
          i++;
        }
      }
    } else operands.push({ token, index: i });
  }
  const first = operands[0]?.token;
  const command = first === 'list' ? 'list' : first !== undefined ? 'invalid'
    : unknownOption ? 'invalid' : 'discover';
  if (first !== undefined && first !== 'list') issues.push({ index: operands[0].index, target: null });
  if (operands.length > 2) issues.push({ index: operands[2].index, target: null });
  if (first !== 'list' && limitIndex !== undefined) issues.push({ index: limitIndex, target: '--limit' });
  if (first === 'list' && operands.length < 2 && !options.has('--help')) issues.push({ index: Infinity, target: null });
  let source;
  const directory = operands[1];
  if (directory) {
    try { source = sourcePath(directory.token); }
    catch (error) {
      issues.push({ index: directory.index, code: error instanceof Failure ? error.code : 'E_INTERNAL', target: null });
    }
  }
  issues.sort((a, b) => a.index - b.index);
  return { json: options.has('--json'), help: options.has('--help'), command, source, limit, issue: issues[0] };
}

function sourcePath(directory) {
  if (!directory.isWellFormed()) fail('E_ENCODING');
  if (!directory || Buffer.byteLength(directory) > 4096) fail('E_USAGE');
  const source = path.resolve(directory);
  if (!source.isWellFormed()) fail('E_ENCODING');
  if (Buffer.byteLength(source) > 4096) fail('E_USAGE');
  return source;
}

function inventory(source, limit) {
  let initial;
  try { initial = fs.lstatSync(source); }
  catch (error) {
    fail(error.code === 'ENOENT' ? 'E_NOT_FOUND' : error.code === 'ENOTDIR' ? 'E_NOT_DIRECTORY' : 'E_READ', source);
  }
  if (!initial.isDirectory()) fail('E_NOT_DIRECTORY', source);
  try {
    const names = fs.readdirSync(source, { encoding: 'buffer' });
    if (!Number.isSafeInteger(names.length)) fail('E_CAPACITY');
    const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    const decoded = new Map();
    for (const raw of names) {
      let name;
      try { name = decoder.decode(raw); } catch { fail('E_ENCODING'); }
      if (raw.length > 4096) fail('E_CAPACITY');
      decoded.set(raw, name);
    }
    names.sort(Buffer.compare);
    const entries = names.slice(0, limit).map((raw) => {
      const name = decoded.get(raw);
      const stat = fs.lstatSync(path.join(source, name), { bigint: true });
      const type = stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'other';
      if (type === 'file' && (stat.size < 0n || stat.size > BigInt(Number.MAX_SAFE_INTEGER))) fail('E_CAPACITY');
      return { name, type, bytes: type === 'file' ? Number(stat.size) : null };
    });
    return { source, limit, total: names.length, returned: entries.length, truncated: entries.length < names.length, entries };
  } catch (error) {
    if (error instanceof Failure) throw error;
    fail('E_READ', source);
  }
}

function failureResponse(command, error) {
  return { v: 0, tool: 'fs-axi', command, ok: false, data: null,
    error: { code: error.code, message: error.message, target: error.target } };
}

function main(args) {
  const parsed = parse(args);
  let command = parsed.command;
  let response;
  try {
    if (parsed.issue) fail(parsed.issue.code ?? 'E_USAGE', parsed.issue.target);
    if (parsed.help || command === 'discover') command = 'discover';
    const data = command === 'discover' ? discovery : inventory(parsed.source, parsed.limit);
    response = { v: 0, tool: 'fs-axi', command, ok: true, data, error: null };
  } catch (error) {
    response = failureResponse(command, error instanceof Failure ? error : new Failure('E_INTERNAL'));
  }
  let output = encode(response, parsed.json);
  if (Buffer.byteLength(output) > 1048576) {
    response = failureResponse(command, new Failure('E_CAPACITY'));
    output = encode(response, parsed.json);
  }
  process.exitCode = response.ok ? 0 : errors[response.error.code][0];
  process.stdout.on('error', () => { process.exitCode = 1; });
  process.stdout.write(output);
}

main(process.argv.slice(2));
