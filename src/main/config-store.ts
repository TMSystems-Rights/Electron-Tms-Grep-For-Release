import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { logger } from './logger';
import type { AppConfig, AppSettings, LastSearch, LoadConfigResult, ResetSettingResult, SaveConfigResult } from './types';
import {
	clampWindowSize,
	getWindowSizeLimits,
} from './window';

/** 現行スキーマバージョン */
export const CURRENT_SCHEMA_VERSION = 1;

/** バックアップ保持世代数 */
const BACKUP_RETENTION_COUNT = 10;

/** 設定ファイル名 */
const CONFIG_FILE_NAME = 'config.json';

/** インメモリキャッシュ */
let cachedConfig: AppConfig | null = null;

/**
 * 既定設定を生成する
 * @returns {AppConfig} 既定 config
 */
export function createDefaultConfig(): AppConfig {
	return {
		schemaVersion: CURRENT_SCHEMA_VERSION,
		window       : {
			width : 1100,
			height: 760,
		},
		settings: {
			theme              : 'system',
			confirmBeforeSearch: true,
			restoreLastSearch  : true,
			esExePath          : '',
			fileNameSearch     : {
				regex            : false,
				caseSensitive    : false,
				wholeWord        : false,
				matchPath        : false,
				diacritics       : false,
				maxCandidateFiles: 5000,
				sort             : 'path-ascending',
				timeoutMs        : 30000,
				additionalArgs   : '',
			},
			contentSearch: {
				regex         : false,
				caseSensitive : false,
				encoding      : 'auto',
				maxFileSizeMb : 20,
				skipBinary    : true,
				concurrency   : 4,
			},
			results: {
				maxRows       : 10000,
				copyFormat    : 'grep',
				copyLineEnding: 'crlf',
				tabHandling   : 'preserve',
				tabSize       : 4,
				trimLineText  : false,
			},
			keybindings: {
				toggleFileNameRegex: 'Ctrl+R',
				toggleContentRegex : 'Ctrl+Shift+R',
				runSearch          : 'Ctrl+Enter',
				clear              : 'Ctrl+Shift+C',
			},
		},
		lastSearch: {
			fileNameQuery: '',
			contentQuery : '',
			targetPath   : '',
			targetExtensions: '',
			fileNameRegex: false,
			contentRegex : false,
		},
	};
}

/** リセット可能な設定項目キー（settings 配下の dot 記法） */
const RESETTABLE_SETTING_KEYS = new Set([
	'theme',
	'confirmBeforeSearch',
	'restoreLastSearch',
	'esExePath',
	'fileNameSearch.regex',
	'fileNameSearch.caseSensitive',
	'fileNameSearch.wholeWord',
	'fileNameSearch.matchPath',
	'fileNameSearch.diacritics',
	'fileNameSearch.maxCandidateFiles',
	'fileNameSearch.sort',
	'fileNameSearch.timeoutMs',
	'fileNameSearch.additionalArgs',
	'contentSearch.regex',
	'contentSearch.caseSensitive',
	'contentSearch.encoding',
	'contentSearch.maxFileSizeMb',
	'contentSearch.skipBinary',
	'contentSearch.concurrency',
	'results.maxRows',
	'results.copyFormat',
	'results.copyLineEnding',
	'results.tabHandling',
	'results.tabSize',
	'results.trimLineText',
	'keybindings.toggleFileNameRegex',
	'keybindings.toggleContentRegex',
	'keybindings.runSearch',
	'keybindings.clear',
]);

/**
 * 数値を範囲内に収める
 * @param {number} value 値
 * @param {number} min 最小
 * @param {number} max 最大
 * @param {number} fallback 不正時の代替値
 * @returns {number} 調整後
 */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.min(Math.max(Math.round(value), min), max);
}

/**
 * 候補ファイル上限を正規化する（0=上限なし）
 * @param {unknown} value 値
 * @param {number} fallback 不正時の代替値
 * @returns {number} 正規化後
 */
function normalizeMaxCandidateFiles(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	const rounded = Math.round(value);

	if (rounded === 0) {
		return 0;
	}

	return Math.min(Math.max(rounded, 1), 100000);
}

/**
 * 最大表示行数を正規化する（0=上限なし）
 * @param {unknown} value 値
 * @param {number} fallback 不正時の代替値
 * @returns {number} 正規化後
 */
function normalizeMaxRows(value: unknown, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	const rounded = Math.round(value);

	if (rounded === 0) {
		return 0;
	}

	return Math.min(Math.max(rounded, 1), 1000000);
}

