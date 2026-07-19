import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import iconv from 'iconv-lite';

const rootDir     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(rootDir, 'fixtures');

const utf16Content = [
	'package com.example;',
	'',
	'public class SampleUtf16 {',
	'\tpublic void run() {',
	'\t\tMyLogger.writeError("UTF-16 sample");',
	'\t}',
	'}',
	'',
].join('\r\n');

const cp932Content = [
	'package com.example;',
	'',
	'public class SampleCp932 {',
	'\tpublic void run() {',
	'\t\tMyLogger.writeError("エラー発生");',
	'\t}',
	'}',
	'',
].join('\r\n');

const utf16Path  = path.join(fixturesDir, 'utf16le', 'SampleUtf16.java');
const cp932Path  = path.join(fixturesDir, 'cp932', 'SampleCp932.java');
const binaryPath = path.join(fixturesDir, 'binary', 'image.bin');
const largePath  = path.join(fixturesDir, 'large', 'large.txt');

fs.mkdirSync(path.dirname(utf16Path), { recursive: true });
fs.mkdirSync(path.dirname(cp932Path), { recursive: true });
fs.mkdirSync(path.dirname(binaryPath), { recursive: true });
fs.mkdirSync(path.dirname(largePath), { recursive: true });

const utf16Bom  = Buffer.from([0xFF, 0xFE]);
const utf16Body = Buffer.from(utf16Content, 'utf16le');

fs.writeFileSync(utf16Path, Buffer.concat([utf16Bom, utf16Body]));
fs.writeFileSync(cp932Path, iconv.encode(cp932Content, 'cp932'));
fs.writeFileSync(binaryPath, Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x00, 0x0D, 0x0A]));
fs.writeFileSync(largePath, 'x'.repeat(1024 * 1024));

console.log('fixtures created');
