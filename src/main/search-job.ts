import fs from 'node:fs';
import {
	cancelActiveEsSearch,
	createEsSearchRequest,
	detectEsExe,
	normalizeTargetExtensions,
	searchCandidateFiles,
} from './es-adapter';
import { searchInFiles, validateContentRegex } from './content-search';
import { updateLastSearch } from './config-store';
import { logger } from './logger';
import { validateRegexPattern } from './regex-validation';
import type {
	AppConfig,
	ContentSearchRequest,
	EsSearchResult,
	SearchJobComplete,
	SearchJobProgress,
	SearchJobState,
	SearchStartPayload,
	SearchStartResult,
} from './types';

/** 検索ジョブ通知 */
export interface SearchJobNotifier {
	onStateChange?: (state: SearchJobState) => void;
	onProgress?: (progress: SearchJobProgress) => void;
	onHit?: (hit: import('./types').SearchHit) => void;
	onComplete?: (result: SearchJobComplete) => void;
}

/** 空白除去後の文字数を返す */
export function trimmedContentLength(value: string): number {
	return value.replace(/[\s\u3000]+/g, '').length;
}

export { getFileNameRegexMisuseMessage } from './regex-validation';

/**
 * ファイル名検索条件を検証する
 * @param {string} fileNameQuery ファイル名検索条件
 * @param {boolean} fileNameRegex 正規表現モード
 * @returns {{ valid: boolean; message?: string }} 検証結果
 */
export function validateFileNameQueryInput(
	fileNameQuery: string,
	fileNameRegex: boolean,
): { valid: boolean; message?: string } {
	const query = fileNameQuery.trim();

	if (trimmedContentLength(query) <= 0) {
		return {
			valid  : false,
			message: 'ファイル名検索条件が空です。',
		};
	}

	if (!fileNameRegex) {
		return { valid: true };
	}

	const regexValidation = validateRegexPattern(query, {
		emptyMessage: 'ファイル名検索条件が空です。',
		context     : 'fileName',
	});

	return regexValidation;
}

/** 現在の検索ジョブ状態 */
let currentState: SearchJobState = 'idle';

/** キャンセル要求フラグ */
let cancelRequested = false;

/** ジョブ開始時刻 */
let jobStartedAt = 0;

/**
 * 検索ジョブ状態を取得する
 * @returns {SearchJobState} 状態
 */
export function getSearchJobState(): SearchJobState {
	return currentState;
}

/**
 * 検索ジョブが実行中か判定する
 * @returns {boolean} 実行中なら true
 */
export function isSearchJobRunning(): boolean {
	return currentState === 'running-es' || currentState === 'searching-content';
}

/**
 * 状態を更新する
 * @param {SearchJobState} state 新しい状態
 * @param {SearchJobNotifier} [notifier] 通知先
 * @returns {void}
 */
function setState(state: SearchJobState, notifier?: SearchJobNotifier): void {
	currentState = state;
	notifier?.onStateChange?.(state);
}

/**
 * 経過ミリ秒を返す
 * @returns {number} 経過ミリ秒
 */
function elapsedMs(): number {
	return jobStartedAt > 0 ? Date.now() - jobStartedAt : 0;
}

/**
 * 検索開始入力を検証する
 * @param {SearchStartPayload} payload 入力
 * @param {AppConfig['settings']['contentSearch']} contentSettings 本文検索設定
 * @returns {{ valid: boolean; message?: string }} 検証結果
 */
