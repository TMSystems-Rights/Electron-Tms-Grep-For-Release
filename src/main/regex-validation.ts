import type { RegexValidationResult } from './types';

/** 正規表現検証の対象フィールド */
export type RegexValidationContext = 'fileName' | 'content';

/**
 * 正規表現モードで glob 風入力が使われていないか判定する
 * @param {string} query 検索条件
 * @returns {boolean} glob 風なら true
 */
export function isGlobLikeRegexPattern(query: string): boolean {
	const trimmed = query.trim();

	if (/^\*\.[A-Za-z0-9]+$/.test(trimmed)) {
		return true;
	}

	return trimmed.includes('*') && !trimmed.includes('.*');
}

/**
 * glob 風入力の案内メッセージを返す
 * @param {RegexValidationContext} context 対象フィールド
 * @returns {string} メッセージ
 */
export function formatGlobInRegexMessage(context: RegexValidationContext): string {
	if (context === 'fileName') {
		return 'ファイル名検索で「正規表現」が有効な場合、*.java のような glob 形式は使えません。正規表現をオフにするか、.*\\.java$ などを指定してください。';
	}

	return 'ファイル内検索で「正規表現」が有効な場合、*.java のような glob 形式は使えません。通常検索を使うか、.*\\.java$ などの正規表現を指定してください。';
}

/**
 * 正規表現モードで glob 風入力が使われていないか判定する
 * @param {string} query 検索条件
 * @param {RegexValidationContext} context 対象フィールド
 * @returns {string | undefined} 警告メッセージ
 */
export function getGlobInRegexMisuseMessage(
	query: string,
	context: RegexValidationContext,
): string | undefined {
	if (!isGlobLikeRegexPattern(query)) {
		return undefined;
	}

	if (/^\*\.[A-Za-z0-9]+$/.test(query.trim())) {
		return formatGlobInRegexMessage(context);
	}

	const fieldLabel = context === 'fileName' ? 'ファイル名検索' : 'ファイル内検索';

	return `${fieldLabel}の正規表現に * が含まれています。glob の * とは意味が異なるため、.* などの正規表現記法を使うか、正規表現モードをオフにしてください。`;
}

/**
 * ファイル名正規表現で Everything CLI 非互換の OR 記号が使われていないか判定する
 * @param {string} query 検索条件
 * @returns {boolean} 非対応の OR 記号を含むなら true
 */
export function hasUnsupportedFileNameRegexAlternation(query: string): boolean {
	return query.includes('|');
}

/**
 * ファイル名正規表現で非対応の OR 記号が使われた場合のメッセージを返す
 * @returns {string} メッセージ
 */
export function formatFileNameRegexAlternationMessage(): string {
	return 'ファイル名検索の正規表現では | を使用できません。（通常の正規表現とは異なり、Everything CLI特有の制限事項）';
}

/**
 * 正規表現パターンを検証する
 * @param {string} query 検索条件
 * @param {object} options オプション
 * @returns {RegexValidationResult} 検証結果
 */
export function validateRegexPattern(
	query: string,
	options: {
		emptyMessage?: string;
		context?: RegexValidationContext;
		caseSensitive?: boolean;
		contentSearch?: boolean;
	} = {},
): RegexValidationResult {
	const trimmed = query.trim();

	if (!trimmed) {
		return {
			valid  : false,
			message: options.emptyMessage ?? '検索条件が空です。',
		};
	}

	if (options.context) {
		if (options.context === 'fileName' && hasUnsupportedFileNameRegexAlternation(trimmed)) {
			return {
				valid  : false,
				message: formatFileNameRegexAlternationMessage(),
			};
		}

		const misuseMessage = getGlobInRegexMisuseMessage(trimmed, options.context);

		if (misuseMessage) {
			return {
				valid  : false,
				message: misuseMessage,
			};
		}
	}

	try {
		if (options.contentSearch) {
			const flags = `${options.caseSensitive ? '' : 'i'}gu`;
			 
			new RegExp(trimmed, flags);
		} else {
			 
			new RegExp(trimmed);
		}

		return { valid: true };
	} catch (error) {
		return {
			valid  : false,
			message: error instanceof Error
				? `正規表現が不正です: ${error.message}`
				: '正規表現が不正です。',
		};
	}
}

/**
 * ファイル名正規表現モードで glob 風入力が使われていないか判定する
 * @param {string} fileNameQuery ファイル名検索条件
 * @param {boolean} fileNameRegex 正規表現モード
 * @returns {string | undefined} 警告メッセージ
 */
export function getFileNameRegexMisuseMessage(
	fileNameQuery: string,
	fileNameRegex: boolean,
): string | undefined {
	if (!fileNameRegex) {
		return undefined;
	}

	return getGlobInRegexMisuseMessage(fileNameQuery, 'fileName');
}
