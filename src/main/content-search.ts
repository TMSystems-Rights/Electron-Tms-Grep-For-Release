import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { isBinaryFileBuffer } from './binary-detect';
import { readTextFile, splitLines } from './encoding';
import { logger } from './logger';
import { validateRegexPattern } from './regex-validation';
import type {
	ContentSearchProgress,
	ContentSearchRequest,
	ContentSearchResult,
	RegexValidationResult,
	SearchHit,
} from './types';

/** 検索コールバック */
export interface ContentSearchCallbacks {
	onHit?: (hit: SearchHit) => void;
	onProgress?: (progress: ContentSearchProgress) => void;
	isCancelled?: () => boolean;
}

/** 行ループ中のキャンセル確認間隔 */
const LINE_CANCEL_CHECK_INTERVAL = 200;

/**
 * イベントループへ制御を返す
 * @returns {Promise<void>}
 */
export function yieldToEventLoop(): Promise<void> {
	return new Promise((resolve) => {
		setImmediate(resolve);
	});
}

/**
 * 本文正規表現を検証する
 * @param {string} query 正規表現
 * @param {boolean} caseSensitive 大文字小文字区別
 * @returns {RegexValidationResult} 検証結果
 */
export function validateContentRegex(
	query: string,
	caseSensitive: boolean,
): RegexValidationResult {
	return validateRegexPattern(query, {
		emptyMessage : 'ファイル内検索条件が空です。',
		context      : 'content',
		caseSensitive,
		contentSearch: true,
	});
}

/**
 * 通常検索の一致位置を取得する
 * @param {string} line 行テキスト
 * @param {string} query 検索文字列
 * @param {boolean} caseSensitive 大文字小文字区別
 * @returns {Array<{ start: number; end: number }>} 一致範囲
 */
export function findLiteralMatches(
	line: string,
	query: string,
	caseSensitive: boolean,
): Array<{ start: number; end: number }> {
	if (!query) {
		return [];
	}

	const ranges: Array<{ start: number; end: number }> = [];
	const sourceLine                                    = caseSensitive ? line : line.toLowerCase();
	const sourceQuery                                   = caseSensitive ? query : query.toLowerCase();
	let startIndex                                      = 0;

	while (startIndex <= sourceLine.length) {
		const foundAt = sourceLine.indexOf(sourceQuery, startIndex);

		if (foundAt < 0) {
			break;
		}

		ranges.push({
			start: foundAt,
			end  : foundAt + query.length,
		});

		startIndex = foundAt + (query.length > 0 ? query.length : 1);
	}

	return ranges;
}

/**
 * 正規表現検索の一致位置を取得する
 * @param {string} line 行テキスト
 * @param {RegExp} pattern 正規表現
 * @returns {Array<{ start: number; end: number }>} 一致範囲
 */
export function findRegexMatches(
	line: string,
	pattern: RegExp,
): Array<{ start: number; end: number }> {
	const ranges: Array<{ start: number; end: number }> = [];
	const matcher                                       = new RegExp(pattern.source, pattern.flags);
	let match                                           = matcher.exec(line);

	while (match) {
		if (match.index === undefined) {
			break;
		}

		ranges.push({
			start: match.index,
			end  : match.index + match[0].length,
		});

		if (match[0].length === 0) {
			matcher.lastIndex += 1;
		}

		match = matcher.exec(line);
	}

	return ranges;
}

/**
 * 1行を検索する
 * @param {object} params パラメータ
 * @returns {SearchHit | null} ヒット
 */
export function searchLine(params: {
	filePath: string;
	lineNumber: number;
	lineText: string;
	query: string;
	regex: boolean;
	caseSensitive: boolean;
}): SearchHit | null {
	const { filePath, lineNumber, lineText, query, regex, caseSensitive } = params;
	let ranges: Array<{ start: number; end: number }>                     = [];

	if (regex) {
		const flags   = `${caseSensitive ? '' : 'i'}gu`;
		const pattern = new RegExp(query, flags);

		ranges = findRegexMatches(lineText, pattern);
	} else {
		ranges = findLiteralMatches(lineText, query, caseSensitive);
	}

	if (ranges.length === 0) {
		return null;
	}

	return {
		id           : randomUUID(),
		filePath,
		lineNumber,
		columnNumber : ranges[0].start + 1,
		hitCountInLine: ranges.length,
		lineText,
		matchRanges  : ranges,
	};
}

/**
 * 1ファイルを非同期検索する
 * @param {string} filePath ファイルパス
 * @param {ContentSearchRequest} request リクエスト
 * @param {() => boolean} [isCancelled] キャンセル判定
 * @returns {Promise<{ hits: SearchHit[]; skipped: boolean; errored: boolean; aborted: boolean }>} 結果
 */
