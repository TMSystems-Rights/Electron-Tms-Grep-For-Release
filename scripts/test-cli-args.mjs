import assert from 'node:assert/strict';
import { parseTargetPath } from '../dist/main/cli-args.js';

try {
	assert.equal(parseTargetPath(['electron.exe', '.']), undefined);
	assert.equal(parseTargetPath(['electron.exe', '.', '--target-path']), undefined);
	assert.equal(parseTargetPath(['electron.exe', '.', '--target-path', '']), undefined);
	assert.equal(
		parseTargetPath(['C:\\app\\TmsGrep.exe', '--target-path', 'D:\\src']),
		'D:\\src',
	);
	assert.equal(
		parseTargetPath(['electron.exe', '.', '--target-path', 'D:\\work folder\\proj']),
		'D:\\work folder\\proj',
	);
	assert.equal(
		parseTargetPath(['electron.exe', '.', '--Target-Path', 'E:\\docs']),
		'E:\\docs',
	);
	assert.equal(
		parseTargetPath(['electron.exe', '.', '--target-path=E:\\equals']),
		'E:\\equals',
	);
	assert.equal(parseTargetPath(['electron.exe', '.', '--target-path=']), undefined);
	assert.equal(
		parseTargetPath(['electron.exe', '.', '--target-pathology', 'D:\\src']),
		undefined,
	);
	assert.equal(
		parseTargetPath([
			'electron.exe',
			'.',
			'--target-path',
			'D:\\first',
			'--target-path',
			'D:\\second',
		]),
		'D:\\second',
	);
	assert.equal(
		parseTargetPath(['electron.exe', '.', '--other', '1', '--target-path', 'D:\\mid']),
		'D:\\mid',
	);

	console.log('test-cli-args: all assertions passed');
} catch (error) {
	console.error(error);
	process.exit(1);
}
