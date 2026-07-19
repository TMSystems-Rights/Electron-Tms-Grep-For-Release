import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import {
	findLiteralMatches,
	findRegexMatches,
	searchInFiles,
	searchLine,
	searchSingleFile,
	validateContentRegex,
} from '../dist/main/content-search.js';
import { detectEncodingFromBuffer, readTextFile } from '../dist/main/encoding.js';
import { isBinaryFileBuffer } from '../dist/main/binary-detect.js';

const rootDir     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(rootDir, 'fixtures');
const tempDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'tms-grep-content-search-'));

const utf8Sample   = path.join(fixturesDir, 'utf8', 'Sample.java');
const utf16Sample  = path.join(fixturesDir, 'utf16le', 'SampleUtf16.java');
const cp932Sample  = path.join(fixturesDir, 'cp932', 'SampleCp932.java');
const binarySample = path.join(fixturesDir, 'binary', 'image.bin');
const largeSample  = path.join(fixturesDir, 'large', 'large.txt');

const baseRequest = {
	query            : 'MyLogger',
	regex            : false,
	caseSensitive    : true,
	encoding         : 'auto',
	maxFileSizeBytes : 512 * 1024,
	skipBinary       : true,
	concurrency      : 4,
	maxRows          : 1000,
};

app.disableHardwareAcceleration();
app.setPath('userData', tempDir);