export async function searchSingleFileAsync(
	filePath: string,
	request: ContentSearchRequest,
	isCancelled?: () => boolean,
): Promise<{ hits: SearchHit[]; skipped: boolean; errored: boolean; aborted: boolean }> {
	if (isCancelled?.()) {
		return { hits: [], skipped: false, errored: false, aborted: true };
	}

	try {
		const stat = fs.statSync(filePath);

		if (!stat.isFile()) {
			return { hits: [], skipped: true, errored: false, aborted: false };
		}

		if (stat.size > request.maxFileSizeBytes) {
			return { hits: [], skipped: true, errored: false, aborted: false };
		}

		const sampleSize = Math.min(stat.size, 8192);
		const sample     = Buffer.alloc(sampleSize);

		if (sampleSize > 0) {
			const fd = fs.openSync(filePath, 'r');

			try {
				fs.readSync(fd, sample, 0, sampleSize, 0);
			} finally {
				fs.closeSync(fd);
			}
		}

		if (request.skipBinary && isBinaryFileBuffer(sample)) {
			return { hits: [], skipped: true, errored: false, aborted: false };
		}

		const { content }       = readTextFile(filePath, request.encoding);
		const lines             = splitLines(content);
		const hits: SearchHit[] = [];

		for (let index = 0; index < lines.length; index += 1) {
			if (index > 0 && index % LINE_CANCEL_CHECK_INTERVAL === 0) {
				if (isCancelled?.()) {
					return { hits, skipped: false, errored: false, aborted: true };
				}

				await yieldToEventLoop();
			}

			const hit = searchLine({
				filePath,
				lineNumber: index + 1,
				lineText  : lines[index],
				query     : request.query,
				regex     : request.regex,
				caseSensitive: request.caseSensitive,
			});

			if (hit) {
				hits.push(hit);
			}
		}

		return { hits, skipped: false, errored: false, aborted: false };
	} catch (error) {
		logger.warn('Failed to search file', {
			filePath,
			error: error instanceof Error ? error.message : String(error),
		});

		return { hits: [], skipped: false, errored: true, aborted: false };
	}
}

/**
 * 1ファイルを検索する
 * @param {string} filePath ファイルパス
 * @param {ContentSearchRequest} request リクエスト
 * @returns {{ hits: SearchHit[]; skipped: boolean; errored: boolean }} 結果
 */
export function searchSingleFile(
	filePath: string,
	request: ContentSearchRequest,
): { hits: SearchHit[]; skipped: boolean; errored: boolean } {
	try {
		const stat = fs.statSync(filePath);

		if (!stat.isFile()) {
			return { hits: [], skipped: true, errored: false };
		}

		if (stat.size > request.maxFileSizeBytes) {
			return { hits: [], skipped: true, errored: false };
		}

		const sampleSize = Math.min(stat.size, 8192);
		const sample     = Buffer.alloc(sampleSize);

		if (sampleSize > 0) {
			const fd = fs.openSync(filePath, 'r');

			try {
				fs.readSync(fd, sample, 0, sampleSize, 0);
			} finally {
				fs.closeSync(fd);
			}
		}

		if (request.skipBinary && isBinaryFileBuffer(sample)) {
			return { hits: [], skipped: true, errored: false };
		}

		const { content }       = readTextFile(filePath, request.encoding);
		const lines             = splitLines(content);
		const hits: SearchHit[] = [];

		for (let index = 0; index < lines.length; index += 1) {
			const hit = searchLine({
				filePath,
				lineNumber: index + 1,
				lineText  : lines[index],
				query     : request.query,
				regex     : request.regex,
				caseSensitive: request.caseSensitive,
			});

			if (hit) {
				hits.push(hit);
			}
		}

		return { hits, skipped: false, errored: false };
	} catch (error) {
		logger.warn('Failed to search file', {
			filePath,
			error: error instanceof Error ? error.message : String(error),
		});

		return { hits: [], skipped: false, errored: true };
	}
}

/**
 * 複数ファイルを並列検索する
 * @param {ContentSearchRequest} request リクエスト
 * @param {ContentSearchCallbacks} [callbacks] コールバック
 * @returns {Promise<ContentSearchResult>} 検索結果
 */
export async function searchInFiles(
	request: ContentSearchRequest,
	callbacks: ContentSearchCallbacks = {},
): Promise<ContentSearchResult> {
	if (request.regex) {
		const validation = validateContentRegex(request.query, request.caseSensitive);

		if (!validation.valid) {
			throw new Error(validation.message ?? '正規表現が不正です。');
		}
	}

	const hits: SearchHit[] = [];
	let searchedFileCount   = 0;
	let skippedCount        = 0;
	let errorCount          = 0;
	let cancelled           = false;
	let stoppedByMaxRows    = false;
	const totalFileCount    = request.files.length;
	const concurrency       = Math.max(1, request.concurrency);
	let nextFileIndex       = 0;

	/**
	 *
	 */
	const notifyProgress = (): void => {
		callbacks.onProgress?.({
			searchedFileCount,
			totalFileCount,
			hitCount: hits.length,
			skippedCount,
			errorCount,
		});
	};

	/**
	 *
	 */
	const worker = async (): Promise<void> => {
		while (true) {
			await yieldToEventLoop();

			if (callbacks.isCancelled?.()) {
				cancelled = true;
				return;
			}

			if (stoppedByMaxRows) {
				return;
			}

			const fileIndex = nextFileIndex;

			nextFileIndex += 1;

			if (fileIndex >= request.files.length) {
				return;
			}

			const filePath = request.files[fileIndex];
			const result   = await searchSingleFileAsync(
				path.resolve(filePath),
				request,
				callbacks.isCancelled,
			);

			if (result.aborted) {
				cancelled = true;
				return;
			}

			searchedFileCount += 1;

			if (result.skipped) {
				skippedCount += 1;
			}

			if (result.errored) {
				errorCount += 1;
			}

			for (const hit of result.hits) {
				if (request.maxRows > 0 && hits.length >= request.maxRows) {
					stoppedByMaxRows = true;
					break;
				}

				hits.push(hit);
				callbacks.onHit?.(hit);
			}

			notifyProgress();
		}
	};

	const workers = Array.from(
		{ length: Math.min(concurrency, Math.max(totalFileCount, 1)) },
		() => worker(),
	);

	await Promise.all(workers);

	return {
		hits,
		searchedFileCount,
		skippedCount,
		errorCount,
		cancelled,
		stoppedByMaxRows,
	};
}
