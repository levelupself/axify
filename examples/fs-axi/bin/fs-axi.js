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

function inventory(directory, limit) {
  const source = path.resolve(directory);
  const names = fs.readdirSync(source, { encoding: 'buffer' }).sort(Buffer.compare);
  const entries = names.slice(0, limit).map((raw) => {
    const name = raw.toString('utf8');
    const stat = fs.lstatSync(path.join(source, name));
    const type = stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : stat.isSymbolicLink() ? 'symlink' : 'other';
    return { name, type, bytes: type === 'file' ? stat.size : null };
  });
  return { source, limit, total: names.length, returned: entries.length, truncated: entries.length < names.length, entries };
}

const args = process.argv.slice(2);
const json = args.includes('--json');
const command = args.includes('--help') || !args.includes('list') ? 'discover' : 'list';
const data = command === 'discover' ? discovery : inventory(args[args.indexOf('list') + 1], 50);
process.stdout.write(encode({ v: 0, tool: 'fs-axi', command, ok: true, data, error: null }, json));
