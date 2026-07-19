import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import iconv from 'iconv-lite';
import { logger } from './logger';
import {
	expandEnvString,
	findEsExeOnPath,
	findEsExeViaWhere,
	resolveEverythingCmdHome,
} from './env-resolver';
import { isValidUtf8 } from './encoding';
import { formatFileNameRegexAlternationMessage } from './regex-validation';
import type {
	EsAdditionalArgsValidation,
	EsDetectResult,
	EsSearchRequest,
	EsSearchResult,
	FileNameSearchSettings,
} from './types';

const execFileAsync = promisify(execFile);

/** 既定 es.exe 候補パス */
export const DEFAULT_ES_EXE_PATH = 'C:\\Program Files\\Everything_CLI\\ES-1.1.0.30.x64\\es.exe';

/** Everything SDK の max=0xFFFFFFFF（全件）に相当 */
export const ES_UNLIMITED_MAX_RESULTS = 4294967295;

/** es.exe パイプ出力のコードページ（UTF-8）。タイ語等の非 CP932 文字を含むパス取得に必要 */
export const ES_PIPE_CODE_PAGE = '65001';

/** 内部固定オプション（追加オプションより優先） */
export const INTERNAL_FIXED_OPTIONS = new Set([
	'/a-d',
	'-cp',
	'-code-page',
	'-full-path-and-name',
	'-txt',
	'-n',
	'-max-results',
	'-timeout',
]);

/** 禁止オプション（完全一致・大文字小文字無視） */
const FORBIDDEN_OPTIONS_EXACT = new Set([
	'/ad',
	'-pause',
	'-more',
	'-set-run-count',
	'-inc-run-count',
	'-get-run-count',
	'-save-settings',
	'-clear-settings',
	'-exit',
	'-save-db',
	'-reindex',
	'-get-result-count',
	'-get-total-size',
	'-csv',
	'-efu',
	'-m3u',
	'-m3u8',
	'-tsv',
	'-highlight',
	'-name',
	'-path-column',
	'-extension',
	'-ext',
	'-size',
	'-date-created',
	'-dc',
	'-date-modified',
	'-dm',
	'-date-accessed',
	'-da',
	'-attributes',
	'-attribs',
	'-attrib',
	'-file-list-file-name',
	'-run-count',
	'-date-run',
	'-date-recently-changed',
	'-rc',
	'-no-result-error',
]);

/** 禁止オプション接頭辞 */
const FORBIDDEN_OPTION_PREFIXES = [
	'-export-',
	'-highlight-color',
	'-filename-color',
	'-name-color',
	'-path-color',
	'-extension-color',
	'-size-color',
	'-date-created-color',
	'-dc-color',
	'-date-modified-color',
	'-dm-color',
	'-date-accessed-color',
	'-da-color',
	'-attributes-color',
	'-file-list-filename-color',
	'-run-count-color',
	'-date-run-color',
	'-date-recently-changed-color',
	'-rc-color',
	'-filename-width',
	'-name-width',
	'-path-width',
	'-extension-width',
	'-size-width',
	'-date-created-width',
	'-dc-width',
	'-date-modified-width',
	'-dm-width',
	'-date-accessed-width',
	'-da-width',
	'-attributes-width',
	'-file-list-filename-width',
	'-run-count-width',
	'-date-run-width',
	'-date-recently-changed-width',
	'-rc-width',
];

/** 値を伴う追加オプション */
const OPTIONS_WITH_VALUE = new Set([
	'-cp',
	'-code-page',
	'-offset',
	'-o',
	'-instance',
	'-sort',
	'-path',
	'-parent-path',
	'-parent',
	'-r',
	'-regex',
	'-timeout',
	'-n',
	'-max-results',
]);

/** 拡張子指定で許可する1要素 */
const EXTENSION_TOKEN_PATTERN = /^[\p{L}\p{N}_-]+$/u;

/** 実行中 es.exe プロセス */
let activeEsProcess: ReturnType<typeof spawn> | null = null;