/**
 * settings を検証・正規化する
 * @param {Partial<AppSettings>} settings 設定
 * @returns {AppSettings} 正規化後 settings
 */
function normalizeSettings(settings: Partial<AppSettings> = {}): AppSettings {
	const defaults = createDefaultConfig().settings;
	const merged   = {
		...defaults,
		...settings,
		fileNameSearch: {
			...defaults.fileNameSearch,
			...settings.fileNameSearch,
		},
		contentSearch: {
			...defaults.contentSearch,
			...settings.contentSearch,
		},
		results: {
			...defaults.results,
			...settings.results,
		},
		keybindings: {
			...defaults.keybindings,
			...settings.keybindings,
		},
	};

	const themeValues: AppSettings['theme'][]                              = ['system', 'dark', 'light'];
	const encodingValues: AppSettings['contentSearch']['encoding'][]       = [
		'auto', 'utf8', 'utf16le', 'utf16be', 'cp932',
	];
	const copyFormatValues: AppSettings['results']['copyFormat'][]         = [
		'grep',
		'tsv',
		'markdown-codeblock',
		'markdown-table',
		'markdown-table-aligned',
		'paths',
	];
	const copyLineEndingValues: AppSettings['results']['copyLineEnding'][] = [
		'crlf', 'cr', 'lf',
	];
	const tabHandlingValues: AppSettings['results']['tabHandling'][]       = [
		'preserve', 'replace-all', 'replace-indent',
	];
	const sortValues: AppSettings['fileNameSearch']['sort'][]              = [
		'path-ascending',
		'path-descending',
		'name-ascending',
		'name-descending',
		'size-ascending',
		'size-descending',
		'date-modified-ascending',
		'date-modified-descending',
	];

	return {
		...merged,
		theme              : themeValues.includes(merged.theme) ? merged.theme : defaults.theme,
		confirmBeforeSearch: Boolean(merged.confirmBeforeSearch),
		restoreLastSearch  : Boolean(merged.restoreLastSearch),
		esExePath          : typeof merged.esExePath === 'string' ? merged.esExePath : defaults.esExePath,
		fileNameSearch     : {
			...merged.fileNameSearch,
			regex            : Boolean(merged.fileNameSearch.regex),
			caseSensitive    : Boolean(merged.fileNameSearch.caseSensitive),
			wholeWord        : Boolean(merged.fileNameSearch.wholeWord),
			matchPath        : Boolean(merged.fileNameSearch.matchPath),
			diacritics       : Boolean(merged.fileNameSearch.diacritics),
			maxCandidateFiles: normalizeMaxCandidateFiles(
				merged.fileNameSearch.maxCandidateFiles,
				defaults.fileNameSearch.maxCandidateFiles,
			),
			sort: sortValues.includes(merged.fileNameSearch.sort)
				? merged.fileNameSearch.sort
				: defaults.fileNameSearch.sort,
			timeoutMs: clampNumber(
				merged.fileNameSearch.timeoutMs,
				1000,
				300000,
				defaults.fileNameSearch.timeoutMs,
			),
			additionalArgs: typeof merged.fileNameSearch.additionalArgs === 'string'
				? merged.fileNameSearch.additionalArgs
				: defaults.fileNameSearch.additionalArgs,
		},
		contentSearch: {
			...merged.contentSearch,
			regex        : Boolean(merged.contentSearch.regex),
			caseSensitive: Boolean(merged.contentSearch.caseSensitive),
			encoding     : encodingValues.includes(merged.contentSearch.encoding)
				? merged.contentSearch.encoding
				: defaults.contentSearch.encoding,
			maxFileSizeMb: clampNumber(
				merged.contentSearch.maxFileSizeMb,
				1,
				1024,
				defaults.contentSearch.maxFileSizeMb,
			),
			skipBinary : Boolean(merged.contentSearch.skipBinary),
			concurrency: clampNumber(
				merged.contentSearch.concurrency,
				1,
				32,
				defaults.contentSearch.concurrency,
			),
		},
		results: {
			maxRows: normalizeMaxRows(
				merged.results.maxRows,
				defaults.results.maxRows,
			),
			copyFormat: (() => {
				const storedFormat = merged.results.copyFormat as string;
				const rawFormat    = storedFormat === 'markdown'
					? 'markdown-codeblock'
					: merged.results.copyFormat;

				return copyFormatValues.includes(rawFormat)
					? rawFormat
					: defaults.results.copyFormat;
			})(),
			copyLineEnding: copyLineEndingValues.includes(merged.results.copyLineEnding)
				? merged.results.copyLineEnding
				: defaults.results.copyLineEnding,
			tabHandling: tabHandlingValues.includes(merged.results.tabHandling)
				? merged.results.tabHandling
				: defaults.results.tabHandling,
			tabSize: clampNumber(
				merged.results.tabSize,
				1,
				8,
				defaults.results.tabSize,
			),
			trimLineText: Boolean(merged.results.trimLineText),
		},
		keybindings: {
			toggleFileNameRegex: typeof merged.keybindings.toggleFileNameRegex === 'string'
				? merged.keybindings.toggleFileNameRegex
				: defaults.keybindings.toggleFileNameRegex,
			toggleContentRegex: typeof merged.keybindings.toggleContentRegex === 'string'
				? merged.keybindings.toggleContentRegex
				: defaults.keybindings.toggleContentRegex,
			runSearch: typeof merged.keybindings.runSearch === 'string'
				? merged.keybindings.runSearch
				: defaults.keybindings.runSearch,
			clear: typeof merged.keybindings.clear === 'string'
				? merged.keybindings.clear === 'Esc'
					? defaults.keybindings.clear
					: merged.keybindings.clear
				: defaults.keybindings.clear,
		},
	};
}

