import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, nativeTheme } from 'electron';
import {
	attachWindowSecurityHandlers,
	getPreloadPath,
	getRendererIndexPath,
	registerIpcHandlers,
	setMainWindow,
} from './ipc';
import { getCachedConfig, loadConfig } from './config-store';
import { logger } from './logger';
import { initAutoUpdater, setAutoUpdaterWindow } from './updater';
import {
	applyTitleBarOverlay,
	clampWindowSize,
	DEFAULT_WINDOW_HEIGHT,
	DEFAULT_WINDOW_WIDTH,
	MIN_WINDOW_HEIGHT,
	MIN_WINDOW_WIDTH,
	resolveTitleBarOverlay,
} from './window';

/** パッケージ版 AppUserModelID */
const PACKAGED_APP_USER_MODEL_ID = 'jp.tm-systems.tms-grep';

/** 開発版 AppUserModelID */
const DEV_APP_USER_MODEL_ID = 'jp.tm-systems.tms-grep.dev';

/** アプリケーションアイコンファイル名 */
const APP_ICON_FILE_NAME = 'icon.ico';

/** メインウィンドウ参照 */
let mainWindow: BrowserWindow | null = null;

/**
 * 開発時の userData 分離
 * @returns {void}
 */
function configureDevUserData(): void {
	if (!app.isPackaged) {
		app.setPath(
			'userData',
			path.join(app.getPath('appData'), 'tms-grep-dev'),
		);
	}
}

/**
 * 未捕捉例外をログに記録する
 * @returns {void}
 */
function registerGlobalErrorHandlers(): void {
	process.on('uncaughtException', (error) => {
		logger.error('Uncaught exception in main process', {
			error: error.message,
			stack: error.stack,
		});
	});

	process.on('unhandledRejection', (reason) => {
		logger.error('Unhandled rejection in main process', {
			reason: reason instanceof Error ? reason.message : String(reason),
		});
	});
}

/**
 * ウィンドウ表示用アイコンパスを解決する
 * @returns {string | undefined} アイコンパス
 */
function resolveWindowIconPath(): string | undefined {
	if (process.platform !== 'win32') {
		return undefined;
	}

	const candidates = app.isPackaged
		? [
			path.join(process.resourcesPath, APP_ICON_FILE_NAME),
		]
		: [
			path.join(app.getAppPath(), 'build', APP_ICON_FILE_NAME),
			path.join(process.cwd(), 'build', APP_ICON_FILE_NAME),
		];
	const iconPath   = candidates.find((candidate) => fs.existsSync(candidate));

	if (!iconPath) {
		logger.warn('Window icon was not found', { candidates });
	}

	return iconPath;
}

/**
 * AppUserModelID を取得する
 * @returns {string} AppUserModelID
 */
function resolveAppUserModelId(): string {
	return app.isPackaged ? PACKAGED_APP_USER_MODEL_ID : DEV_APP_USER_MODEL_ID;
}

/**
 * 現在の外観設定を取得する
 * @param {'system' | 'dark' | 'light'} fallback フォールバック値
 * @returns {'system' | 'dark' | 'light'} 外観設定
 */
function resolveCurrentAppearance(
	fallback: 'system' | 'dark' | 'light',
): 'system' | 'dark' | 'light' {
	return getCachedConfig()?.settings.theme ?? fallback;
}

/**
 * メインウィンドウを生成する
 * @returns {BrowserWindow} ウィンドウ
 */
function createMainWindow(): BrowserWindow {
	const loadResult      = loadConfig();
	const settings        = loadResult.config.settings;
	const size            = clampWindowSize(
		loadResult.config.window.width ?? DEFAULT_WINDOW_WIDTH,
		loadResult.config.window.height ?? DEFAULT_WINDOW_HEIGHT,
	);
	const appearance      = settings.theme ?? 'system';
	const isWin           = process.platform === 'win32';
	const titleBarOverlay = isWin ? resolveTitleBarOverlay(appearance) : undefined;
	const icon            = resolveWindowIconPath();

	if (icon) {
		logger.info('Window icon configured', { icon });
	}

	nativeTheme.themeSource = appearance === 'system' ? 'system' : appearance;

	const win = new BrowserWindow({
		width          : size.width,
		height         : size.height,
		minWidth       : MIN_WINDOW_WIDTH,
		minHeight      : MIN_WINDOW_HEIGHT,
		center         : true,
		autoHideMenuBar: true,
		show           : false,
		title          : 'TMS-GREP',
		icon,
		backgroundColor: titleBarOverlay?.color,
		...(isWin
			? {
				titleBarStyle: 'hidden',
				titleBarOverlay,
			}
			: {
				titleBarStyle: 'hidden',
			}),
		webPreferences : {
			preload         : getPreloadPath(),
			contextIsolation: true,
			nodeIntegration : false,
			sandbox         : true,
		},
	});

	if (icon) {
		win.setIcon(icon);
	}

	attachWindowSecurityHandlers(win);

	win.on('focus', () => {
		applyTitleBarOverlay(win, resolveCurrentAppearance(appearance), true);
		win.webContents.send('window:focus-changed', true);
	});

	win.on('blur', () => {
		applyTitleBarOverlay(win, resolveCurrentAppearance(appearance), false);
		win.webContents.send('window:focus-changed', false);
	});

	win.once('ready-to-show', () => {
		win.show();
	});

	win.loadFile(getRendererIndexPath());

	win.on('close', (event) => {
		if (win.isDestroyed()) {
			return;
		}

		event.preventDefault();
		win.webContents.send('app:before-close');
	});

	win.on('closed', () => {
		mainWindow = null;
		setMainWindow(null);
		setAutoUpdaterWindow(null);
	});

	mainWindow = win;
	setMainWindow(win);

	return win;
}

/**
 * 単一インスタンスロックを設定する
 * @returns {boolean} ロック取得成功なら true
 */
function requestSingleInstance(): boolean {
	const gotLock = app.requestSingleInstanceLock();

	if (!gotLock) {
		app.quit();
		return false;
	}

	app.on('second-instance', () => {
		if (!mainWindow) {
			mainWindow = createMainWindow();
			return;
		}

		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}

		mainWindow.focus();
	});

	return true;
}

/**
 * アプリケーションを起動する
 * @returns {void}
 */
function bootstrap(): void {
	configureDevUserData();
	const appUserModelId = resolveAppUserModelId();

	app.setAppUserModelId(appUserModelId);
	registerGlobalErrorHandlers();
	logger.init();
	logger.info('Application identity configured', {
		appUserModelId,
		isPackaged: app.isPackaged,
	});
	registerIpcHandlers();

	if (!requestSingleInstance()) {
		return;
	}

	app.whenReady().then(() => {
		const win = createMainWindow();

		initAutoUpdater(win);

		app.on('activate', () => {
			if (BrowserWindow.getAllWindows().length === 0) {
				const activatedWin = createMainWindow();

				initAutoUpdater(activatedWin);
			}
		});
	});

	app.on('window-all-closed', () => {
		app.quit();
	});
}

try {
	if (!app.isPackaged) {
		require('electron-reloader')(module);
	}
} catch {
	// 開発環境でない場合は無視
}

bootstrap();