/**
 * es.exe 検出候補パス一覧を返す
 * @param {string} [configuredPath] 設定済みパス
 * @returns {string[]} 候補パス
 */
export function getEsDetectionCandidates(configuredPath?: string): string[] {
	const candidates: string[] = [];

	if (configuredPath?.trim()) {
		candidates.push(expandEnvString(configuredPath.trim()));
	}

	const everythingCmdHome = resolveEverythingCmdHome();

	if (everythingCmdHome) {
		candidates.push(path.join(everythingCmdHome, 'es.exe'));
	}

	const pathCandidate = findEsExeOnPath();

	if (pathCandidate) {
		candidates.push(pathCandidate);
	}

	const whereCandidate = findEsExeViaWhere();

	if (whereCandidate) {
		candidates.push(whereCandidate);
	}

	candidates.push(DEFAULT_ES_EXE_PATH);

	return [...new Set(candidates)];
}

/**
 * es.exe のバージョン文字列を取得する
 * @param {string} esExePath es.exe パス
 * @returns {Promise<string | undefined>} バージョン
 */
async function readEsVersion(esExePath: string): Promise<string | undefined> {
	try {
		const versionResult = await execFileAsync(esExePath, ['-version'], {
			windowsHide: true,
			timeout   : 5000,
			encoding    : 'utf8',
		});
		const versionLine   = `${versionResult.stdout}\n${versionResult.stderr}`
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0);

		if (versionLine) {
			return versionLine;
		}
	} catch {
		// -version 非対応時は /? を試す
	}

	try {
		const helpResult = await execFileAsync(esExePath, ['/?'], {
			windowsHide: true,
			timeout   : 5000,
			encoding    : 'utf8',
		});
		const firstLine  = `${helpResult.stdout}\n${helpResult.stderr}`
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.length > 0);

		return firstLine;
	} catch {
		return undefined;
	}
}

/**
 * es.exe を検出する
 * @param {string} [configuredPath] 設定済みパス
 * @returns {Promise<EsDetectResult>} 検出結果
 */
export async function detectEsExe(configuredPath?: string): Promise<EsDetectResult> {
	const candidates = getEsDetectionCandidates(configuredPath);

	for (const candidate of candidates) {
		if (!fs.existsSync(candidate)) {
			continue;
		}

		const version = await readEsVersion(candidate);

		logger.info('es.exe detected', { path: candidate, version });

		return {
			available: true,
			path     : candidate,
			version,
		};
	}

	logger.warn('es.exe not found', { candidates });

	return {
		available: false,
		path     : configuredPath?.trim() || DEFAULT_ES_EXE_PATH,
		message  : 'es.exe が見つかりません。Everything CLI のインストール、または設定画面からパスを指定してください。',
	};
}

/**
 * 追加オプション文字列をトークン化する
 * @param {string} input 入力文字列
 * @returns {string[]} トークン
 */
export function tokenizeAdditionalArgs(input: string): string[] {
	const tokens: string[] = [];
	let current            = '';
	let inQuotes           = false;

	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];

		if (char === '"') {
			inQuotes = !inQuotes;
			continue;
		}

		if (!inQuotes && /\s/.test(char)) {
			if (current.length > 0) {
				tokens.push(current);
				current = '';
			}

			continue;
		}

		current += char;
	}

	if (current.length > 0) {
		tokens.push(current);
	}

	return tokens;
}

/**
 * オプションが禁止されているか判定する
 * @param {string} token オプション
 * @returns {boolean} 禁止なら true
 */
