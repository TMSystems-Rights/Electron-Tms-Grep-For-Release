import type { CopyTextTransformSettings, SearchHit, TabHandling } from './types';

/** 行頭・行末トリム対象 */
const LINE_EDGE_TRIM_PATTERN = /^[\t \u3000]+|[\t \u3000]+$/gu;

/**
 * タブ文字を半角空白へ置換する
 * @param {string} text 文字列
 * @param {number} tabSize タブサイズ
 * @returns {string} 置換後
 */
export function replaceAllTabsWithSpaces(text: string, tabSize: number): string {
	return text.replace(/\t/g, ' '.repeat(tabSize));
}

/**
 * 行頭・行末のタブ文字を半角空白へ置換する
 * @param {string} text 文字列
 * @param {number} tabSize タブサイズ
 * @returns {string} 置換後
 */
export function replaceIndentAndTrailingTabs(text: string, tabSize: number): string {
	const spaces       = ' '.repeat(tabSize);
	const leadingMatch = text.match(/^\t+/);

	if (!leadingMatch && !/\t+$/.test(text)) {
		return text;
	}

	let result = text;

	if (leadingMatch) {
		const leading = leadingMatch[0];

		result = leading.replace(/\t/g, spaces) + result.slice(leading.length);
	}

	const trailingMatch = result.match(/\t+$/);

	if (trailingMatch) {
		const trailing      = trailingMatch[0];
		const trailingStart = result.length - trailing.length;

		result = result.slice(0, trailingStart) + trailing.replace(/\t/g, spaces);
	}

	return result;
}

/**
 * タブ文字の扱いを適用する
 * @param {string} text 文字列
 * @param {TabHandling} tabHandling タブ文字の扱い
 * @param {number} tabSize タブサイズ
 * @returns {string} 変換後
 */
export function applyTabHandling(text: string, tabHandling: TabHandling, tabSize: number): string {
	switch (tabHandling) {
		case 'replace-all':
			return replaceAllTabsWithSpaces(text, tabSize);
		case 'replace-indent':
			return replaceIndentAndTrailingTabs(text, tabSize);
		case 'preserve':
		default:
			return text;
	}
}

/**
 * 行頭・行末の半角空白・全角空白・タブを除去する
 * @param {string} text 文字列
 * @returns {string} トリム後
 */
export function trimLineEdges(text: string): string {
	return text.replace(LINE_EDGE_TRIM_PATTERN, '');
}

/**
 * コピー出力向けに該当行テキストを変換する
 * @param {string} lineText 該当行
 * @param {CopyTextTransformSettings} settings 変換設定
 * @returns {string} 変換後
 */
export function transformLineTextForCopy(
	lineText: string,
	settings: CopyTextTransformSettings,
): string {
	let text = applyTabHandling(lineText, settings.tabHandling, settings.tabSize);

	if (settings.trimLineText) {
		text = trimLineEdges(text);
	}

	return text;
}

/**
 * コピー向けにヒット一覧の該当行を変換する
 * @param {SearchHit[]} hits ヒット一覧
 * @param {CopyTextTransformSettings} settings 変換設定
 * @returns {SearchHit[]} 変換後
 */
export function prepareHitsForCopy(
	hits: SearchHit[],
	settings: CopyTextTransformSettings,
): SearchHit[] {
	return hits.map((hit) => ({
		...hit,
		lineText: transformLineTextForCopy(hit.lineText, settings),
	}));
}

/**
 * 結果設定からコピー用テキスト変換設定を組み立てる
 * @param {import('./types').ResultsSettings} results 結果設定
 * @returns {CopyTextTransformSettings} 変換設定
 */
export function createCopyTextTransformSettings(
	results: import('./types').ResultsSettings,
): CopyTextTransformSettings {
	return {
		tabHandling : results.tabHandling,
		tabSize     : results.tabSize,
		trimLineText: results.trimLineText,
	};
}
