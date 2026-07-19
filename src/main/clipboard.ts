import type { CopyFormat, CopyLineEnding, CopyTextTransformSettings, SearchHit } from './types';
import { prepareHitsForCopy } from './copy-text-transform';

/** 桁揃え Markdown テーブルの列幅下限（GFM 区切り `---` と揃える） */
const MARKDOWN_TABLE_MIN_COLUMN_WIDTH = 3;

/** Markdown テーブル列定義 */
interface MarkdownTableColumn {
	header: string;
	/**
	 * @param {SearchHit} hit ヒット
	 * @returns {string} セル値
	 */
	value: (hit: SearchHit) => string;
}

/** Markdown テーブル列 */
const MARKDOWN_TABLE_COLUMNS: MarkdownTableColumn[] = [
	{
		header: 'ファイル',
		/**
		 * @param {SearchHit} hit ヒット
		 * @returns {string} セル値
		 */
		value : (hit) => wrapInlineCode(hit.filePath),
	},
	{
		header: '行',
		/**
		 * @param {SearchHit} hit ヒット
		 * @returns {string} セル値
		 */
		value : (hit) => String(hit.lineNumber),
	},
	{
		header: '列',
		/**
		 * @param {SearchHit} hit ヒット
		 * @returns {string} セル値
		 */
		value : (hit) => String(hit.columnNumber),
	},
	{
		header: 'ヒット数',
		/**
		 * @param {SearchHit} hit ヒット
		 * @returns {string} セル値
		 */
		value : (hit) => String(hit.hitCountInLine),
	},
	{
		header: '該当行',
		/**
		 * @param {SearchHit} hit ヒット
		 * @returns {string} セル値
		 */
		value : (hit) => wrapInlineCode(hit.lineText),
	},
];

/**
 * 改行コード設定を文字列へ変換する
 * @param {CopyLineEnding} lineEnding 改行コード設定
 * @returns {string} 改行文字列
 */
export function resolveLineEnding(lineEnding: CopyLineEnding): string {
	switch (lineEnding) {
		case 'cr':
			return '\r';
		case 'lf':
			return '\n';
		case 'crlf':
		default:
			return '\r\n';
	}
}

/**
 * 文字が全角幅（等倍フォントで半角 2 文字分）か判定する
 * @param {string} char 1 文字
 * @returns {boolean} 全角幅なら true
 */
export function isFullWidthChar(char: string): boolean {
	const code = char.codePointAt(0) ?? 0;

	return (
		(code >= 0x1100 && code <= 0x115F)
		|| (code >= 0x2E80 && code <= 0xA4CF)
		|| (code >= 0xAC00 && code <= 0xD7A3)
		|| (code >= 0xF900 && code <= 0xFAFF)
		|| (code >= 0xFE10 && code <= 0xFE19)
		|| (code >= 0xFE30 && code <= 0xFE6F)
		|| (code >= 0xFF00 && code <= 0xFF60)
		|| (code >= 0xFFE0 && code <= 0xFFE6)
	);
}

/**
 * 等倍フォント前提の表示幅を返す（半角 1、全角 2）
 * @param {string} text 文字列
 * @returns {number} 表示幅
 */
export function displayWidth(text: string): number {
	let width = 0;

	for (const char of text) {
		width += isFullWidthChar(char) ? 2 : 1;
	}

	return width;
}

/**
 * 表示幅で右側をスペース埋めする
 * @param {string} text 文字列
 * @param {number} targetWidth 表示幅
 * @returns {string} 埋め後文字列
 */
export function padEndDisplay(text: string, targetWidth: number): string {
	const currentWidth = displayWidth(text);

	if (currentWidth >= targetWidth) {
		return text;
	}

	return `${text}${' '.repeat(targetWidth - currentWidth)}`;
}

/**
 * Markdown インラインコードで囲む
 * @param {string} text 文字列
 * @returns {string} 囲んだ文字列
 */
export function wrapInlineCode(text: string): string {
	let fenceLength = 1;

	while (text.includes('`'.repeat(fenceLength))) {
		fenceLength += 1;
	}

	const fence = '`'.repeat(fenceLength);

	return `${fence}${text}${fence}`;
}

/**
 * grep 互換形式で 1 件を整形する
 * @param {SearchHit} hit ヒット
 * @returns {string} 整形結果
 */
export function formatHitGrep(hit: SearchHit): string {
	return `${hit.filePath}:${hit.lineNumber}:${hit.columnNumber}: ${hit.lineText}`;
}

/**
 * TSV 形式で 1 件を整形する
 * @param {SearchHit} hit ヒット
 * @returns {string} 整形結果
 */
export function formatHitTsv(hit: SearchHit): string {
	return [
		hit.filePath,
		String(hit.lineNumber),
		String(hit.columnNumber),
		hit.lineText,
	].join('\t');
}

/**
 * Markdown コードブロック形式で複数ヒットを整形する
 * @param {SearchHit[]} hits ヒット一覧
 * @returns {string} 整形結果
 */
export function formatHitsMarkdownCodeBlock(hits: SearchHit[]): string {
	const lines = hits.map((hit) => formatHitGrep(hit)).join('\n');

	return `\`\`\`\n${lines}\n\`\`\``;
}

