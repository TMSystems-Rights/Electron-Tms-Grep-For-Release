import path from 'node:path';
import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, systemPreferences } from 'electron';
import { formatHits } from './clipboard';
import { createCopyTextTransformSettings } from './copy-text-transform';
import {
	cancelActiveEsSearch,
	createEsSearchRequest,
	detectEsExe,
	searchCandidateFiles,
	validateAdditionalArgs,
} from './es-adapter';
import {
	createDefaultConfig,
	getCachedConfig,
	getDefaultSettings,
	loadConfig,
	persistWindowSize,
	resetAllConfig,
	resetSettingItem,
	saveConfig,
	updateLastSearch,
	updateSettings,
} from './config-store';
import { validateContentRegex } from './content-search';
import { logger } from './logger';
import type { LogLevel } from './logger';
import type {
	AppConfig,
	AppSettings,
	CopyFormat,
	CopyLineEnding,
	EsCandidateSearchResult,
	LastSearch,
	SearchHit,
	SearchStartPayload,
} from './types';
import { openFile, showItemInFolder } from './shell-actions';
import { applyTitleBarOverlay, resolveWindowChromeColors } from './window';
import { checkForUpdatesManual } from './updater';
import { isAdministrator } from './admin';
import {
	cancelSearchJob,
	getSearchJobState,
	isSearchJobRunning,
	startSearchJob,
	validateFileNameQueryInput,
	validateSearchStartPayload,
} from './search-job';

/**
 * テーマ変更を UI へ反映する
 * @param {'system' | 'dark' | 'light'} appearance 外観設定
 * @returns {void}
 */
function syncThemeToWindow(appearance: 'system' | 'dark' | 'light'): void {
	applyAppearance(appearance);

	if (mainWindow) {
		applyTitleBarOverlay(mainWindow, appearance);
	}

	mainWindow?.webContents.send('theme:updated');
}

/** メインウィンドウ参照 */
let mainWindow: BrowserWindow | null = null;

/**
 * IPC ハンドラ内の例外をログに記録する
 * @param {string} channel チャンネル名
 * @param {unknown} error 例外
 * @returns {void}
 */
function logIpcHandlerError(channel: string, error: unknown): void {
	logger.error(`IPC handler failed: ${channel}`, {
		error: error instanceof Error ? error.message : String(error),
	});
}

/**
 * IPC ハンドラを try/catch で包む
 * @template T
 * @param {string} channel チャンネル名
 * @param {() => T | Promise<T>} handler ハンドラ
 * @returns {Promise<T>} 結果
 */
async function runIpcHandler<T>(channel: string, handler: () => T | Promise<T>): Promise<T> {
	try {
		return await handler();
	} catch (error) {
		logIpcHandlerError(channel, error);
		throw error;
	}
}

/**
 * メインウィンドウ参照を設定する
 * @param {BrowserWindow | null} win ウィンドウ
 * @returns {void}
 */
export function setMainWindow(win: BrowserWindow | null): void {
	mainWindow = win;
}

/**
 * テーマ設定を nativeTheme に反映する
 * @param {'system' | 'dark' | 'light'} appearance 外観設定
 * @returns {void}
 */
function applyAppearance(appearance: 'system' | 'dark' | 'light'): void {
	nativeTheme.themeSource = appearance === 'system' ? 'system' : appearance;
}

/**
 * 現在の外観設定を取得する
 * @returns {'system' | 'dark' | 'light'} 外観設定
 */
function getCurrentAppearance(): 'system' | 'dark' | 'light' {
	return getCachedConfig()?.settings.theme ?? 'system';
}

/**
 * ウィンドウクローム色変更を UI へ通知する
 * @returns {void}
 */
function syncWindowChromeColors(): void {
	const appearance = getCurrentAppearance();

	if (mainWindow) {
		applyTitleBarOverlay(mainWindow, appearance);
	}

	mainWindow?.webContents.send('theme:updated');
}

/**
 * IPC ハンドラを登録する
 * @returns {void}
 */
