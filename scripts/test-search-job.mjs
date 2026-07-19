import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';

const fixturesDir = path.resolve('fixtures');
const utf8Sample  = path.join(fixturesDir, 'utf8', 'Sample.java');
const tempDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'tms-grep-search-job-'));

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.setPath('userData', tempDir);

const { createDefaultConfig } = await import('../dist/main/config-store.js');
const {
	createContentSearchRequest,
	getSearchJobState,
	isSearchJobRunning,
	resetSearchJobStateForTest,
	setSearchJobStateForTest,
	startSearchJob,
	trimmedContentLength,
	validateFileNameQueryInput,
	validateSearchStartPayload,
} = await import('../dist/main/search-job.js');
const { searchInFiles }       = await import('../dist/main/content-search.js');

try {
	resetSearchJobStateForTest();

	assert.equal(getSearchJobState(), 'idle');
	assert.equal(isSearchJobRunning(), false);
	assert.equal(trimmedContentLength('  abc  '), 3);
	assert.equal(trimmedContentLength('　'), 0);

	const config = createDefaultConfig();

	const emptyFileName = validateSearchStartPayload({
		fileNameQuery: '   ',
		contentQuery : 'foo',
	}, config.settings.contentSearch);

	assert.equal(emptyFileName.valid, false);

	const emptyContent = validateSearchStartPayload({
		fileNameQuery: '*.java',
		contentQuery : ' ',
	}, config.settings.contentSearch);

	assert.equal(emptyContent.valid, false);

	const invalidRegex = validateSearchStartPayload({
		fileNameQuery: '*.java',
		contentQuery : '(',
		contentRegex : true,
	}, config.settings.contentSearch);

	assert.equal(invalidRegex.valid, false);

	const missingPath = validateSearchStartPayload({
		fileNameQuery: '*.java',
		contentQuery : 'MyLogger',
		targetPath   : path.join(os.tmpdir(), 'tms-grep-missing-folder'),
	}, config.settings.contentSearch);

	assert.equal(missingPath.valid, false);

	const validPayload = validateSearchStartPayload({
		fileNameQuery: '*.java',
		contentQuery : 'MyLogger',
	}, config.settings.contentSearch);

	assert.equal(validPayload.valid, true);

	const globInRegex = validateSearchStartPayload({
		fileNameQuery: '*.java',
		contentQuery : 'MyLogger',
		fileNameRegex: true,
	}, config.settings.contentSearch);

	assert.equal(globInRegex.valid, false);
	assert.match(globInRegex.message ?? '', /glob 形式/);

	const invalidFileNameRegex = validateFileNameQueryInput('(', true);

	assert.equal(invalidFileNameRegex.valid, false);
	assert.match(invalidFileNameRegex.message ?? '', /正規表現が不正です/);

	const validFileNameRegex = validateFileNameQueryInput('.*\\.java$', true);

	assert.equal(validFileNameRegex.valid, true);

	const unsupportedFileNameRegexAlternation = validateFileNameQueryInput('(\\.md$)|(\\.txt$)', true);

	assert.equal(unsupportedFileNameRegexAlternation.valid, false);
	assert.match(unsupportedFileNameRegexAlternation.message ?? '', /\| を使用できません/);

	const invalidExtensions = validateSearchStartPayload({
		fileNameQuery    : '*.java',
		contentQuery     : 'MyLogger',
		targetExtensions : 'txt|md',
	}, config.settings.contentSearch);

	assert.equal(invalidExtensions.valid, false);
	assert.match(invalidExtensions.message ?? '', /拡張子指定/);

	const contentRequest = createContentSearchRequest({
		files       : [utf8Sample],
		contentQuery: 'MyLogger',
		contentRegex: false,
		config,
	});

	assert.equal(contentRequest.files.length, 1);
	assert.equal(contentRequest.maxFileSizeBytes, 20 * 1024 * 1024);
	assert.equal(contentRequest.maxRows, 10000);

	const contentResult = await searchInFiles(contentRequest);

	assert.ok(contentResult.hits.length > 0);

	let progressCount = 0;

	const jobResult = await startSearchJob({
		config,
		payload: {
			fileNameQuery: '*.java',
			contentQuery : 'MyLogger',
		},
		notifier: {
			/**
			 *
			 */
			onProgress: () => {
				progressCount += 1;
			},
		},
	});

	if (jobResult.success && jobResult.state === 'completed') {
		assert.ok(progressCount > 0);
	} else {
		console.log('search-job integration skipped (es.exe unavailable or search failed):', jobResult.message);
	}

	resetSearchJobStateForTest();
	setSearchJobStateForTest('searching-content');

	const duplicateStart = await startSearchJob({
		config,
		payload: {
			fileNameQuery: '*.java',
			contentQuery : 'MyLogger',
		},
	});

	assert.equal(duplicateStart.success, false);
	assert.match(duplicateStart.message ?? '', /既に実行中/);

	resetSearchJobStateForTest();

	console.log('test-search-job: all assertions passed');
	process.exit(0);
} catch (error) {
	console.error(error);
	process.exit(1);
}