/**
 * 既定 settings を返す
 * @returns {AppSettings} 既定 settings
 */
export function getDefaultSettings(): AppSettings {
	return createDefaultConfig().settings;
}

/**
 * dot 記法でオブジェクトから値を取得する
 * @param {Record<string, unknown>} source 対象
 * @param {string} itemKey キー
 * @returns {unknown} 値
 */
function getValueByPath(source: Record<string, unknown>, itemKey: string): unknown {
	const parts          = itemKey.split('.');
	let current: unknown = source;

	for (const part of parts) {
		if (current === null || typeof current !== 'object') {
			return undefined;
		}

		current = (current as Record<string, unknown>)[part];
	}

	return current;
}

/**
 * dot 記法でオブジェクトへ値を設定する
 * @param {Record<string, unknown>} source 対象
 * @param {string} itemKey キー
 * @param {unknown} value 値
 * @returns {Record<string, unknown>} 更新後オブジェクト
 */
function setValueByPath(
	source: Record<string, unknown>,
	itemKey: string,
	value: unknown,
): Record<string, unknown> {
	const parts  = itemKey.split('.');
	const cloned = structuredClone(source) as Record<string, unknown>;
	let current  = cloned;

	for (let index = 0; index < parts.length - 1; index += 1) {
		const part = parts[index];
		const next = current[part];

		if (next === null || typeof next !== 'object') {
			current[part] = {};
		}

		current = current[part] as Record<string, unknown>;
	}

	current[parts[parts.length - 1]] = value;

	return cloned;
}

/**
 * 設定を正規化する
 * @param {Partial<AppConfig>} config 設定
 * @returns {AppConfig} 正規化後設定
 */
function normalizeConfig(config: Partial<AppConfig>): AppConfig {
	const defaults = createDefaultConfig();
	const limits   = getWindowSizeLimits();
	const window   = clampWindowSize(
		config.window?.width ?? defaults.window.width,
		config.window?.height ?? defaults.window.height,
		limits,
	);

	return {
		schemaVersion: defaults.schemaVersion,
		window       : {
			width : window.width,
			height: window.height,
		},
		settings: normalizeSettings(config.settings),
		lastSearch: {
			...defaults.lastSearch,
			...config.lastSearch,
			fileNameQuery: typeof config.lastSearch?.fileNameQuery === 'string'
				? config.lastSearch.fileNameQuery
				: defaults.lastSearch.fileNameQuery,
			contentQuery: typeof config.lastSearch?.contentQuery === 'string'
				? config.lastSearch.contentQuery
				: defaults.lastSearch.contentQuery,
			targetPath: typeof config.lastSearch?.targetPath === 'string'
				? config.lastSearch.targetPath
				: defaults.lastSearch.targetPath,
			targetExtensions: typeof config.lastSearch?.targetExtensions === 'string'
				? config.lastSearch.targetExtensions
				: defaults.lastSearch.targetExtensions,
			fileNameRegex: typeof config.lastSearch?.fileNameRegex === 'boolean'
				? config.lastSearch.fileNameRegex
				: defaults.lastSearch.fileNameRegex,
			contentRegex: typeof config.lastSearch?.contentRegex === 'boolean'
				? config.lastSearch.contentRegex
				: defaults.lastSearch.contentRegex,
		},
	};
}

