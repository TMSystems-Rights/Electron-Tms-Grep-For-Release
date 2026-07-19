import assert from 'node:assert/strict';
import { formatHitTsv, formatHits } from '../dist/main/clipboard.js';
import {
	applyTabHandling,
	prepareHitsForCopy,
	replaceAllTabsWithSpaces,
	replaceIndentAndTrailingTabs,
	transformLineTextForCopy,
	trimLineEdges,
} from '../dist/main/copy-text-transform.js';

const sampleHit = {
	id           : 'hit-1',
	filePath     : 'D:\\src\\Sample.java',
	lineNumber   : 42,
	columnNumber : 13,
	hitCountInLine: 1,
	lineText     : '\t\tMyLogger.writeError(e);\t',
	matchRanges  : [{ start: 0, end: 8 }],
};

try {
	assert.equal(replaceAllTabsWithSpaces('\t\tab\tc', 4), '        ab    c');
	assert.equal(replaceIndentAndTrailingTabs('\t\tab\tc', 4), '        ab\tc');
	assert.equal(replaceIndentAndTrailingTabs('ab\tc\t\t', 4), 'ab\tc        ');
	assert.equal(replaceIndentAndTrailingTabs('ab\tc', 4), 'ab\tc');

	assert.equal(trimLineEdges(' \u3000\tfoo \t'), 'foo');
	assert.equal(trimLineEdges('foo bar'), 'foo bar');

	assert.equal(
		transformLineTextForCopy('\t\tprintln();\t', {
			tabHandling : 'replace-all',
			tabSize     : 4,
			trimLineText: false,
		}),
		'        println();    ',
	);

	assert.equal(
		transformLineTextForCopy('\t\tprintln();\t', {
			tabHandling : 'replace-indent',
			tabSize     : 4,
			trimLineText: true,
		}),
		'println();',
	);

	const prepared = prepareHitsForCopy([sampleHit], {
		tabHandling : 'replace-all',
		tabSize     : 4,
		trimLineText: true,
	});

	assert.equal(prepared[0].lineText, 'MyLogger.writeError(e);');
	assert.equal(
		formatHitTsv(prepared[0]).split('\t').length,
		4,
	);

	const tsvOutput = formatHits([sampleHit], 'tsv', 'lf', {
		tabHandling : 'replace-all',
		tabSize     : 4,
		trimLineText: true,
	});

	assert.ok(!tsvOutput.includes('\t\t'));
	assert.ok(tsvOutput.includes('MyLogger.writeError(e);'));

	assert.equal(
		applyTabHandling('keep\tmiddle', 'preserve', 4),
		'keep\tmiddle',
	);

	console.log('test-copy-text-transform: all assertions passed');
} catch (error) {
	console.error(error);
	process.exit(1);
}