export function registerIpcHandlers(): void {
	ipcMain.handle('app:getVersion', () => {
		return { version: app.getVersion() };
	});

	ipcMain.handle('app:isAdministrator', () => {
		return runIpcHandler('app:isAdministrator', () => isAdministrator());
	});

	ipcMain.handle('update:check', () => {
		return checkForUpdatesManual();
	});

	ipcMain.handle('config:get', () => {
		const cached = getCachedConfig();

		if (cached) {
			return {
				success: true,
				config : cached,
			};
		}

		return loadConfig();
	});

	ipcMain.handle('config:save', (_event, config: AppConfig) => {
		return runIpcHandler('config:save', () => {
			const result = saveConfig(config);

			if (result.success && config.settings?.theme) {
				syncThemeToWindow(config.settings.theme);
			}

			return result;
		});
	});

	ipcMain.handle('config:updateSettings', (_event, partialSettings: Partial<AppSettings>) => {
		return runIpcHandler('config:updateSettings', () => {
			const result = updateSettings(partialSettings);

			if (result.success && partialSettings.theme) {
				syncThemeToWindow(partialSettings.theme);
			}

			return result;
		});
	});

	ipcMain.handle('config:getDefaults', () => {
		return createDefaultConfig();
	});

	ipcMain.handle('config:getDefaultSettings', () => {
		return getDefaultSettings();
	});

	ipcMain.handle('config:reset-item', (_event, itemKey: string) => {
		const result = resetSettingItem(itemKey);

		if (result.success && result.config?.settings.theme) {
			syncThemeToWindow(result.config.settings.theme);
		}

		return result;
	});

	ipcMain.handle('config:reset-all', () => {
		const result = resetAllConfig();

		if (result.success && result.config?.settings.theme) {
			syncThemeToWindow(result.config.settings.theme);
		}

		return result;
	});

	ipcMain.handle('config:updateLastSearch', (_event, partialLastSearch: Partial<LastSearch>) => {
		return updateLastSearch(partialLastSearch);
	});

	ipcMain.handle('theme:apply', (_event, appearance: 'system' | 'dark' | 'light') => {
		syncThemeToWindow(appearance);
		return nativeTheme.shouldUseDarkColors;
	});

	ipcMain.handle('theme:shouldUseDarkColors', () => {
		return nativeTheme.shouldUseDarkColors;
	});

	ipcMain.handle('theme:getWindowChromeColors', () => {
		return resolveWindowChromeColors(getCurrentAppearance());
	});

	ipcMain.handle('es:detect', async () => {
		const config = getCachedConfig() ?? loadConfig().config;

		return detectEsExe(config.settings.esExePath);
	});

	ipcMain.handle('es:validateAdditionalArgs', (_event, additionalArgs: string) => {
		return validateAdditionalArgs(additionalArgs ?? '');
	});

	ipcMain.handle('es:search', async (_event, payload: {
		fileNameQuery: string;
		targetPath?: string;
		targetExtensions?: string;
		regex?: boolean;
	}): Promise<EsCandidateSearchResult> => {
		return runIpcHandler('es:search', async () => {
			const config = getCachedConfig() ?? loadConfig().config;
			const detect = await detectEsExe(config.settings.esExePath);

			if (!detect.available) {
				return {
					success  : false,
					fileCount: 0,
					elapsedMs: 0,
					stderr   : '',
					exitCode : null,
					message  : detect.message ?? 'es.exe が利用できません。',
				};
			}

			const request = createEsSearchRequest({
				esExePath       : detect.path,
				fileNameQuery   : payload.fileNameQuery,
				targetPath      : payload.targetPath,
				targetExtensions: payload.targetExtensions,
				regex           : payload.regex ?? false,
				fileNameSearch  : config.settings.fileNameSearch,
			});

			const result = await searchCandidateFiles(request);

			return {
				success  : result.success,
				fileCount: result.files.length,
				elapsedMs: result.elapsedMs,
				stderr   : result.stderr,
				exitCode : result.exitCode,
				message  : result.message,
				warnings : result.warnings,
			};
		});
	});

	ipcMain.handle('es:cancel', () => {
		return cancelActiveEsSearch();
	});

	ipcMain.handle('search:getState', () => {
		return {
			state  : getSearchJobState(),
			running: isSearchJobRunning(),
		};
	});

	ipcMain.handle('search:validateFileNameQuery', (_event, payload: {
		fileNameQuery: string;
		fileNameRegex?: boolean;
	}) => {
		return validateFileNameQueryInput(
			payload.fileNameQuery ?? '',
			payload.fileNameRegex ?? false,
		);
	});

	ipcMain.handle('search:validateContentRegex', (_event, payload: {
		query: string;
		caseSensitive?: boolean;
	}) => {
		return validateContentRegex(payload.query ?? '', payload.caseSensitive ?? false);
	});

	ipcMain.handle('search:validateStart', (_event, payload: SearchStartPayload) => {
		const config = getCachedConfig() ?? loadConfig().config;

		return validateSearchStartPayload(payload, config.settings.contentSearch);
	});

	ipcMain.handle('search:start', async (_event, payload: SearchStartPayload) => {
		return runIpcHandler('search:start', async () => {
			const config = getCachedConfig() ?? loadConfig().config;

			return startSearchJob({
				config,
				payload,
				notifier: {
					/**
					 *
					 */
					onStateChange: (state) => {
						mainWindow?.webContents.send('search:on-state', { state });
					},
					/**
					 *
					 */
					onProgress: (progress) => {
						mainWindow?.webContents.send('search:on-progress', progress);
					},
					/**
					 *
					 */
					onHit: (hit) => {
						mainWindow?.webContents.send('search:on-result', hit);
					},
					/**
					 *
					 */
					onComplete: (result) => {
						mainWindow?.webContents.send('search:on-complete', result);
					},
				},
			});
		});
	});

	ipcMain.handle('search:cancel', () => {
		return cancelSearchJob();
	});

	ipcMain.handle('clipboard:formatHits', (_event, payload: {
		hits: SearchHit[];
		format: CopyFormat;
		lineEnding?: CopyLineEnding;
	}) => {
		const config        = getCachedConfig() ?? loadConfig().config;
		const lineEnding    = payload.lineEnding ?? config.settings.results.copyLineEnding;
		const textTransform = createCopyTextTransformSettings(config.settings.results);

		return formatHits(
			payload.hits ?? [],
			payload.format ?? 'grep',
			lineEnding,
			textTransform,
		);
	});

	ipcMain.handle('clipboard:copyHits', (_event, payload: {
		hits: SearchHit[];
		format: CopyFormat;
		lineEnding?: CopyLineEnding;
	}) => {
		const config        = getCachedConfig() ?? loadConfig().config;
		const hits          = payload.hits ?? [];
		const lineEnding    = payload.lineEnding ?? config.settings.results.copyLineEnding;
		const textTransform = createCopyTextTransformSettings(config.settings.results);
		const text          = formatHits(hits, payload.format ?? 'grep', lineEnding, textTransform);

		if (!text) {
			return {
				success: false,
				message: 'コピー対象がありません。',
			};
		}

		clipboard.writeText(text);

		return {
			success  : true,
			lineCount: payload.format === 'paths'
				? new Set(hits.map((hit) => hit.filePath)).size
				: hits.length,
		};
	});

	ipcMain.handle('shell:openFile', async (_event, filePath: string) => {
		return openFile(filePath ?? '');
	});

	ipcMain.handle('shell:showItemInFolder', (_event, filePath: string) => {
		return showItemInFolder(filePath ?? '');
	});

	ipcMain.handle('dialog:openExecutable', async () => {
		if (!mainWindow) {
			return null;
		}

		const result = await dialog.showOpenDialog(mainWindow, {
			title     : 'es.exe を選択',
			properties: ['openFile'],
			filters   : [
				{ name: '実行ファイル/ショートカット', extensions: ['exe', 'lnk'] },
				{ name: 'すべてのファイル', extensions: ['*'] },
			],
		});

		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}

		return result.filePaths[0];
	});

	ipcMain.handle('dialog:openDirectory', async () => {
		if (!mainWindow) {
			return null;
		}

		const result = await dialog.showOpenDialog(mainWindow, {
			title     : 'フォルダを選択',
			properties: ['openDirectory', 'createDirectory'],
		});

		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}

		return result.filePaths[0];
	});

	ipcMain.on('app:close-ready', () => {
		if (!mainWindow || mainWindow.isDestroyed()) {
			return;
		}

		const [width, height] = mainWindow.getSize();
		persistWindowSize(width, height);
		mainWindow.destroy();
	});

	nativeTheme.on('updated', () => {
		const appearance = getCachedConfig()?.settings.theme ?? 'system';

		if (appearance === 'system' && mainWindow) {
			applyTitleBarOverlay(mainWindow, 'system');
		}

		mainWindow?.webContents.send('theme:updated');
	});

	systemPreferences.on('accent-color-changed', () => {
		syncWindowChromeColors();
	});

	systemPreferences.on('color-changed', () => {
		syncWindowChromeColors();
	});

	ipcMain.on(
		'log:write',
		(_event, payload: { level: LogLevel; message: string; context?: Record<string, unknown> }) => {
			logger.fromRenderer(payload.level, payload.message, payload.context);
		},
	);

	logger.info('IPC handlers registered');
}

/**
 * ウィンドウのセキュリティ設定を適用する
 * @param {BrowserWindow} win ウィンドウ
 * @returns {void}
 */
export function attachWindowSecurityHandlers(win: BrowserWindow): void {
	win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

	win.webContents.on('will-navigate', (event, url) => {
		const currentFile = win.webContents.getURL();

		if (url !== currentFile && !url.startsWith('file://')) {
			event.preventDefault();
		}
	});

	win.webContents.on('render-process-gone', (_event, details) => {
		logger.error('Renderer process gone', {
			reason  : details.reason,
			exitCode: details.exitCode,
		});
	});
}

/**
 * preload スクリプトの絶対パス
 * @returns {string} preload パス
 */
export function getPreloadPath(): string {
	return path.join(__dirname, '..', 'preload', 'preload.js');
}

/**
 * renderer/index.html の絶対パス
 * @returns {string} HTML パス
 */
export function getRendererIndexPath(): string {
	return path.join(__dirname, '..', 'renderer', 'index.html');
}