export function validateSearchStartPayload(
	payload: SearchStartPayload,
	contentSettings: AppConfig['settings']['contentSearch'],
): { valid: boolean; message?: string } {
	const fileNameQuery = payload.fileNameQuery?.trim() ?? '';
	const contentQuery  = payload.contentQuery?.trim() ?? '';
	const targetPath    = payload.targetPath?.trim() ?? '';
	const extensions    = normalizeTargetExtensions(payload.targetExtensions);

	if (trimmedContentLength(fileNameQuery) <= 0) {
		return {
			valid  : false,
			message: 'ファイル名検索条件を入力してください。',
		};
	}

	if (trimmedContentLength(contentQuery) <= 0) {
		return {
			valid  : false,
			message: 'ファイル内検索条件を入力してください。',
		};
	}

	if (!extensions.valid) {
		return {
			valid  : false,
			message: extensions.message,
		};
	}

	const fileNameValidation = validateFileNameQueryInput(
		fileNameQuery,
		payload.fileNameRegex ?? false,
	);

	if (!fileNameValidation.valid) {
		return {
			valid  : false,
			message: fileNameValidation.message,
		};
	}

	if (payload.contentRegex) {
		const validation = validateContentRegex(contentQuery, contentSettings.caseSensitive);

		if (!validation.valid) {
			return {
				valid  : false,
				message: validation.message,
			};
		}
	}

	if (targetPath && !fs.existsSync(targetPath)) {
		return {
			valid  : false,
			message: `対象フォルダが存在しません: ${targetPath}`,
		};
	}

	if (targetPath && fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) {
		return {
			valid  : false,
			message: `対象フォルダはディレクトリである必要があります: ${targetPath}`,
		};
	}

	return { valid: true };
}

/**
 * 検索完了メッセージを組み立てる
 * @param {SearchJobComplete} complete 完了結果
 * @returns {string | undefined} メッセージ
 */
function buildSearchCompleteMessage(complete: SearchJobComplete): string | undefined {
	if (complete.message) {
		return complete.message;
	}

	if (complete.state === 'cancelled') {
		return '検索をキャンセルしました。';
	}

	if (complete.state === 'failed') {
		return undefined;
	}

	if (complete.hitCount === 0) {
		return '候補ファイル内に一致する箇所はありません。';
	}

	const parts = [`検索完了 — ヒット ${complete.hitCount} 件`];

	if (complete.skippedCount > 0) {
		parts.push(`スキップ ${complete.skippedCount} 件`);
	}

	if (complete.errorCount > 0) {
		parts.push(`読取エラー ${complete.errorCount} 件`);
	}

	return parts.join(' / ');
}

/**
 * 検索ジョブ完了ログを出力する
 * @param {SearchJobComplete} complete 完了結果
 * @returns {void}
 */
function logSearchJobFinished(complete: SearchJobComplete): void {
	const context = {
		state             : complete.state,
		candidateFileCount: complete.candidateFileCount,
		searchedFileCount : complete.searchedFileCount,
		hitCount          : complete.hitCount,
		skippedCount      : complete.skippedCount,
		errorCount        : complete.errorCount,
		elapsedMs         : complete.elapsedMs,
	};

	if (complete.state === 'failed') {
		logger.error('Search job failed', context);
		return;
	}

	if (complete.errorCount > 0 || complete.skippedCount > 0) {
		logger.warn('Search job finished with warnings', context);
		return;
	}

	logger.info('Search job finished', context);
}

/**
 * 設定からファイル内検索リクエストを組み立てる
 * @param {object} params パラメータ
 * @returns {ContentSearchRequest} リクエスト
 */
export function createContentSearchRequest(params: {
	files: string[];
	contentQuery: string;
	contentRegex: boolean;
	config: AppConfig;
}): ContentSearchRequest {
	const { files, contentQuery, contentRegex, config } = params;
	const { contentSearch, results }                    = config.settings;

	return {
		files,
		query           : contentQuery.trim(),
		regex           : contentRegex,
		caseSensitive   : contentSearch.caseSensitive,
		encoding        : contentSearch.encoding,
		maxFileSizeBytes: contentSearch.maxFileSizeMb * 1024 * 1024,
		skipBinary      : contentSearch.skipBinary,
		concurrency     : contentSearch.concurrency,
		maxRows         : results.maxRows,
	};
}

/**
 * 検索ジョブをキャンセルする
 * @returns {boolean} キャンセル要求を受け付けたら true
 */
export function cancelSearchJob(): boolean {
	if (!isSearchJobRunning()) {
		return false;
	}

	cancelRequested = true;
	cancelActiveEsSearch();
	logger.info('Search job cancel requested');
	return true;
}

/**
 * 検索ジョブを開始する
 * @param {object} params パラメータ
 * @returns {Promise<SearchStartResult>} 開始結果
 */
