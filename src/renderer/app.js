'use strict';

/** @type {Array<'system' | 'dark' | 'light'>} */
const THEME_CYCLE = ['system', 'dark', 'light'];

/** @type {Record<'system' | 'dark' | 'light', string>} */
const THEME_LABELS = {
	system: 'システム',
	dark  : 'ダーク',
	light : 'ライト',
};

/** アプリタイトル */
const APP_TITLE = 'TMS-GREP';

/** 管理者権限時のタイトル接尾辞 */
const ADMINISTRATOR_TITLE_SUFFIX = '（管理者権限）';

/** @type {RegExp} */
const CSS_COLOR_HEX_PATTERN = /^#[0-9a-f]{6}$/iu;

Object.assign(TMS_GREP.Theme, {
	/**
	 * CSS に渡せる色か判定する
	 * @param {string} color 色
	 * @returns {boolean} 有効なら true
	 */
	IsValidCssColor: function (color) {
		return CSS_COLOR_HEX_PATTERN.test(color ?? '');
	},

	/**
	 * テーマを body に反映する
	 * @param {'system' | 'dark' | 'light'} appearance 外観設定
	 * @returns {Promise<void>}
	 */
	Apply: async function (appearance) {
		const body   = document.body;
		let useDark  = false;
		let useLight = false;

		if (appearance === 'dark') {
			useDark = true;
		} else if (appearance === 'light') {
			useLight = true;
		} else {
			useDark = await window.grepApi.shouldUseDarkColors();
		}

		body.classList.toggle(TMS_GREP_COMMON.Const.THEME_CLASS_DARK, useDark);
		body.classList.toggle(TMS_GREP_COMMON.Const.THEME_CLASS_LIGHT, useLight);
	},

	/**
	 * Windows のタイトルバー色をヘッダへ反映する
	 * @returns {Promise<void>}
	 */
	ApplyWindowChrome: async function () {
		const colors = await window.grepApi.getWindowChromeColors();
		const body   = document.body;

		if (!colors || !body) {
			return;
		}

		const colorMap = {
			'--tms-grep-titlebar-active-bg'  : colors.activeBackground,
			'--tms-grep-titlebar-active-text': colors.activeText,
			'--tms-grep-titlebar-inactive-bg': colors.inactiveBackground,
			'--tms-grep-titlebar-inactive-text': colors.inactiveText,
		};

		Object.entries(colorMap).forEach(([property, color]) => {
			if (TMS_GREP.Theme.IsValidCssColor(color)) {
				body.style.setProperty(property, color);
			}
		});
	},

	/**
	 * ウィンドウフォーカス状態を body に反映する
	 * @param {boolean} focused フォーカス中なら true
	 * @returns {void}
	 */
	SetWindowFocus: function (focused) {
		document.body.classList.toggle('tms-grep-window-focused', focused);
	},

	/**
	 * ウィンドウフォーカス状態イベントを登録する
	 * @returns {void}
	 */
	BindWindowFocusEvents: function () {
		window.addEventListener('focus', () => {
			TMS_GREP.Theme.SetWindowFocus(true);
		});
		window.addEventListener('blur', () => {
			TMS_GREP.Theme.SetWindowFocus(false);
		});
	},

	/**
	 * 次のテーマ設定を返す
	 * @param {'system' | 'dark' | 'light'} current 現在のテーマ
	 * @returns {'system' | 'dark' | 'light'} 次のテーマ
	 */
	GetNextTheme: function (current) {
		const index = THEME_CYCLE.indexOf(current);

		if (index < 0) {
			return 'system';
		}

		return THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
	},

	/**
	 * テーマ表示名を返す
	 * @param {'system' | 'dark' | 'light'} theme テーマ
	 * @returns {string} 表示名
	 */
	GetLabel: function (theme) {
		return THEME_LABELS[theme] ?? theme;
	},
});