function isForbiddenOption(token: string): boolean {
	const normalized = token.toLowerCase();

	if (FORBIDDEN_OPTIONS_EXACT.has(normalized)) {
		return true;
	}

	return FORBIDDEN_OPTION_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * 追加オプションを検証する
 * @param {string} additionalArgs 追加オプション文字列
 * @returns {EsAdditionalArgsValidation} 検証結果
 */
export function validateAdditionalArgs(additionalArgs: string): EsAdditionalArgsValidation {
	const tokens             = tokenizeAdditionalArgs(additionalArgs);
	const warnings: string[] = [];
	const errors: string[]   = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const token      = tokens[index];
		const normalized = token.toLowerCase();

		if (!token.startsWith('-') && !token.startsWith('/')) {
			errors.push(`オプション以外のトークンは指定できません: ${token}`);
			continue;
		}

		if (isForbiddenOption(token)) {
			errors.push(`禁止オプションは指定できません: ${token}`);
			continue;
		}

		if (INTERNAL_FIXED_OPTIONS.has(normalized)) {
			warnings.push(`内部固定オプションと競合するため無視されます: ${token}`);

			if (OPTIONS_WITH_VALUE.has(normalized)) {
				index += 1;
			}
		} else if (OPTIONS_WITH_VALUE.has(normalized)) {
			index += 1;
		}
	}

	if (errors.length > 0) {
		return {
			valid   : false,
			args    : [],
			warnings,
			errors,
		};
	}

	const effectiveArgs: string[] = [];

	for (let index = 0; index < tokens.length; index += 1) {
		const token      = tokens[index];
		const normalized = token.toLowerCase();

		if (INTERNAL_FIXED_OPTIONS.has(normalized)) {
			if (OPTIONS_WITH_VALUE.has(normalized)) {
				index += 1;
			}

			continue;
		}

		effectiveArgs.push(token);

		if (OPTIONS_WITH_VALUE.has(normalized)) {
			const next = tokens[index + 1];

			if (next && !next.startsWith('-') && !next.startsWith('/')) {
				index += 1;
				effectiveArgs.push(next);
			}
		}
	}

	return {
		valid: true,
		args : effectiveArgs,
		warnings,
		errors,
	};
}

/**
 * 設定値 maxCandidateFiles を es.exe -n に渡す値へ変換する
 * @param {number} maxCandidateFiles 候補ファイル上限（0=上限なし）
 * @returns {number} es.exe 向け上限値
 */
export function resolveMaxCandidateFilesForEs(maxCandidateFiles: number): number {
	return maxCandidateFiles <= 0 ? ES_UNLIMITED_MAX_RESULTS : maxCandidateFiles;
}

/**
 * 拡張子指定を正規化する
 * @param {string | undefined} targetExtensions 拡張子指定
 * @returns {{ valid: boolean; value: string; message?: string }} 正規化結果
 */
export function normalizeTargetExtensions(targetExtensions?: string): {
	valid: boolean;
	value: string;
	message?: string;
} {
	const raw = targetExtensions?.trim() ?? '';

	if (!raw) {
		return {
			valid: true,
			value: '',
		};
	}

	const extensions = raw
		.split(';')
		.map((extension) => extension.trim().replace(/^\.+/u, ''))
		.filter((extension) => extension.length > 0);

	if (extensions.length === 0) {
		return {
			valid: true,
			value: '',
		};
	}

	const invalid = extensions.find((extension) => !EXTENSION_TOKEN_PATTERN.test(extension));

	if (invalid) {
		return {
			valid  : false,
			value  : '',
			message: `拡張子指定に使用できない文字が含まれています: ${invalid}`,
		};
	}

	return {
		valid: true,
		value: [...new Set(extensions)].join(';'),
	};
}

/**
 * Everything の拡張子フィルタを組み立てる
 * @param {string} normalizedExtensions 正規化済み拡張子指定
 * @returns {string | undefined} Everything 検索条件
 */
export function buildEverythingExtensionFilter(normalizedExtensions: string): string | undefined {
	if (!normalizedExtensions) {
		return undefined;
	}

	return `ext:${normalizedExtensions}`;
}

/**
 * es.exe 引数配列を構築する
 * @param {EsSearchRequest} request 検索リクエスト
 * @returns {{ args: string[]; warnings: string[]; errors: string[] }} 引数構築結果
 */
