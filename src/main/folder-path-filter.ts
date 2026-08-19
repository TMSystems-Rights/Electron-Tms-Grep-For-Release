import { expandEnvString } from './env-resolver';

/** フォルダ指定の解析結果 */
export interface FolderPathListResult {
	valid: boolean;
	values: string[];
	message?: string;
}

/** フォルダパスのワイルドカード */
const FOLDER_WILDCARD_PATTERN = /[*?]/u;

/** 未展開の環境変数参照 */
const UNRESOLVED_ENV_PATTERN = /%([^%]+)%/u;

/**
 * カンマ区切り文字列を引用符に配慮して分割する
 * @param {string} raw 入力文字列
 * @returns {{ valid: boolean; values: string[]; message?: string }} 分割結果
 */
function splitCommaSeparatedValues(raw: string): {
	valid: boolean;
	values: string[];
	message?: string;
} {
	const values: string[] = [];
	let current            = '';
	let quoted             = false;

	for (const character of raw) {
		if (character === '"') {
			quoted = !quoted;
			continue;
		}

		if (character === ',' && !quoted) {
			values.push(current);
			current = '';
			continue;
		}

		current += character;
	}

	if (quoted) {
		return {
			valid  : false,
			values : [],
			message: 'ダブルクォートが閉じられていません。',
		};
	}

	values.push(current);

	return {
		valid: true,
		values,
	};
}

/**
 * フォルダパターンの区切り文字と全ドライブ指定を正規化する
 * @param {string} value フォルダパターン
 * @returns {string} 正規化済みパターン
 */
export function normalizeFolderPathPattern(value: string): string {
	let normalized = value.trim().replace(/\//gu, '\\');

	// 要望票の「*\folder」は「任意のドライブ:\folder」として扱う。
	if (/^[*?]\\/u.test(normalized)) {
		normalized = `${normalized[0]}:${normalized.slice(1)}`;
	}

	if (normalized.length > 3 && normalized.endsWith('\\')) {
		normalized = normalized.replace(/\\+$/u, '');
	}

	return normalized;
}

/**
 * フォルダ指定を解析し、環境変数を展開する
 * @param {string | undefined} raw 入力文字列
 * @param {string} label エラーメッセージ用項目名
 * @returns {FolderPathListResult} 解析結果
 */
export function parseFolderPathList(raw?: string, label = 'フォルダ'): FolderPathListResult {
	const source = raw?.trim() ?? '';

	if (!source) {
		return {
			valid : true,
			values: [],
		};
	}

	const split = splitCommaSeparatedValues(source);

	if (!split.valid) {
		return {
			valid  : false,
			values : [],
			message: `${label}指定の${split.message}`,
		};
	}

	const values: string[] = [];
	const seen             = new Set<string>();

	for (const item of split.values) {
		const trimmed = item.trim();

		if (!trimmed) {
			continue;
		}

		const expanded   = expandEnvString(trimmed);
		const unresolved = expanded.match(UNRESOLVED_ENV_PATTERN);

		if (unresolved) {
			return {
				valid  : false,
				values : [],
				message: `${label}指定の環境変数を解決できません: %${unresolved[1]}%`,
			};
		}

		const normalized = normalizeFolderPathPattern(expanded);
		const key        = normalized.toLocaleLowerCase('en-US');

		if (!seen.has(key)) {
			seen.add(key);
			values.push(normalized);
		}
	}

	return {
		valid: true,
		values,
	};
}

/**
 * フォルダパターンがワイルドカードを含むか判定する
 * @param {string} pattern フォルダパターン
 * @returns {boolean} ワイルドカードを含むなら true
 */
export function hasFolderWildcard(pattern: string): boolean {
	return FOLDER_WILDCARD_PATTERN.test(pattern);
}

/**
 * 正規表現のリテラル部分をエスケープする
 * @param {string} value 対象文字列
 * @returns {string} エスケープ済み文字列
 */
function escapeRegExp(value: string): string {
	return value.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
}

/**
 * フォルダパターンをファイルパス照合用正規表現へ変換する
 * @param {string} pattern フォルダパターン
 * @param {boolean} exactFolder 通常パスをフォルダ境界まで完全一致させるか
 * @returns {RegExp} 照合用正規表現
 */
export function buildFolderPathRegExp(pattern: string, exactFolder: boolean): RegExp {
	const normalizedPattern = normalizeFolderPathPattern(pattern);
	let source              = '';

	for (const character of normalizedPattern) {
		if (character === '*') {
			source += '[^\\\\]*';
		} else if (character === '?') {
			source += '[^\\\\]';
		} else {
			source += escapeRegExp(character);
		}
	}

	const boundary = exactFolder
		&& !hasFolderWildcard(pattern)
		&& !normalizedPattern.endsWith('\\')
		? '(?:\\\\|$)'
		: '';

	return new RegExp(`^${source}${boundary}`, 'iu');
}

/**
 * Everything の候補パスへ対象・除外フォルダ条件を適用する
 * @param {string[]} files 候補ファイルパス
 * @param {string[]} targetPatterns 対象フォルダパターン（OR）
 * @param {string[]} excludePatterns 除外フォルダパターン（OR）
 * @param {number} maxResults 最大件数（0=上限なし）
 * @returns {string[]} 絞り込み済みパス
 */
export function filterCandidatePaths(
	files: string[],
	targetPatterns: string[],
	excludePatterns: string[],
	maxResults: number,
): string[] {
	const targetMatchers = targetPatterns.map((pattern) => buildFolderPathRegExp(pattern, true));
	// 要望票の例に合わせ、除外の通常パスは前方一致とする。
	const excludeMatchers    = excludePatterns.map((pattern) => buildFolderPathRegExp(pattern, false));
	const filtered: string[] = [];
	const seen               = new Set<string>();

	for (const file of files) {
		const normalized = file.replace(/\//gu, '\\');
		const key        = normalized.toLocaleLowerCase('en-US');
		const included   = targetMatchers.length === 0
			|| targetMatchers.some((matcher) => matcher.test(normalized));
		const excluded   = excludeMatchers.some((matcher) => matcher.test(normalized));

		if (!included || excluded || seen.has(key)) {
			continue;
		}

		seen.add(key);
		filtered.push(file);

		if (maxResults > 0 && filtered.length >= maxResults) {
			break;
		}
	}

	return filtered;
}

/**
 * 単一対象パターンから es.exe の -path に渡せる固定範囲を求める
 * @param {string[]} targetPatterns 対象フォルダパターン
 * @returns {string | undefined} 固定検索範囲
 */
export function resolveEsTargetScope(targetPatterns: string[]): string | undefined {
	if (targetPatterns.length !== 1) {
		return undefined;
	}

	const pattern       = targetPatterns[0];
	const wildcardIndex = pattern.search(FOLDER_WILDCARD_PATTERN);

	if (wildcardIndex < 0) {
		return pattern;
	}

	const fixedPrefix = pattern.slice(0, wildcardIndex);

	if (!fixedPrefix) {
		return undefined;
	}

	if (fixedPrefix.endsWith('\\')) {
		return fixedPrefix;
	}

	const separatorIndex = fixedPrefix.lastIndexOf('\\');
	const directory      = separatorIndex >= 2
		? fixedPrefix.slice(0, separatorIndex)
		: undefined;

	return directory && /^[A-Za-z]:$/u.test(directory)
		? `${directory}\\`
		: directory;
}