Object.assign(TMS_GREP.Es, {
	/** @type {object | null} */
	_status: null,

	/** @type {boolean} */
	_running: false,

	/**
	 * 入力値から空白除去後の長さを返す
	 * @param {string} value 入力値
	 * @returns {number} 長さ
	 */
	TrimmedLength: function (value) {
		return (value ?? '').replace(/[\s\u3000]+/g, '').length;
	},

	/**
	 * es.exe 警告表示を更新する
	 * @returns {void}
	 */
	UpdateWarning: function () {
		const banner = document.getElementById('tmsGrepEsWarning');
		const textEl = document.getElementById('tmsGrepEsWarningText');
		const status = TMS_GREP.Es._status;

		if (!banner || !textEl) {
			return;
		}

		if (status?.available) {
			banner.hidden = true;
			return;
		}

		banner.hidden      = false;
		textEl.textContent = status?.message
			?? 'es.exe が見つかりません。Everything CLI のインストール、または設定画面からパスを指定してください。';
	},

	/**
	 * ボタン活性状態を更新する
	 * @returns {void}
	 */
	UpdateButtons: function () {
		TMS_GREP.Search.UpdateButtons();
	},

	/**
	 * es.exe を検出する
	 * @returns {Promise<void>}
	 */
	Detect: async function () {
		TMS_GREP.Es._status = await window.grepApi.detectEs();
		TMS_GREP.Es.UpdateWarning();
		TMS_GREP.Es.UpdateButtons();
	},

	/**
	 * 候補ファイル取得結果の件数を返す
	 * @param {object} result 検索結果
	 * @returns {number} 候補ファイル件数
	 */
	GetCandidateFileCount: function (result) {
		if (Number.isFinite(result?.fileCount)) {
			return result.fileCount;
		}

		return result?.files?.length ?? 0;
	},

	/**
	 * 候補ファイル取得結果を表示する
	 * @param {object} result 検索結果
	 * @returns {void}
	 */
	ShowResultSummary: function (result) {
		const summaryEl = document.getElementById('tmsGrepEsResultSummary');

		if (!summaryEl) {
			return;
		}

		if (!result?.success) {
			summaryEl.hidden      = false;
			summaryEl.textContent = result?.message ?? '候補ファイルの取得に失敗しました。';
			TMS_GREP.Search.UpdateResultsLayout();
			return;
		}

		const fileCount = TMS_GREP.Es.GetCandidateFileCount(result);

		summaryEl.hidden      = false;
		summaryEl.textContent = `候補ファイル ${fileCount} 件を ${(result.elapsedMs / 1000).toFixed(1)} 秒で取得しました。`;
		TMS_GREP.Search.UpdateResultsLayout();
	},

	/**
	 * 候補ファイル取得を実行する
	 * @returns {Promise<void>}
	 */
	RunCandidateSearch: async function () {
		const fileNameInput   = document.getElementById('tmsGrepFileNameQuery');
		const targetInput     = document.getElementById('tmsGrepTargetPath');
		const extensionsInput = document.getElementById('tmsGrepTargetExtensions');
		const regexInput      = document.getElementById('tmsGrepFileNameRegex');

		if (!fileNameInput || TMS_GREP.Es._running) {
			return;
		}

		TMS_GREP.Search.PersistLastSearchImmediate();

		const fileNameQuery = fileNameInput.value.trim();

		if (!TMS_GREP.Search.HasValidFileNameQuery()) {
			TMS_GREP_COMMON.Ui.ShowToast(
				TMS_GREP.Search._fileNameErrorMessage || 'ファイル名検索条件を入力してください。',
				'warn',
			);
			return;
		}

		TMS_GREP.Es._running = true;
		TMS_GREP.Es.UpdateButtons();

		try {
			const result = await window.grepApi.searchEsCandidates({
				fileNameQuery,
				targetPath: targetInput?.value.trim() || undefined,
				targetExtensions: extensionsInput?.value.trim() || undefined,
				regex     : Boolean(regexInput?.checked),
			});

			TMS_GREP.Es.ShowResultSummary(result);

			if (result?.warnings?.length) {
				TMS_GREP_COMMON.Ui.ShowToast(result.warnings.join('\n'), 'warn');
			}

			if (result?.success) {
				const fileCount = TMS_GREP.Es.GetCandidateFileCount(result);

				TMS_GREP_COMMON.Ui.ShowToast(`候補 ${fileCount} 件`, 'info');
				window.grepApi.writeLog('INFO', 'es.exe candidate search completed', {
					count    : fileCount,
					elapsedMs: result.elapsedMs,
				});
			} else {
				TMS_GREP_COMMON.Ui.ShowToast(result?.message ?? '候補ファイルの取得に失敗しました。', 'error');
				window.grepApi.writeLog('WARN', 'es.exe candidate search failed', {
					message: result?.message,
					stderr : result?.stderr,
				});
			}
		} finally {
			TMS_GREP.Es._running = false;
			TMS_GREP.Es.UpdateButtons();
		}
	},

	/**
	 * 入力欄イベントを登録する
	 * @returns {void}
	 */
	BindInputs: function () {
		const fileNameInput = document.getElementById('tmsGrepFileNameQuery');
		const esTestBtn     = document.getElementById('tmsGrepBtnEsTest');

		if (fileNameInput) {
			fileNameInput.addEventListener('input', () => {
				TMS_GREP.Es.UpdateButtons();
			});
		}

		if (esTestBtn) {
			esTestBtn.addEventListener('click', () => {
				void TMS_GREP.Es.RunCandidateSearch();
			});
		}
	},

	/**
	 * 保存済み検索条件を復元する
	 * @returns {void}
	 */
	RestoreLastSearch: function () {
		const config = TMS_GREP.App._config;

		if (!config?.settings.restoreLastSearch) {
			return;
		}

		const fileNameInput      = document.getElementById('tmsGrepFileNameQuery');
		const fileNameRegexInput = document.getElementById('tmsGrepFileNameRegex');
		const targetInput        = document.getElementById('tmsGrepTargetPath');
		const extensionsInput    = document.getElementById('tmsGrepTargetExtensions');
		const lastSearch         = config.lastSearch;

		if (fileNameInput) {
			fileNameInput.value = lastSearch.fileNameQuery ?? '';
		}

		if (fileNameRegexInput instanceof HTMLInputElement) {
			fileNameRegexInput.checked = Boolean(lastSearch.fileNameRegex);
		}

		if (targetInput) {
			targetInput.value = lastSearch.targetPath ?? '';
		}

		if (extensionsInput) {
			extensionsInput.value = lastSearch.targetExtensions ?? '';
		}
	},
});