export function buildEsArgs(request: EsSearchRequest): {
	args: string[];
	warnings: string[];
	errors: string[];
} {
	const warnings: string[] = [];
	const errors: string[]   = [];
	const fileNameQuery      = request.fileNameQuery.trim();
	const extensions         = normalizeTargetExtensions(request.targetExtensions);

	if (!fileNameQuery) {
		errors.push('ファイル名検索条件が空です。');
	}

	if (request.regex && fileNameQuery.includes('|')) {
		errors.push(formatFileNameRegexAlternationMessage());
	}

	if (!extensions.valid && extensions.message) {
		errors.push(extensions.message);
	}

	const additional = validateAdditionalArgs(request.additionalArgs ?? '');

	if (!additional.valid) {
		return {
			args: [],
			warnings: additional.warnings,
			errors: [...errors, ...additional.errors],
		};
	}

	warnings.push(...additional.warnings);

	const args: string[] = [
		'/a-d',
		'-cp',
		ES_PIPE_CODE_PAGE,
		'-full-path-and-name',
		'-txt',
		'-n',
		String(resolveMaxCandidateFilesForEs(request.maxCandidateFiles)),
		'-timeout',
		String(request.timeoutMs),
		'-sort',
		request.sort,
	];

	if (request.targetPath?.trim()) {
		args.push('-path', request.targetPath.trim());
	}

	if (request.caseSensitive) {
		args.push('-case');
	}

	if (request.wholeWord) {
		args.push('-whole-word');
	}

	if (request.matchPath) {
		args.push('-match-path');
	}

	if (request.diacritics) {
		args.push('-diacritics');
	}

	args.push(...additional.args);

	if (request.regex) {
		args.push('-r', fileNameQuery);
	} else {
		args.push(fileNameQuery);
	}

	const extensionFilter = buildEverythingExtensionFilter(extensions.value);

	if (extensionFilter) {
		args.push(extensionFilter);
	}

	return {
		args,
		warnings,
		errors,
	};
}

/**
 * es.exe 出力をファイルパス一覧へ変換する
 * @param {string} stdout 標準出力
 * @returns {string[]} ファイルパス一覧
 */
