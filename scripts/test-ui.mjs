import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow } from 'electron';
import { registerIpcHandlers, setMainWindow } from '../dist/main/ipc.js';
import { logger } from '../dist/main/logger.js';

const rootDir     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tms-grep-ui-'));

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-gpu-sandbox');
app.commandLine.appendSwitch('in-process-gpu');
app.commandLine.appendSwitch('no-sandbox');
app.setPath('userData', userDataDir);

/**
 * Renderer 初期化完了を待つ
 * @param {import('electron').WebContents} webContents WebContents
 * @returns {Promise<void>}
 */
async function waitForRendererReady(webContents) {
	for (let attempt = 0; attempt < 40; attempt += 1) {
		const ready = await webContents.executeJavaScript(
			'Boolean(window.grepApi && TMS_GREP?.App?._config)',
		);

		if (ready) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	throw new Error('Renderer did not finish initialization');
}

app.whenReady().then(async () => {
	logger.init();
	registerIpcHandlers();

	const win = new BrowserWindow({
		show         : false,
		width        : 1100,
		height       : 760,
		titleBarStyle: 'hidden',
		webPreferences: {
			preload         : path.join(rootDir, 'dist', 'preload', 'preload.js'),
			contextIsolation: true,
			sandbox         : true,
		},
	});

	setMainWindow(win);

	await win.loadURL(pathToFileURL(path.join(rootDir, 'dist', 'renderer', 'index.html')).href);
	await waitForRendererReady(win.webContents);

	const result = await win.webContents.executeJavaScript(`(async () => {
		const fileNameInput = document.getElementById('tmsGrepFileNameQuery');
		const contentInput = document.getElementById('tmsGrepContentQuery');
		const searchBtn = document.getElementById('tmsGrepBtnSearch');
		const settingsBtn = document.getElementById('tmsGrepBtnSettings');
		const settingsModal = document.getElementById('tmsGrepModalSettings');
		const progressPanel = document.getElementById('tmsGrepProgressPanel');
		const progressState = document.getElementById('tmsGrepProgressState');
		const expectedTitle = await window.grepApi.isAdministrator()
			? 'TMS-GREP（管理者権限）'
			: 'TMS-GREP';

		const initial = {
			title: document.getElementById('tmsGrepTitle')?.textContent,
			expectedTitle,
			searchDisabledWhenEmpty: searchBtn?.disabled === true,
			progressHidden: progressPanel?.hidden === true,
			progressHasStateText: Boolean(progressState?.textContent),
		};

		fileNameInput.value = '*.java';
		fileNameInput.dispatchEvent(new Event('input', { bubbles: true }));
		contentInput.value = 'MyLogger';
		contentInput.dispatchEvent(new Event('input', { bubbles: true }));
		TMS_GREP.Es._status = { available: true, path: 'C:\\\\Tools\\\\es.exe' };
		TMS_GREP.Search._fileNameValid = true;
		TMS_GREP.Search._contentRegexValid = true;
		TMS_GREP.Search.UpdateButtons();

		const filled = {
			searchEnabled: searchBtn?.disabled === false,
		};

		TMS_GREP.Es._status = { available: false, path: '', message: 'es.exe not found' };
		TMS_GREP.Es.UpdateWarning();
		TMS_GREP.Search.UpdateButtons();

		const esMissing = {
			searchDisabled: searchBtn?.disabled === true,
			warningVisible: document.getElementById('tmsGrepEsWarning')?.hidden === false,
		};

		await TMS_GREP.Settings.Open();
		const settingsOpen = {
			modalVisible: settingsModal?.hidden === false,
			themeSelectExists: Boolean(document.getElementById('tmsGrepSettingsTheme')),
			updateButtonExists: Boolean(document.getElementById('tmsGrepBtnSettingsCheckUpdate')),
		};

		await TMS_GREP.Settings.Close();
		const settingsClosed = {
			modalHidden: settingsModal?.hidden === true,
		};

		await TMS_GREP.Theme.Apply('dark');
		const darkTheme = document.body.classList.contains('tms-grep-theme-dark');

		await TMS_GREP.Theme.Apply('light');
		const lightTheme = document.body.classList.contains('tms-grep-theme-light');

		TMS_GREP.Search._running = true;
		TMS_GREP.Search.UpdateProgressPanel();
		const progressBusy = {
			panelVisible: progressPanel?.hidden === false,
			ariaBusy: progressPanel?.getAttribute('aria-busy') === 'true',
			stateText: progressState?.textContent ?? '',
		};

		TMS_GREP.Search._running = false;
		TMS_GREP.Search.UpdateProgressPanel();

		return {
			initial,
			filled,
			esMissing,
			settingsOpen,
			settingsClosed,
			darkTheme,
			lightTheme,
			progressBusy,
		};
	})()`);

	const passed = result.initial.title === result.initial.expectedTitle
		&& result.initial.searchDisabledWhenEmpty
		&& result.initial.progressHidden
		&& result.initial.progressHasStateText
		&& result.filled.searchEnabled
		&& result.esMissing.searchDisabled
		&& result.esMissing.warningVisible
		&& result.settingsOpen.modalVisible
		&& result.settingsOpen.themeSelectExists
		&& result.settingsOpen.updateButtonExists
		&& result.settingsClosed.modalHidden
		&& result.darkTheme
		&& result.lightTheme
		&& result.progressBusy.panelVisible
		&& result.progressBusy.ariaBusy
		&& result.progressBusy.stateText.length > 0;

	if (!passed) {
		throw new Error(`UI integration test failed: ${JSON.stringify(result, null, 2)}`);
	}

	console.log('test-ui: all assertions passed');
	setMainWindow(null);
	win.destroy();
	app.quit();
}).catch((error) => {
	console.error(error);
	app.exit(1);
});