/**
 * 設定ファイルのパスを取得する
 * @returns {string} config.json の絶対パス
 */
export function getConfigPath(): string {
	return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
}

/**
 * バックアップディレクトリのパスを取得する
 * @returns {string} backups ディレクトリ
 */
function getBackupDir(): string {
	return path.join(app.getPath('userData'), 'backups');
}

/**
 * JSON をアトミックに書き込む
 * @param {string} filePath 出力先
 * @param {unknown} data 保存データ
 * @returns {void}
 */
function writeJsonAtomic(filePath: string, data: unknown): void {
	const dir      = path.dirname(filePath);
	const tempPath = `${filePath}.${process.pid}.tmp`;

	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	const content = `${JSON.stringify(data, null, 2)}\n`;
	const fd      = fs.openSync(tempPath, 'w');

	try {
		fs.writeSync(fd, content, 0, 'utf8');
		fs.fsyncSync(fd);
	} finally {
		fs.closeSync(fd);
	}

	fs.renameSync(tempPath, filePath);
}

/**
 * バックアップを作成する
 * @param {string} filePath 元ファイル
 * @returns {void}
 */
function createBackup(filePath: string): void {
	if (!fs.existsSync(filePath)) {
		return;
	}

	const backupDir = getBackupDir();

	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	}

	const now        = new Date();
	const stamp      = [
		now.getFullYear(),
		String(now.getMonth() + 1).padStart(2, '0'),
		String(now.getDate()).padStart(2, '0'),
		String(now.getHours()).padStart(2, '0'),
		String(now.getMinutes()).padStart(2, '0'),
		String(now.getSeconds()).padStart(2, '0'),
	].join('');
	const backupPath = path.join(backupDir, `config.${stamp}.json`);

	fs.copyFileSync(filePath, backupPath);
	purgeOldBackups(backupDir);
}

/**
 * 古いバックアップを削除する
 * @param {string} backupDir バックアップディレクトリ
 * @returns {void}
 */
function purgeOldBackups(backupDir: string): void {
	const files = fs.readdirSync(backupDir)
		.filter((file) => file.startsWith('config.') && file.endsWith('.json'))
		.map((file) => ({
			name: file,
			path: path.join(backupDir, file),
			mtime: fs.statSync(path.join(backupDir, file)).mtimeMs,
		}))
		.sort((a, b) => b.mtime - a.mtime);

	for (const file of files.slice(BACKUP_RETENTION_COUNT)) {
		fs.unlinkSync(file.path);
	}
}

/**
 * 最新バックアップから復旧を試みる
 * @returns {AppConfig | null} 復旧できた設定
 */
function restoreFromLatestBackup(): AppConfig | null {
	const backupDir = getBackupDir();

	if (!fs.existsSync(backupDir)) {
		return null;
	}

	const files = fs.readdirSync(backupDir)
		.filter((file) => file.startsWith('config.') && file.endsWith('.json'))
		.map((file) => ({
			path : path.join(backupDir, file),
			mtime: fs.statSync(path.join(backupDir, file)).mtimeMs,
		}))
		.sort((a, b) => b.mtime - a.mtime);

	for (const file of files) {
		try {
			const raw    = fs.readFileSync(file.path, 'utf8');
			const parsed = JSON.parse(raw) as Partial<AppConfig>;

			return normalizeConfig(parsed);
		} catch {
			continue;
		}
	}

	return null;
}

/**
 * 設定を読み込む
 * @returns {LoadConfigResult} 読込結果
 */
export function loadConfig(): LoadConfigResult {
	const configPath = getConfigPath();

	if (!fs.existsSync(configPath)) {
		const config = createDefaultConfig();

		try {
			writeJsonAtomic(configPath, config);
			cachedConfig = config;

			return {
				success: true,
				config,
			};
		} catch (error) {
			logger.error('Failed to create default config', {
				error: error instanceof Error ? error.message : String(error),
			});

			cachedConfig = config;

			return {
				success: false,
				config,
				message: '既定設定の作成に失敗しました。',
			};
		}
	}

	try {
		const raw    = fs.readFileSync(configPath, 'utf8');
		const parsed = JSON.parse(raw) as Partial<AppConfig>;
		const config = normalizeConfig(parsed);

		cachedConfig = config;

		return {
			success: true,
			config,
		};
	} catch (error) {
		logger.warn('Config parse failed, attempting backup restore', {
			error: error instanceof Error ? error.message : String(error),
		});

		const restored = restoreFromLatestBackup();

		if (restored) {
			cachedConfig = restored;

			try {
				writeJsonAtomic(configPath, restored);
			} catch (writeError) {
				logger.error('Failed to write restored config', {
					error: writeError instanceof Error ? writeError.message : String(writeError),
				});
			}

			return {
				success: true,
				config : restored,
				message: '設定ファイルをバックアップから復旧しました。',
			};
		}

		const config = createDefaultConfig();

		cachedConfig = config;

		return {
			success: false,
			config,
			message: '設定ファイルの読み込みに失敗したため、既定値を使用します。',
		};
	}
}

