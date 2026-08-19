import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import iconv from 'iconv-lite';
import { app } from 'electron';
import {
	buildEsArgs,
	buildEverythingExtensionFilter,
	decodeEsStdout,
	ES_PIPE_CODE_PAGE,
	ES_UNLIMITED_MAX_RESULTS,
	normalizeTargetExtensions,
	parseEsOutput,
	resolveMaxCandidateFilesForEs,
	tokenizeAdditionalArgs,
	validateAdditionalArgs,
} from '../dist/main/es-adapter.js';
import {
	filterCandidatePaths,
	parseFolderPathList,
	resolveEsTargetScope,
} from '../dist/main/folder-path-filter.js';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tms-grep-es-args-'));

app.disableHardwareAcceleration();
app.setPath('userData', tempDir);

app.whenReady().then(() => {
	try {
		const baseRequest = {
			esExePath        : 'C:\\Program Files\\Everything_CLI\\ES-1.1.0.30.x64\\es.exe',
			fileNameQuery    : '*.java',
			regex            : false,
			caseSensitive    : false,
			wholeWord        : false,
			matchPath        : false,
			diacritics       : false,
			maxCandidateFiles: 5000,
			sort             : 'path-ascending',
			timeoutMs        : 30000,
			additionalArgs   : '',
		};

		const normal = buildEsArgs(baseRequest);

		assert.equal(normal.errors.length, 0);
		assert.deepEqual(normal.args.slice(0, 10), [
			'/a-d',
			'-cp',
			ES_PIPE_CODE_PAGE,
			'-full-path-and-name',
			'-txt',
			'-n',
			'5000',
			'-timeout',
			'30000',
			'-sort',
		]);
		assert.equal(normal.args.at(-1), '*.java');

		const unlimited = buildEsArgs({
			...baseRequest,
			maxCandidateFiles: 0,
		});

		assert.equal(unlimited.errors.length, 0);
		assert.equal(unlimited.args[6], String(ES_UNLIMITED_MAX_RESULTS));
		assert.equal(resolveMaxCandidateFilesForEs(0), ES_UNLIMITED_MAX_RESULTS);
		assert.equal(resolveMaxCandidateFilesForEs(5000), 5000);

		const regex = buildEsArgs({
			...baseRequest,
			regex        : true,
			fileNameQuery: '^Tm.*\\.java$',
		});

		assert.equal(regex.errors.length, 0);
		assert.ok(regex.args.includes('-r'));
		assert.equal(regex.args.at(-1), '^Tm.*\\.java$');

		const regexAlternation = buildEsArgs({
			...baseRequest,
			regex        : true,
			fileNameQuery: '(\\.md$)|(\\.txt$)',
		});

		assert.ok(regexAlternation.errors.length > 0);
		assert.match(regexAlternation.errors.join('\n'), /\| を使用できません/);

		const withPath = buildEsArgs({
			...baseRequest,
			targetPath: 'D:\\src',
		});

		assert.ok(withPath.args.includes('-path'));
		assert.ok(withPath.args.includes('D:\\src'));

		const parsedPaths = parseFolderPathList('C:\\tmp, "C:\\Program Files (x86)", ', '除外フォルダ');

		assert.deepEqual(parsedPaths, {
			valid : true,
			values: ['C:\\tmp', 'C:\\Program Files (x86)'],
		});

		process.env.TMS_GREP_TEST_PATH = 'C:\\Users\\tmsys';

		try {
			assert.deepEqual(parseFolderPathList('%TMS_GREP_TEST_PATH%, D:\\work', '対象フォルダ'), {
				valid : true,
				values: ['C:\\Users\\tmsys', 'D:\\work'],
			});
		} finally {
			delete process.env.TMS_GREP_TEST_PATH;
		}

		const unresolvedEnvironment = parseFolderPathList('%TMS_GREP_UNKNOWN_PATH%\\src', '対象フォルダ');

		assert.equal(unresolvedEnvironment.valid, false);
		assert.match(unresolvedEnvironment.message ?? '', /環境変数を解決できません/);

		const candidatePaths = [
			'C:\\tmp\\skip.txt',
			'C:\\Program Files\\skip.txt',
			'C:\\Program Files (x86)\\skip.txt',
			'C:\\Users\\tmsys\\skip.txt',
			'D:\\SomeUserName\\tmsys\\skip.txt',
			'D:\\work\\keep.txt',
		];

		assert.deepEqual(filterCandidatePaths(candidatePaths, [], ['C:\\*'], 0), [
			'D:\\SomeUserName\\tmsys\\skip.txt',
			'D:\\work\\keep.txt',
		]);
		assert.deepEqual(filterCandidatePaths(candidatePaths, [], ['C:\\*User*\\tm*'], 0), [
			'C:\\tmp\\skip.txt',
			'C:\\Program Files\\skip.txt',
			'C:\\Program Files (x86)\\skip.txt',
			'D:\\SomeUserName\\tmsys\\skip.txt',
			'D:\\work\\keep.txt',
		]);
		assert.deepEqual(filterCandidatePaths(candidatePaths, [], ['*\\*User*\\tmsys'], 0), [
			'C:\\tmp\\skip.txt',
			'C:\\Program Files\\skip.txt',
			'C:\\Program Files (x86)\\skip.txt',
			'D:\\work\\keep.txt',
		]);
		assert.deepEqual(filterCandidatePaths(candidatePaths, [], ['C:\\Program Files'], 0), [
			'C:\\tmp\\skip.txt',
			'C:\\Users\\tmsys\\skip.txt',
			'D:\\SomeUserName\\tmsys\\skip.txt',
			'D:\\work\\keep.txt',
		]);

		assert.deepEqual(filterCandidatePaths(candidatePaths, [
			'C:\\*User*\\tm*',
			'D:\\work',
		], [], 0), [
			'C:\\Users\\tmsys\\skip.txt',
			'D:\\work\\keep.txt',
		]);
		assert.equal(resolveEsTargetScope(['C:\\*User*\\tm*']), 'C:\\');
		assert.equal(resolveEsTargetScope(['C:\\Program*\\src']), 'C:\\');

		const withPathFilters = buildEsArgs({
			...baseRequest,
			targetPath : 'C:\\src, D:\\src',
			excludePath: 'C:\\src\\tmp',
		});

		assert.equal(withPathFilters.errors.length, 0);
		assert.equal(withPathFilters.args[6], String(ES_UNLIMITED_MAX_RESULTS));
		assert.equal(withPathFilters.args.includes('-path'), false);

		const withExtensions = buildEsArgs({
			...baseRequest,
			targetExtensions: ' .txt ; md ; txt ',
		});

		assert.equal(withExtensions.errors.length, 0);
		assert.equal(withExtensions.args.at(-1), 'ext:txt;md');
		assert.deepEqual(normalizeTargetExtensions('.txt;md'), {
			valid: true,
			value: 'txt;md',
		});
		assert.equal(buildEverythingExtensionFilter('txt;md'), 'ext:txt;md');

		const invalidExtensions = buildEsArgs({
			...baseRequest,
			targetExtensions: 'txt|md',
		});

		assert.ok(invalidExtensions.errors.length > 0);

		const withFlags = buildEsArgs({
			...baseRequest,
			caseSensitive: true,
			wholeWord    : true,
			matchPath    : true,
			diacritics   : true,
		});

		assert.ok(withFlags.args.includes('-case'));
		assert.ok(withFlags.args.includes('-whole-word'));
		assert.ok(withFlags.args.includes('-match-path'));
		assert.ok(withFlags.args.includes('-diacritics'));

		const advanced = validateAdditionalArgs('-offset 10');

		assert.equal(advanced.valid, true);
		assert.deepEqual(advanced.args, ['-offset', '10']);

		const forbidden = validateAdditionalArgs('-export-csv out.csv');

		assert.equal(forbidden.valid, false);
		assert.ok(forbidden.errors.length > 0);

		const conflict = validateAdditionalArgs('-txt -n 100');

		assert.equal(conflict.valid, true);
		assert.ok(conflict.warnings.length > 0);
		assert.equal(conflict.args.length, 0);

		const tokens = tokenizeAdditionalArgs('-offset 10 -parent "D:\\src\\lib"');

		assert.deepEqual(tokens, ['-offset', '10', '-parent', 'D:\\src\\lib']);

		const parsed = parseEsOutput('D:\\a\\Sample.java\r\n\r\nD:\\b\\Other.java\n');

		assert.deepEqual(parsed, ['D:\\a\\Sample.java', 'D:\\b\\Other.java']);

		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tms-grep-es-decode-'));
		const jpPath  = path.join(tempDir, '日本語.txt');

		fs.writeFileSync(jpPath, 'sample', 'utf8');

		const cp932Stdout  = iconv.encode(`${jpPath}\r\n`, 'cp932');
		const wrongPaths   = parseEsOutput(cp932Stdout.toString('utf8'));
		const decodedPaths = parseEsOutput(decodeEsStdout(cp932Stdout));

		assert.notEqual(wrongPaths[0], jpPath);
		assert.equal(decodedPaths[0], jpPath);

		const thaiPath   = path.join(tempDir, 'Test2 ตอนที่ 1 Jkken.txt');
		const thaiStdout = Buffer.from(`${thaiPath}\r\n`, 'utf8');

		fs.writeFileSync(thaiPath, 'sample', 'utf8');
		const originalExistsSync = fs.existsSync;
		let existsSyncCalls      = 0;

		/**
		 * fs.existsSync 呼び出しを記録する
		 * @returns {boolean} 存在確認結果
		 */
		fs.existsSync = (...args) => {
			existsSyncCalls += 1;
			return originalExistsSync(...args);
		};

		try {
			assert.equal(parseEsOutput(decodeEsStdout(thaiStdout))[0], thaiPath);
			assert.equal(existsSyncCalls, 0);
		} finally {
			fs.existsSync = originalExistsSync;
		}

		const cp932ThaiStdout = iconv.encode(`${thaiPath}\r\n`, 'cp932');
		const thaiWrongPaths  = parseEsOutput(cp932ThaiStdout.toString('utf8'));

		assert.notEqual(thaiWrongPaths[0], thaiPath);

		fs.rmSync(tempDir, { recursive: true, force: true });

		console.log('test-es-args: all assertions passed');
		app.exit(0);
	} catch (error) {
		console.error(error);
		app.exit(1);
	}
});