export function parseEsOutput(stdout: string): string[] {
	return stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

/**
 * es.exe 標準出力をデコードする
 * -cp 65001 指定時は UTF-8 を優先し、不正な UTF-8 の場合のみ CP932 へフォールバックする
 * @param {Buffer} buffer 標準出力バイト列
 * @returns {string} デコード結果
 */
export function decodeEsStdout(buffer: Buffer): string {
	if (buffer.length === 0) {
		return '';
	}

	const utf8 = buffer.toString('utf8');

	if (isValidUtf8(buffer)) {
		return utf8;
	}

	return iconv.decode(buffer, 'cp932');
}

/**
 * es.exe 標準出力チャンクをバッファへ追加する
 * @param {Buffer[]} chunks チャンク配列
 * @param {Buffer | string} chunk 追加チャンク
 * @returns {void}
 */
function appendEsOutputChunk(chunks: Buffer[], chunk: Buffer | string): void {
	chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
}

/**
 * es.exe エラーメッセージを整形する
 * @param {number | null} exitCode 終了コード
 * @param {string} stderr 標準エラー
 * @returns {string} 表示用メッセージ
 */
export function formatEsErrorMessage(exitCode: number | null, stderr: string): string {
	const trimmed = stderr.trim();

	if (trimmed) {
		return trimmed;
	}

	if (exitCode !== null && exitCode !== 0) {
		return `es.exe が終了コード ${exitCode} で終了しました。Everything 本体が起動しているか確認してください。`;
	}

	return 'es.exe の実行に失敗しました。';
}

/**
 * 実行中の es.exe をキャンセルする
 * @returns {boolean} キャンセルしたら true
 */
export function cancelActiveEsSearch(): boolean {
	if (!activeEsProcess || activeEsProcess.killed) {
		activeEsProcess = null;
		return false;
	}

	activeEsProcess.kill();
	activeEsProcess = null;
	logger.info('es.exe process cancelled');
	return true;
}

/**
 * es.exe で候補ファイル一覧を取得する
 * @param {EsSearchRequest} request 検索リクエスト
 * @returns {Promise<EsSearchResult>} 検索結果
 */
export function searchCandidateFiles(request: EsSearchRequest): Promise<EsSearchResult> {
	return new Promise((resolve) => {
		if (!request.esExePath || !fs.existsSync(request.esExePath)) {
			resolve({
				success : false,
				files   : [],
				elapsedMs: 0,
				stderr  : '',
				exitCode: null,
				message : 'es.exe が見つかりません。',
			});
			return;
		}

		const built = buildEsArgs(request);

		if (built.errors.length > 0) {
			resolve({
				success : false,
				files   : [],
				elapsedMs: 0,
				stderr  : '',
				exitCode: null,
				message : built.errors.join('\n'),
				warnings: built.warnings,
			});
			return;
		}

		const startedAt = Date.now();
		const child     = spawn(request.esExePath, built.args, {
			shell      : false,
			windowsHide: true,
			stdio      : ['ignore', 'pipe', 'pipe'],
		});

		activeEsProcess = child;

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];

		child.stdout?.on('data', (chunk: Buffer | string) => {
			appendEsOutputChunk(stdoutChunks, chunk);
		});

		child.stderr?.on('data', (chunk: Buffer | string) => {
			appendEsOutputChunk(stderrChunks, chunk);
		});

		child.on('error', (error) => {
			activeEsProcess = null;
			resolve({
				success  : false,
				files    : [],
				elapsedMs: Date.now() - startedAt,
				stderr   : error.message,
				exitCode : null,
				message  : error.message,
				warnings : built.warnings,
			});
		});

		child.on('close', (exitCode) => {
			activeEsProcess = null;
			const stdout    = decodeEsStdout(Buffer.concat(stdoutChunks));
			const stderr    = decodeEsStdout(Buffer.concat(stderrChunks));
			const files     = parseEsOutput(stdout);
			const elapsedMs = Date.now() - startedAt;

			if (exitCode !== 0) {
				const message = formatEsErrorMessage(exitCode, stderr);

				logger.warn('es.exe search failed', {
					exitCode,
					stderr,
					args: built.args,
				});

				resolve({
					success  : false,
					files,
					elapsedMs,
					stderr,
					exitCode,
					message,
					warnings : built.warnings,
				});
				return;
			}

			logger.info('es.exe search completed', {
				fileCount: files.length,
				elapsedMs,
			});

			resolve({
				success  : true,
				files,
				elapsedMs,
				stderr,
				exitCode,
				warnings : built.warnings,
			});
		});
	});
}

/**
 * 設定から es.exe 検索リクエストを組み立てる
 * @param {object} params パラメータ
 * @param {string} params.esExePath es.exe パス
 * @param {string} params.fileNameQuery ファイル名検索条件
 * @param {string} [params.targetPath] 対象フォルダ
 * @param {boolean} [params.regex] 正規表現モード
 * @param {import('./types').AppSettings['fileNameSearch']} params.fileNameSearch ファイル名検索設定
 * @returns {EsSearchRequest} リクエスト
 */
export function createEsSearchRequest(params: {
	esExePath: string;
	fileNameQuery: string;
	targetPath?: string;
	targetExtensions?: string;
	regex?: boolean;
	fileNameSearch: FileNameSearchSettings;
}): EsSearchRequest {
	return {
		esExePath        : params.esExePath,
		fileNameQuery    : params.fileNameQuery,
		targetPath       : params.targetPath,
		targetExtensions : params.targetExtensions,
		regex            : params.regex ?? false,
		caseSensitive    : params.fileNameSearch.caseSensitive,
		wholeWord        : params.fileNameSearch.wholeWord,
		matchPath        : params.fileNameSearch.matchPath,
		diacritics       : params.fileNameSearch.diacritics,
		maxCandidateFiles: params.fileNameSearch.maxCandidateFiles,
		sort             : params.fileNameSearch.sort,
		timeoutMs        : params.fileNameSearch.timeoutMs,
		additionalArgs   : params.fileNameSearch.additionalArgs,
	};
}