/**
 * キャッシュ済み設定を取得する
 * @returns {AppConfig | null} 設定
 */
export function getCachedConfig(): AppConfig | null {
	return cachedConfig;
}

/**
 * 設定を保存する
 * @param {AppConfig} config 保存する設定
 * @returns {SaveConfigResult} 保存結果
 */
export function saveConfig(config: AppConfig): SaveConfigResult {
	const normalized = normalizeConfig(config);
	const configPath = getConfigPath();

	try {
		createBackup(configPath);
		writeJsonAtomic(configPath, normalized);
		cachedConfig = normalized;

		return {
			success: true,
			config : normalized,
		};
	} catch (error) {
		logger.error('Failed to save config', {
			error: error instanceof Error ? error.message : String(error),
		});

		return {
			success: false,
			message: '設定の保存に失敗しました。',
		};
	}
}

/**
 * 設定の一部を更新する
 * @param {Partial<AppSettings>} partialSettings 更新する settings
 * @returns {SaveConfigResult} 保存結果
 */
export function updateSettings(partialSettings: Partial<AppSettings>): SaveConfigResult {
	const current = cachedConfig ?? loadConfig().config;

	return saveConfig({
		...current,
		settings: normalizeSettings({
			...current.settings,
			...partialSettings,
			fileNameSearch: {
				...current.settings.fileNameSearch,
				...partialSettings.fileNameSearch,
			},
			contentSearch: {
				...current.settings.contentSearch,
				...partialSettings.contentSearch,
			},
			results: {
				...current.settings.results,
				...partialSettings.results,
			},
			keybindings: {
				...current.settings.keybindings,
				...partialSettings.keybindings,
			},
		}),
	});
}

/**
 * 直近検索入力を更新する
 * @param {Partial<LastSearch>} partialLastSearch 更新内容
 * @returns {SaveConfigResult} 保存結果
 */
export function updateLastSearch(partialLastSearch: Partial<LastSearch>): SaveConfigResult {
	const current = cachedConfig ?? loadConfig().config;

	return saveConfig({
		...current,
		lastSearch: {
			...current.lastSearch,
			...partialLastSearch,
		},
	});
}

/**
 * 設定項目を既定値へリセットする
 * @param {string} itemKey settings 配下の dot 記法キー
 * @returns {ResetSettingResult} リセット結果
 */
export function resetSettingItem(itemKey: string): ResetSettingResult {
	if (!RESETTABLE_SETTING_KEYS.has(itemKey)) {
		return {
			success: false,
			message: `不明な設定項目です: ${itemKey}`,
		};
	}

	const defaults     = getDefaultSettings();
	const defaultValue = getValueByPath(defaults as unknown as Record<string, unknown>, itemKey);
	const current      = cachedConfig ?? loadConfig().config;
	const nextSettings = setValueByPath(
		current.settings as unknown as Record<string, unknown>,
		itemKey,
		defaultValue,
	) as unknown as AppSettings;
	const saveResult   = saveConfig({
		...current,
		settings: normalizeSettings(nextSettings),
	});

	return {
		success: saveResult.success,
		message: saveResult.message,
		config : saveResult.config,
	};
}

/**
 * すべての設定を既定値へリセットする
 * @returns {ResetSettingResult} リセット結果
 */
export function resetAllConfig(): ResetSettingResult {
	const current    = cachedConfig ?? loadConfig().config;
	const defaults   = createDefaultConfig();
	const saveResult = saveConfig({
		...defaults,
		window    : current.window,
		lastSearch: current.lastSearch,
	});

	return {
		success: saveResult.success,
		message: saveResult.message,
		config : saveResult.config,
	};
}

/**
 * ウィンドウサイズを保存する
 * @param {number} width 幅
 * @param {number} height 高さ
 * @returns {SaveConfigResult} 保存結果
 */
export function persistWindowSize(width: number, height: number): SaveConfigResult {
	const current = cachedConfig ?? loadConfig().config;

	return saveConfig({
		...current,
		window: {
			width,
			height,
		},
	});
}