app.whenReady().then(async () => {
	try {
		for (const fixturePath of [utf8Sample, utf16Sample, cp932Sample, binarySample, largeSample]) {
			assert.ok(fs.existsSync(fixturePath), `fixture missing: ${fixturePath}`);
		}

		const literalRanges = findLiteralMatches('foo bar foo baz foo', 'foo', false);

		assert.equal(literalRanges.length, 3);
		assert.deepEqual(literalRanges[0], { start: 0, end: 3 });
		assert.deepEqual(literalRanges[1], { start: 8, end: 11 });
		assert.deepEqual(literalRanges[2], { start: 16, end: 19 });

		const regexRanges = findRegexMatches(
			'MyLogger.writeError(e);',
			new RegExp(String.raw`MyLogger\.writeError\s*\(.+\);`, 'gu'),
		);

		assert.equal(regexRanges.length, 1);
		assert.equal(regexRanges[0].start, 0);

		const lineHit = searchLine({
			filePath     : utf8Sample,
			lineNumber   : 5,
			lineText     : 'MyLogger.writeError(e);',
			query        : String.raw`MyLogger\.writeError\s*\(.+\);`,
			regex        : true,
			caseSensitive: true,
		});

		assert.ok(lineHit);
		assert.equal(lineHit.lineNumber, 5);
		assert.equal(lineHit.columnNumber, 1);
		assert.equal(lineHit.hitCountInLine, 1);
		assert.equal(lineHit.lineText, 'MyLogger.writeError(e);');

		const invalidRegex = validateContentRegex('[', true);

		assert.equal(invalidRegex.valid, false);
		assert.ok(invalidRegex.message);

		const globInContentRegex = validateContentRegex('*.java', false);

		assert.equal(globInContentRegex.valid, false);
		assert.match(globInContentRegex.message ?? '', /glob 形式/);

		const utf8Result = searchSingleFile(utf8Sample, {
			...baseRequest,
			files: [utf8Sample],
		});

		assert.equal(utf8Result.skipped, false);
		assert.equal(utf8Result.errored, false);
		assert.equal(utf8Result.hits.length, 4);
		assert.equal(utf8Result.hits[0].columnNumber, 3);

		const caseInsensitive = searchSingleFile(utf8Sample, {
			...baseRequest,
			files        : [utf8Sample],
			caseSensitive: false,
			query        : 'mylogger',
		});

		assert.equal(caseInsensitive.hits.length, 4);

		const regexResult = searchSingleFile(utf8Sample, {
			...baseRequest,
			files: [utf8Sample],
			regex: true,
			query: String.raw`MyLogger\.writeError\s*\(.+\);`,
		});

		assert.equal(regexResult.hits.length, 4);
		assert.ok(regexResult.hits.every((hit) => hit.lineText.includes('MyLogger.writeError')));

		const fooHits = searchSingleFile(utf8Sample, {
			...baseRequest,
			files: [utf8Sample],
			query: 'foo',
		});

		const fooLine = fooHits.hits.find((hit) => hit.lineText.includes('baz'));

		assert.ok(fooLine);
		assert.equal(fooLine.hitCountInLine, 3);
		assert.equal(fooLine.columnNumber, 18);

		const utf16Read = readTextFile(utf16Sample, 'auto');

		assert.ok(utf16Read.content.includes('MyLogger.writeError'));
		assert.equal(utf16Read.encoding, 'utf16le');

		const utf16Result = searchSingleFile(utf16Sample, {
			...baseRequest,
			files: [utf16Sample],
		});

		assert.equal(utf16Result.hits.length, 1);

		const cp932Buffer   = fs.readFileSync(cp932Sample);
		const cp932Encoding = detectEncodingFromBuffer(cp932Buffer);

		assert.equal(cp932Encoding, 'cp932');

		const utf8JapaneseBuffer  = Buffer.from('あ'.repeat(2048), 'utf8');
		const truncatedUtf8Sample = utf8JapaneseBuffer.subarray(0, 4096);

		assert.equal(detectEncodingFromBuffer(truncatedUtf8Sample), 'utf8');

		const historySamplePath = path.join(
			process.env.APPDATA ?? '',
			'Code',
			'User',
			'History',
			'-332a9368',
			'1wNa.java',
		);

		if (fs.existsSync(historySamplePath)) {
			const historyBuffer   = fs.readFileSync(historySamplePath);
			const historyEncoding = detectEncodingFromBuffer(historyBuffer.subarray(0, 4096));

			assert.equal(historyEncoding, 'utf8');

			const historyResult = searchSingleFile(historySamplePath, {
				...baseRequest,
				files        : [historySamplePath],
				caseSensitive: false,
				query        : 'WriteError',
			});

			const historyHit = historyResult.hits.find((hit) => hit.lineNumber === 73);

			assert.ok(historyHit);
			assert.match(historyHit.lineText, /業務エラー/);
		}

		const cp932Result = searchSingleFile(cp932Sample, {
			...baseRequest,
			files: [cp932Sample],
			query: 'エラー',
		});

		assert.equal(cp932Result.hits.length, 1);

		assert.equal(isBinaryFileBuffer(fs.readFileSync(binarySample)), true);

		const binaryResult = searchSingleFile(binarySample, {
			...baseRequest,
			files: [binarySample],
		});

		assert.equal(binaryResult.skipped, true);
		assert.equal(binaryResult.hits.length, 0);

		const largeResult = searchSingleFile(largeSample, {
			...baseRequest,
			files           : [largeSample],
			maxFileSizeBytes: 1024,
		});

		assert.equal(largeResult.skipped, true);
		assert.equal(largeResult.hits.length, 0);

		const progressEvents = [];
		const hitEvents      = [];
		let cancelAfter      = 0;

		const batchResult = await searchInFiles({
			...baseRequest,
			files: [utf8Sample, utf16Sample, cp932Sample, binarySample, largeSample],
			query: 'MyLogger',
		}, {
			/**
			 *
			 */
			onHit: (hit) => {
				hitEvents.push(hit.filePath);
			},
			/**
			 *
			 */
			onProgress: (progress) => {
				progressEvents.push(progress);
			},
			/**
			 *
			 */
			isCancelled: () => {
				cancelAfter += 1;
				return cancelAfter > 2;
			},
		});

		assert.ok(progressEvents.length > 0);
		assert.ok(hitEvents.length > 0);
		assert.equal(batchResult.cancelled, true);
		assert.ok(batchResult.searchedFileCount >= 1);

		const manyFiles = Array.from({ length: 200 }, () => utf8Sample);
		let cancelFlag  = false;

		setTimeout(() => {
			cancelFlag = true;
		}, 30);

		const delayedCancelResult = await searchInFiles({
			...baseRequest,
			files      : manyFiles,
			concurrency: 4,
			query      : 'MyLogger',
		}, {
			/**
			 *
			 */
			isCancelled: () => cancelFlag,
		});

		assert.equal(delayedCancelResult.cancelled, true);
		assert.ok(delayedCancelResult.searchedFileCount < manyFiles.length);

		const maxRowsResult = await searchInFiles({
			...baseRequest,
			files  : [utf8Sample],
			maxRows: 2,
		});

		assert.equal(maxRowsResult.hits.length, 2);
		assert.equal(maxRowsResult.stoppedByMaxRows, true);

		const unlimitedRowsResult = await searchInFiles({
			...baseRequest,
			files  : [utf8Sample],
			maxRows: 0,
		});

		assert.equal(unlimitedRowsResult.hits.length, 4);
		assert.equal(unlimitedRowsResult.stoppedByMaxRows, false);

		await assert.rejects(
			() => searchInFiles({
				...baseRequest,
				files: [utf8Sample],
				regex: true,
				query: '(',
			}),
			/正規表現が不正です/,
		);

		console.log('test-content-search: all assertions passed');
		app.exit(0);
	} catch (error) {
		console.error(error);
		app.exit(1);
	}
});