export async function startSearchJob(params: {
	config: AppConfig;
	payload: SearchStartPayload;
	notifier?: SearchJobNotifier;
}): Promise<SearchStartResult> {
	const { config, payload, notifier } = params;

	if (isSearchJobRunning()) {
		return {
			success: false,
			message: '検索ジョブが既に実行中です。',
			state  : currentState,
		};
	}

	const validation = validateSearchStartPayload(payload, config.settings.contentSearch);

	if (!validation.valid) {
		return {
			success: false,
			message: validation.message,
			state  : 'idle',
		};
	}

	cancelRequested = false;
	jobStartedAt    = Date.now();

	const detect = await detectEsExe(config.settings.esExePath);

	if (!detect.available) {
		return {
			success: false,
			message: detect.message ?? 'es.exe が利用できません。',
			state  : 'idle',
		};
	}

	setState('running-es', notifier);
	notifier?.onProgress?.({
		state             : 'running-es',
		candidateFileCount: 0,
		searchedFileCount : 0,
		totalFileCount    : 0,
		hitCount          : 0,
		skippedCount      : 0,
		errorCount        : 0,
		elapsedMs         : elapsedMs(),
	});

	const esRequest = createEsSearchRequest({
		esExePath     : detect.path,
		fileNameQuery : payload.fileNameQuery.trim(),
		targetPath    : payload.targetPath?.trim() || undefined,
		targetExtensions: payload.targetExtensions?.trim() || undefined,
		regex         : payload.fileNameRegex ?? false,
		fileNameSearch: config.settings.fileNameSearch,
	});

	let esResult: EsSearchResult;

	try {
		esResult = await searchCandidateFiles(esRequest);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		setState('failed', notifier);
		const complete: SearchJobComplete = {
			state             : 'failed',
			candidateFileCount: 0,
			searchedFileCount : 0,
			hitCount          : 0,
			skippedCount      : 0,
			errorCount        : 1,
			elapsedMs         : elapsedMs(),
			stoppedByMaxRows  : false,
			message,
		};

		notifier?.onComplete?.(complete);
		setState('idle', notifier);

		return {
			success: false,
			message,
			state  : 'failed',
		};
	}

	if (cancelRequested) {
		const complete: SearchJobComplete = {
			state             : 'cancelled',
			candidateFileCount: esResult.files.length,
			searchedFileCount : 0,
			hitCount          : 0,
			skippedCount      : 0,
			errorCount        : 0,
			elapsedMs         : elapsedMs(),
			stoppedByMaxRows  : false,
			message           : '検索をキャンセルしました。',
		};

		setState('cancelled', notifier);
		notifier?.onComplete?.(complete);
		setState('idle', notifier);

		return {
			success: true,
			state  : 'cancelled',
		};
	}

	if (!esResult.success) {
		const complete: SearchJobComplete = {
			state             : 'failed',
			candidateFileCount: esResult.files.length,
			searchedFileCount : 0,
			hitCount          : 0,
			skippedCount      : 0,
			errorCount        : 1,
			elapsedMs         : elapsedMs(),
			stoppedByMaxRows  : false,
			message           : esResult.message,
			warnings          : esResult.warnings,
		};

		setState('failed', notifier);
		notifier?.onComplete?.(complete);
		setState('idle', notifier);

		return {
			success: false,
			message: esResult.message,
			state  : 'failed',
		};
	}

	const candidateFiles = esResult.files;

	notifier?.onProgress?.({
		state             : 'running-es',
		candidateFileCount: candidateFiles.length,
		searchedFileCount : 0,
		totalFileCount    : candidateFiles.length,
		hitCount          : 0,
		skippedCount      : 0,
		errorCount        : 0,
		elapsedMs         : elapsedMs(),
	});

	if (cancelRequested) {
		const complete: SearchJobComplete = {
			state             : 'cancelled',
			candidateFileCount: candidateFiles.length,
			searchedFileCount : 0,
			hitCount          : 0,
			skippedCount      : 0,
			errorCount        : 0,
			elapsedMs         : elapsedMs(),
			stoppedByMaxRows  : false,
			message           : '検索をキャンセルしました。',
		};

		setState('cancelled', notifier);
		notifier?.onComplete?.(complete);
		setState('idle', notifier);

		return {
			success: true,
			state  : 'cancelled',
		};
	}

	if (candidateFiles.length === 0) {
		const complete: SearchJobComplete = {
			state             : 'completed',
			candidateFileCount: 0,
			searchedFileCount : 0,
			hitCount          : 0,
			skippedCount      : 0,
			errorCount        : 0,
			elapsedMs         : elapsedMs(),
			stoppedByMaxRows  : false,
			message           : 'ファイル名検索条件に一致する候補ファイルはありません。',
			warnings          : esResult.warnings,
		};

		setState('completed', notifier);
		notifier?.onComplete?.(complete);
		setState('idle', notifier);

		void updateLastSearch({
			fileNameQuery: payload.fileNameQuery.trim(),
			contentQuery : payload.contentQuery.trim(),
			targetPath   : payload.targetPath?.trim() ?? '',
			targetExtensions: payload.targetExtensions?.trim() ?? '',
			fileNameRegex: payload.fileNameRegex ?? false,
			contentRegex : payload.contentRegex ?? false,
		});

		return {
			success: true,
			state  : 'completed',
		};
	}

	setState('searching-content', notifier);

	const contentRequest = createContentSearchRequest({
		files       : candidateFiles,
		contentQuery: payload.contentQuery,
		contentRegex: payload.contentRegex ?? false,
		config,
	});

	let contentResult;

	try {
		contentResult = await searchInFiles(contentRequest, {
			/**
			 *
			 */
			onHit: (hit) => {
				notifier?.onHit?.(hit);
			},
			/**
			 *
			 */
			onProgress: (progress) => {
				notifier?.onProgress?.({
					state             : 'searching-content',
					candidateFileCount: candidateFiles.length,
					searchedFileCount : progress.searchedFileCount,
					totalFileCount    : progress.totalFileCount,
					hitCount          : progress.hitCount,
					skippedCount      : progress.skippedCount,
					errorCount        : progress.errorCount,
					elapsedMs         : elapsedMs(),
				});
			},
			/**
			 *
			 */
			isCancelled: () => cancelRequested,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);

		setState('failed', notifier);
		const complete: SearchJobComplete = {
			state             : 'failed',
			candidateFileCount: candidateFiles.length,
			searchedFileCount : 0,
			hitCount          : 0,
			skippedCount      : 0,
			errorCount        : 1,
			elapsedMs         : elapsedMs(),
			stoppedByMaxRows  : false,
			message,
		};

		notifier?.onComplete?.(complete);
		setState('idle', notifier);

		return {
			success: false,
			message,
			state  : 'failed',
		};
	}

	const finalState: SearchJobState = cancelRequested || contentResult.cancelled
		? 'cancelled'
		: 'completed';

	const complete: SearchJobComplete = {
		state             : finalState,
		candidateFileCount: candidateFiles.length,
		searchedFileCount : contentResult.searchedFileCount,
		hitCount          : contentResult.hits.length,
		skippedCount      : contentResult.skippedCount,
		errorCount        : contentResult.errorCount,
		elapsedMs         : elapsedMs(),
		stoppedByMaxRows  : contentResult.stoppedByMaxRows,
		message           : contentResult.stoppedByMaxRows
			? '結果表示上限に到達したため停止しました。'
			: undefined,
		warnings: esResult.warnings,
	};

	complete.message = buildSearchCompleteMessage(complete);

	setState(finalState, notifier);
	notifier?.onComplete?.(complete);
	setState('idle', notifier);

	void updateLastSearch({
		fileNameQuery: payload.fileNameQuery.trim(),
		contentQuery : payload.contentQuery.trim(),
		targetPath   : payload.targetPath?.trim() ?? '',
		targetExtensions: payload.targetExtensions?.trim() ?? '',
		fileNameRegex: payload.fileNameRegex ?? false,
		contentRegex : payload.contentRegex ?? false,
	});

	logSearchJobFinished(complete);

	return {
		success: true,
		state  : finalState,
	};
}

/**
 * テスト用に検索ジョブ状態をリセットする
 * @returns {void}
 */
export function resetSearchJobStateForTest(): void {
	currentState    = 'idle';
	cancelRequested = false;
	jobStartedAt    = 0;
}

/**
 * テスト用に検索ジョブ状態を設定する
 * @param {SearchJobState} state 状態
 * @returns {void}
 */
export function setSearchJobStateForTest(state: SearchJobState): void {
	currentState = state;
}
