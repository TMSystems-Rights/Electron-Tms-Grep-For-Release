import assert from 'node:assert/strict';
import {
	collectUniquePaths,
	computeAlignedColumnWidths,
	displayWidth,
	formatHit,
	formatHitGrep,
	formatHitTsv,
	formatHits,
	formatHitsMarkdownCodeBlock,
	formatHitsMarkdownTable,
	padEndDisplay,
	resolveLineEnding,
	wrapInlineCode,
} from '../dist/main/clipboard.js';

const sampleHit = {
	id           : 'hit-1',
	filePath     : 'D:\\src\\Sample.java',
	lineNumber   : 42,
	columnNumber : 13,
	hitCountInLine: 1,
	lineText     : 'MyLogger.writeError(e);',
	matchRanges  : [{ start: 0, end: 8 }],
};

const secondHit = {
	id           : 'hit-2',
	filePath     : 'D:\\src\\Other.java',
	lineNumber   : 7,
	columnNumber : 5,
	hitCountInLine: 2,
	lineText     : 'MyLogger.writeError("fail");',
	matchRanges  : [
		{ start: 0, end: 8 },
		{ start: 20, end: 24 },
	],
};

const japaneseHit = {
	id           : 'hit-jp',
	filePath     : 'C:\\Users\\Example\\AppData\\Roaming\\Code\\User\\History\\-11d1d24a\\0uHL.java',
	lineNumber   : 17,
	columnNumber : 14,
	hitCountInLine: 1,
	lineText     : '			System.out.println("--- 利用可能なモデル一覧 ---");',
	matchRanges  : [{ start: 0, end: 14 }],
};

const duplicatePathHit = {
	...secondHit,
	id         : 'hit-3',
	lineNumber : 12,
	columnNumber: 3,
	lineText   : 'MyLogger.writeError("again");',
};

try {
	assert.equal(resolveLineEnding('crlf'), '\r\n');
	assert.equal(resolveLineEnding('cr'), '\r');
	assert.equal(resolveLineEnding('lf'), '\n');

	assert.equal(displayWidth('行'), 2);
	assert.equal(displayWidth('17'), 2);
	assert.equal(displayWidth('abc'), 3);
	assert.equal(padEndDisplay('17', 4), '17  ');

	assert.equal(wrapInlineCode('foo'), '`foo`');
	assert.equal(wrapInlineCode('a`b'), '``a`b``');

	assert.equal(
		formatHitGrep(sampleHit),
		'D:\\src\\Sample.java:42:13: MyLogger.writeError(e);',
	);

	assert.equal(
		formatHitTsv(sampleHit),
		'D:\\src\\Sample.java\t42\t13\tMyLogger.writeError(e);',
	);

	assert.equal(formatHit(sampleHit, 'grep'), formatHitGrep(sampleHit));
	assert.equal(formatHit(sampleHit, 'paths'), 'D:\\src\\Sample.java');

	const codeBlock = formatHitsMarkdownCodeBlock([sampleHit, secondHit]);

	assert.match(codeBlock, /^```\r?\n/);
	assert.match(codeBlock, /\r?\n```$/);
	assert.ok(codeBlock.includes(formatHitGrep(sampleHit)));
	assert.ok(codeBlock.includes(formatHitGrep(secondHit)));

	const table = formatHitsMarkdownTable([japaneseHit], false);

	assert.match(table, /^\| ファイル \| 行 \| 列 \| ヒット数 \| 該当行 \|$/m);
	assert.match(table, /^\| --- \| --- \| --- \| --- \| --- \|$/m);
	assert.ok(table.includes('`C:\\Users\\Example\\AppData\\Roaming\\Code\\User\\History\\-11d1d24a\\0uHL.java`'));
	assert.ok(table.includes('利用可能なモデル一覧'));

	const alignedTable = formatHitsMarkdownTable([japaneseHit, {
		...japaneseHit,
		id         : 'hit-jp-2',
		lineNumber : 18,
		lineText   : '			System.out.println(response.body());',
	}], true);

	assert.ok(alignedTable.includes('| ファイル '));
	assert.ok(alignedTable.includes('| 17  | 14  | 1        |'));
	assert.ok(alignedTable.includes('| 18  | 14  | 1        |'));

	const wideLineTable = formatHitsMarkdownTable([{
		...japaneseHit,
		lineNumber: 1234,
	}], true);

	assert.ok(wideLineTable.includes('| 行   |'));
	assert.ok(wideLineTable.includes('| 1234 |'));

	const alignedWidths = computeAlignedColumnWidths(
		['行', '列'],
		[['17', '14'], ['1234', '5']],
	);

	assert.equal(alignedWidths[0], 4);
	assert.equal(alignedWidths[1], 3);

	assert.equal(
		formatHits([sampleHit, secondHit], 'grep'),
		[
			formatHitGrep(sampleHit),
			formatHitGrep(secondHit),
			'',
		].join('\r\n'),
	);

	assert.equal(
		formatHits([sampleHit], 'grep', 'lf'),
		`${formatHitGrep(sampleHit)}\n`,
	);

	assert.equal(
		formatHits([sampleHit], 'markdown-codeblock', 'lf'),
		`${formatHitsMarkdownCodeBlock([sampleHit])}\n`,
	);

	assert.equal(
		collectUniquePaths([sampleHit, secondHit, duplicatePathHit]).join('\n'),
		[
			'D:\\src\\Sample.java',
			'D:\\src\\Other.java',
		].join('\n'),
	);

	assert.equal(
		formatHits([sampleHit, secondHit, duplicatePathHit], 'paths'),
		[
			'D:\\src\\Sample.java',
			'D:\\src\\Other.java',
			'',
		].join('\r\n'),
	);

	assert.equal(formatHits([], 'grep'), '');

	console.log('test-copy-format: all assertions passed');
} catch (error) {
	console.error(error);
	process.exit(1);
}