/**
 * Markdown テーブル行を組み立てる
 * @param {string[]} cells セル値
 * @param {number[]} [widths] 列幅（桁揃え時）
 * @returns {string} 行文字列
 */
function buildMarkdownTableRow(cells: string[], widths?: number[]): string {
	const parts = cells.map((cell, index) => {
		const content = widths ? padEndDisplay(cell, widths[index]) : cell;

		return ` ${content} `;
	});

	return `|${parts.join('|')}|`;
}

/**
 * Markdown テーブル区切り行を組み立てる
 * @param {number[]} widths 列幅
 * @returns {string} 区切り行
 */
function buildMarkdownTableSeparator(widths: number[]): string {
	const parts = widths.map((width) => ` ${'-'.repeat(width)} `);

	return `|${parts.join('|')}|`;
}

/**
 * 桁揃え Markdown テーブルの列幅を算出する
 * @param {string[]} headers 見出し
 * @param {string[][]} rows データ行
 * @returns {number[]} 列幅
 */
export function computeAlignedColumnWidths(headers: string[], rows: string[][]): number[] {
	return headers.map((_header, columnIndex) => {
		let maxWidth = displayWidth(headers[columnIndex]);

		for (const cells of rows) {
			maxWidth = Math.max(maxWidth, displayWidth(cells[columnIndex]));
		}

		return Math.max(MARKDOWN_TABLE_MIN_COLUMN_WIDTH, maxWidth);
	});
}

/**
 * Markdown テーブル形式で複数ヒットを整形する
 * @param {SearchHit[]} hits ヒット一覧
 * @param {boolean} [alignColumns=false] 列幅を揃える
 * @returns {string} 整形結果
 */
export function formatHitsMarkdownTable(hits: SearchHit[], alignColumns = false): string {
	const headers = MARKDOWN_TABLE_COLUMNS.map((column) => column.header);
	const rows    = hits.map((hit) => MARKDOWN_TABLE_COLUMNS.map((definition) => definition.value(hit)));

	const widths = alignColumns
		? computeAlignedColumnWidths(headers, rows)
		: undefined;

	const lines = [
		buildMarkdownTableRow(headers, widths),
		alignColumns
			? buildMarkdownTableSeparator(widths ?? [])
			: buildMarkdownTableRow(MARKDOWN_TABLE_COLUMNS.map(() => '---')),
		...rows.map((cells) => buildMarkdownTableRow(cells, widths)),
	];

	return lines.join('\n');
}

/**
 * 1 件を指定形式で整形する
 * @param {SearchHit} hit ヒット
 * @param {CopyFormat} format コピー形式
 * @returns {string} 整形結果
 */
export function formatHit(hit: SearchHit, format: CopyFormat): string {
	switch (format) {
		case 'tsv':
			return formatHitTsv(hit);
		case 'markdown-codeblock':
			return formatHitsMarkdownCodeBlock([hit]);
		case 'markdown-table':
			return formatHitsMarkdownTable([hit], false);
		case 'markdown-table-aligned':
			return formatHitsMarkdownTable([hit], true);
		case 'paths':
			return hit.filePath;
		case 'grep':
		default:
			return formatHitGrep(hit);
	}
}

/**
 * ヒットから重複排除したファイルパス一覧を返す
 * @param {SearchHit[]} hits ヒット一覧
 * @returns {string[]} パス一覧
 */
export function collectUniquePaths(hits: SearchHit[]): string[] {
	const seen            = new Set<string>();
	const paths: string[] = [];

	for (const hit of hits) {
		if (seen.has(hit.filePath)) {
			continue;
		}

		seen.add(hit.filePath);
		paths.push(hit.filePath);
	}

	return paths;
}

/**
 * 複数ヒットを指定形式で整形する
 * @param {SearchHit[]} hits ヒット一覧
 * @param {CopyFormat} format コピー形式
 * @param {CopyLineEnding} [lineEnding='crlf'] 改行コード
 * @param {CopyTextTransformSettings} [textTransform] 該当行テキスト変換
 * @returns {string} 整形結果（末尾改行付き）
 */
export function formatHits(
	hits: SearchHit[],
	format: CopyFormat,
	lineEnding: CopyLineEnding = 'crlf',
	textTransform?: CopyTextTransformSettings,
): string {
	if (hits.length === 0) {
		return '';
	}

	const preparedHits = textTransform
		? prepareHitsForCopy(hits, textTransform)
		: hits;
	const eol          = resolveLineEnding(lineEnding);
	let body           = '';

	switch (format) {
		case 'markdown-codeblock':
			body = formatHitsMarkdownCodeBlock(preparedHits);
			break;
		case 'markdown-table':
			body = formatHitsMarkdownTable(preparedHits, false);
			break;
		case 'markdown-table-aligned':
			body = formatHitsMarkdownTable(preparedHits, true);
			break;
		case 'paths':
			body = collectUniquePaths(preparedHits).join(eol);
			break;
		default:
			body = preparedHits.map((hit) => formatHit(hit, format)).join(eol);
			break;
	}

	return `${body}${eol}`;
}