Object.assign(TMS_GREP.App, {
	/** @type {object | null} */
	_config: null,

	/** @type {string} */
	_lastUpdateErrorMessage: '',

	/** @type {number} */
	_lastUpdateErrorAt: 0,

	/**
	 * アプリタイトル表示を更新する
	 * @param {boolean} isAdministrator 管理者権限なら true
	 * @returns {void}
	 */
	UpdateTitle: function (isAdministrator) {
		const titleEl = document.getElementById('tmsGrepTitle');
		const title   = isAdministrator
			? `${APP_TITLE}${ADMINISTRATOR_TITLE_SUFFIX}`
			: APP_TITLE;

		document.title = title;

		if (titleEl) {
			titleEl.textContent = title;
			titleEl.title       = title;
		}
	},

	/**
	 * ステータス表示を更新する
	 * @returns {void}
	 */
	UpdateStatus: function () {
		const statusEl = document.getElementById('tmsGrepStatus');
		const config   = TMS_GREP.App._config;

		if (!statusEl || !config) {
			return;
		}

		const themeLabel = TMS_GREP.Theme.GetLabel(config.settings.theme);
		const esLabel    = TMS_GREP.Es._status?.available
			? `es.exe: ${TMS_GREP.Es._status.path}`
			: 'es.exe: 未検出';

		statusEl.textContent = `準備完了 — テーマ: ${themeLabel} / ${esLabel}`;
	},

	/**
	 * 検索完了後のステータス表示を更新する
	 * @param {import('../main/types').SearchJobComplete} result 完了結果
	 * @returns {void}
	 */
	UpdateStatusAfterSearch: function (result) {
		const statusEl = document.getElementById('tmsGrepStatus');

		if (!statusEl) {
			return;
		}

		const stateLabel = result.state === 'cancelled'
			? 'キャンセル済み'
			: result.state === 'failed'
				? '失敗'
				: '完了';

		statusEl.textContent = `${stateLabel} — 候補 ${result.candidateFileCount} 件 / 検索済 ${result.searchedFileCount} 件 / ヒット ${result.hitCount} 件 / スキップ ${result.skippedCount} 件 / 読取エラー ${result.errorCount} 件 / ${(result.elapsedMs / 1000).toFixed(1)} 秒`;
	},

	/**
	 * Renderer のグローバルエラーハンドラを登録する
	 * @returns {void}
	 */
	RegisterGlobalErrorHandlers: function () {
		window.addEventListener('error', (event) => {
			TMS_GREP_COMMON.Ui.LogError('Uncaught error in renderer', {
				message: event.message,
				source : event.filename,
				line    : event.lineno,
				column  : event.colno,
			});
		});

		window.addEventListener('unhandledrejection', (event) => {
			const reason = event.reason;

			TMS_GREP_COMMON.Ui.LogError('Unhandled rejection in renderer', {
				reason: reason instanceof Error ? reason.message : String(reason),
			});
		});
	},

	/**
	 * 自動更新の状態通知を処理する
	 * @param {import('../main/types').UpdateStatusPayload} payload 通知内容
	 * @returns {void}
	 */
	HandleUpdateStatus: function (payload) {
		if (payload.type === 'available') {
			TMS_GREP_COMMON.Ui.ShowToast(
				`新しいバージョン v${payload.version} をダウンロードしています…`,
				'info',
			);
			return;
		}

		if (payload.type === 'downloaded') {
			TMS_GREP_COMMON.Ui.ShowToast(
				`バージョン v${payload.version} のアップデートをダウンロードしました。`,
				'info',
			);
			return;
		}

		if (payload.type !== 'error') {
			return;
		}

		const now = Date.now();

		if (
			payload.message === TMS_GREP.App._lastUpdateErrorMessage
			&& now - TMS_GREP.App._lastUpdateErrorAt < 5000
		) {
			return;
		}

		TMS_GREP.App._lastUpdateErrorMessage = payload.message;
		TMS_GREP.App._lastUpdateErrorAt      = now;
		TMS_GREP_COMMON.Ui.ShowToast(payload.message, 'error');
	},

	/**
	 * 設定ボタン押下（Phase 1: テーマ切替の動作確認用）
	 * @returns {Promise<void>}
	 */
	CycleTheme: async function () {
		const config = TMS_GREP.App._config;

		if (!config) {
			return;
		}

		const nextTheme = TMS_GREP.Theme.GetNextTheme(config.settings.theme);
		const result    = await window.grepApi.updateSettings({ theme: nextTheme });

		if (!result?.success || !result.config) {
			TMS_GREP_COMMON.Ui.ShowToast(result?.message ?? 'テーマの保存に失敗しました。', 'error');
			return;
		}

		TMS_GREP.App._config = result.config;
		await TMS_GREP.Theme.Apply(nextTheme);
		TMS_GREP.App.UpdateStatus();
		TMS_GREP_COMMON.Ui.ShowToast(`テーマを「${TMS_GREP.Theme.GetLabel(nextTheme)}」に変更しました。`, 'info');
		window.grepApi.writeLog('INFO', 'Theme changed from renderer', { theme: nextTheme });
	},

	/**
	 * アプリを初期化する
	 * @returns {Promise<void>}
	 */
	Init: async function () {
		TMS_GREP.App.RegisterGlobalErrorHandlers();

		if (!window.grepApi) {
			TMS_GREP_COMMON.Ui.ShowToast('アプリ API の初期化に失敗しました。', 'error');
			return;
		}

		try {
			const versionResult = await window.grepApi.getVersion();
			const versionEl     = document.getElementById('tmsGrepVersion');

			if (versionEl && versionResult?.version) {
				versionEl.textContent = `v${versionResult.version}`;
			}

			TMS_GREP.App.UpdateTitle(await window.grepApi.isAdministrator());

			const configResult = await window.grepApi.getConfig();

			if (!configResult?.config) {
				TMS_GREP_COMMON.Ui.ShowToast('設定の読み込みに失敗しました。', 'error');
				return;
			}

			TMS_GREP.App._config = configResult.config;

			if (configResult.message) {
				TMS_GREP_COMMON.Ui.ShowToast(configResult.message, 'warn');
			}

			await window.grepApi.applyTheme(configResult.config.settings.theme);
			await TMS_GREP.Theme.Apply(configResult.config.settings.theme);
			await TMS_GREP.Theme.ApplyWindowChrome();
			TMS_GREP.Theme.SetWindowFocus(document.hasFocus());
			TMS_GREP.Theme.BindWindowFocusEvents();
			TMS_GREP.App.UpdateStatus();

			window.grepApi.onThemeChanged(async () => {
				const theme = TMS_GREP.App._config?.settings.theme ?? 'system';

				if (theme === 'system') {
					await TMS_GREP.Theme.Apply('system');
				}

				await TMS_GREP.Theme.ApplyWindowChrome();
			});

			window.grepApi.onWindowFocusChanged((focused) => {
				TMS_GREP.Theme.SetWindowFocus(focused);
			});

			window.grepApi.onUpdateStatus((payload) => {
				TMS_GREP.App.HandleUpdateStatus(payload);
			});

			window.grepApi.onBeforeClose(async () => {
				await TMS_GREP.Search.PersistLastSearchImmediate();
				window.grepApi.notifyCloseReady();
			});

			const settingsBtn = document.getElementById('tmsGrepBtnSettings');

			if (settingsBtn) {
				settingsBtn.addEventListener('click', () => {
					void TMS_GREP.Settings.Open();
				});
			}

			TMS_GREP.Es.BindInputs();
			TMS_GREP.Search._suppressLastSearchPersist = true;

			try {
				TMS_GREP.Es.RestoreLastSearch();
				TMS_GREP.Search.RestoreLastSearch();
			} finally {
				TMS_GREP.Search._suppressLastSearchPersist = false;
			}

			TMS_GREP.Confirm.BindEvents();
			TMS_GREP.Settings.BindEvents();
			TMS_GREP.Results.Init();
			TMS_GREP.Search.BindEvents();
			TMS_GREP.Keyboard.BindEvents();
			void TMS_GREP.Search.ValidateFileNameQuery();
			void TMS_GREP.Search.ValidateContentRegex();
			await TMS_GREP.Es.Detect();
			TMS_GREP.App.UpdateStatus();

			window.grepApi.writeLog('INFO', 'Renderer initialized');
		} catch (error) {
			TMS_GREP_COMMON.Ui.LogError('Failed to initialize renderer', {
				error: error instanceof Error ? error.message : String(error),
			});
			TMS_GREP_COMMON.Ui.ShowToast('アプリの初期化に失敗しました。', 'error');
		}
	},
});

document.addEventListener('DOMContentLoaded', () => {
	void TMS_GREP.App.Init();
});
