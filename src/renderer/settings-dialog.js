'use strict';

Object.assign(TMS_GREP.Settings, {
	/** @type {number | null} */
	_applyTimer: null,

	/** @type {boolean} */
	_isApplying: false,

	/** @type {HTMLElement | null} */
	_previousFocus: null,

	/** @type {number} */
	_dialogScrollTop: 0,

	/** @type {string | null} */
	_capturingShortcutButtonId: null,

	/** 設定反映 debounce（ms） */
	_APPLY_MS: 300,

	/**
	 * 設定モーダルが開いているか
	 * @returns {boolean} 開いていれば true
	 */
	IsOpen: function () {
		const modal = document.getElementById('tmsGrepModalSettings');

		return Boolean(modal && !modal.hidden);
	},

	/**
	 * ショートカット記録中か
	 * @returns {boolean} 記録中なら true
	 */
	IsCapturingShortcut: function () {
		return Boolean(TMS_GREP.Settings._capturingShortcutButtonId);
	},

	/**
	 * 設定モーダルのダイアログ要素を返す
	 * @returns {HTMLElement | null} ダイアログ要素
	 */
	GetDialog: function () {
		const dialog = document.querySelector('#tmsGrepModalSettings .tms-grep-modal__dialog--settings');

		return dialog instanceof HTMLElement ? dialog : null;
	},

	/**
	 * テキスト入力値を取得する
	 * @param {string} id 要素 ID
	 * @param {string} fallback フォールバック
	 * @returns {string} 値
	 */
	ReadText: function (id, fallback) {
		const el = document.getElementById(id);

		if (!(el instanceof HTMLInputElement)) {
			return fallback;
		}

		return el.value;
	},

	/**
	 * 数値入力値を取得する
	 * @param {string} id 要素 ID
	 * @param {number} fallback フォールバック
	 * @returns {number} 値
	 */
	ReadNumber: function (id, fallback) {
		const el = document.getElementById(id);

		if (!(el instanceof HTMLInputElement)) {
			return fallback;
		}

		const value = Number(el.value);

		return Number.isFinite(value) ? value : fallback;
	},

	/**
	 * チェックボックス値を取得する
	 * @param {string} id 要素 ID
	 * @param {boolean} fallback フォールバック
	 * @returns {boolean} 値
	 */
	ReadCheckbox: function (id, fallback) {
		const el = document.getElementById(id);

		if (!(el instanceof HTMLInputElement) || el.type !== 'checkbox') {
			return fallback;
		}

		return el.checked;
	},

	/**
	 * select 値を取得する
	 * @param {string} id 要素 ID
	 * @param {string} fallback フォールバック
	 * @returns {string} 値
	 */
	ReadSelect: function (id, fallback) {
		const el = document.getElementById(id);

		if (!(el instanceof HTMLSelectElement)) {
			return fallback;
		}

		return el.value || fallback;
	},

	/**
	 * テキスト入力値を設定する
	 * @param {string} id 要素 ID
	 * @param {string} value 値
	 * @returns {void}
	 */
	SetText: function (id, value) {
		const el = document.getElementById(id);

		if (el instanceof HTMLInputElement) {
			el.value = value ?? '';
		}
	},

	/**
	 * 数値入力値を設定する
	 * @param {string} id 要素 ID
	 * @param {number} value 値
	 * @returns {void}
	 */
	SetNumber: function (id, value) {
		const el = document.getElementById(id);

		if (el instanceof HTMLInputElement) {
			el.value = String(value);
		}
	},

	/**
	 * チェックボックス値を設定する
	 * @param {string} id 要素 ID
	 * @param {boolean} value 値
	 * @returns {void}
	 */
	SetCheckbox: function (id, value) {
		const el = document.getElementById(id);

		if (el instanceof HTMLInputElement && el.type === 'checkbox') {
			el.checked = Boolean(value);
		}
	},

	/**
	 * select 値を設定する
	 * @param {string} id 要素 ID
	 * @param {string} value 値
	 * @returns {void}
	 */
	SetSelect: function (id, value) {
		const el = document.getElementById(id);

		if (el instanceof HTMLSelectElement) {
			el.value = value;
		}
	},

	/**
	 * ショートカットボタンの表示を更新する
	 * @param {string} id 要素 ID
	 * @param {string} value ショートカット
	 * @returns {void}
	 */
	SetShortcutButton: function (id, value) {
		const el = document.getElementById(id);

		if (!(el instanceof HTMLButtonElement)) {
			return;
		}

		const shortcut           = value ?? '';
		el.textContent           = shortcut;
		el.dataset.shortcutValue = shortcut;
	},

	/**
	 * ショートカットボタンの値を取得する
	 * @param {string} id 要素 ID
	 * @param {string} fallback フォールバック
	 * @returns {string} ショートカット
	 */
	ReadShortcutButton: function (id, fallback) {
		const el = document.getElementById(id);

		if (!(el instanceof HTMLButtonElement)) {
			return fallback;
		}

		const value = el.dataset.shortcutValue || el.textContent.trim();

		return value || fallback;
	},

	/**
	 * フォームに現在の設定を反映する
	 * @returns {void}
	 */
	LoadForm: function () {
		const settings = TMS_GREP.App._config?.settings;

		if (!settings) {
			return;
		}

		TMS_GREP.Settings.SetSelect('tmsGrepSettingsTheme', settings.theme);
		TMS_GREP.Settings.SetCheckbox('tmsGrepSettingsConfirmBeforeSearch', settings.confirmBeforeSearch);
		TMS_GREP.Settings.SetCheckbox('tmsGrepSettingsRestoreLastSearch', settings.restoreLastSearch);
		TMS_GREP.Settings.SetText('tmsGrepSettingsEsExePath', settings.esExePath);
		TMS_GREP.Settings.SetCheckbox('tmsGrepSettingsFileNameCaseSensitive', settings.fileNameSearch.caseSensitive);
		TMS_GREP.Settings.SetCheckbox('tmsGrepSettingsFileNameWholeWord', settings.fileNameSearch.wholeWord);
		TMS_GREP.Settings.SetCheckbox('tmsGrepSettingsFileNameMatchPath', settings.fileNameSearch.matchPath);
		TMS_GREP.Settings.SetCheckbox('tmsGrepSettingsFileNameDiacritics', settings.fileNameSearch.diacritics);
		TMS_GREP.Settings.SetNumber('tmsGrepSettingsMaxCandidateFiles', settings.fileNameSearch.maxCandidateFiles);
		TMS_GREP.Settings.SetSelect('tmsGrepSettingsFileNameSort', settings.fileNameSearch.sort);
		TMS_GREP.Settings.SetNumber('tmsGrepSettingsFileNameTimeoutMs', settings.fileNameSearch.timeoutMs);
		TMS_GREP.Settings.SetText('tmsGrepSettingsAdditionalArgs', settings.fileNameSearch.additionalArgs);
		TMS_GREP.Settings.SetCheckbox('tmsGrepSettingsContentCaseSensitive', settings.contentSearch.caseSensitive);
		TMS_GREP.Settings.SetSelect('tmsGrepSettingsContentEncoding', settings.contentSearch.encoding);
		TMS_GREP.Settings.SetNumber('tmsGrepSettingsMaxFileSizeMb', settings.contentSearch.maxFileSizeMb);
		TMS_GREP.Settings.SetCheckbox('tmsGrepSettingsSkipBinary', settings.contentSearch.skipBinary);
		TMS_GREP.Settings.SetNumber('tmsGrepSettingsConcurrency', settings.contentSearch.concurrency);
		TMS_GREP.Settings.SetNumber('tmsGrepSettingsMaxRows', settings.results.maxRows);
		TMS_GREP.Settings.SetSelect('tmsGrepSettingsCopyFormat', settings.results.copyFormat);
		TMS_GREP.Settings.SetSelect('tmsGrepSettingsCopyLineEnding', settings.results.copyLineEnding);
		TMS_GREP.Settings.SetSelect('tmsGrepSettingsTabHandling', settings.results.tabHandling);
		TMS_GREP.Settings.SetNumber('tmsGrepSettingsTabSize', settings.results.tabSize);
		TMS_GREP.Settings.SetCheckbox('tmsGrepSettingsTrimLineText', settings.results.trimLineText);
		TMS_GREP.Settings.UpdateTabSizeVisibility();
		TMS_GREP.Settings.SetShortcutButton('tmsGrepSettingsKbToggleFileNameRegex', settings.keybindings.toggleFileNameRegex);
		TMS_GREP.Settings.SetShortcutButton('tmsGrepSettingsKbToggleContentRegex', settings.keybindings.toggleContentRegex);
		TMS_GREP.Settings.SetShortcutButton('tmsGrepSettingsKbRunSearch', settings.keybindings.runSearch);
		TMS_GREP.Settings.SetShortcutButton('tmsGrepSettingsKbClear', settings.keybindings.clear);
		TMS_GREP.Settings.UpdateAdditionalArgsError('');
		void TMS_GREP.Settings.RefreshEsDetectStatus();
	},

	/**
	 * フォームから設定オブジェクトを組み立てる
	 * @returns {import('../../main/types').AppSettings | null} 設定
	 */
	CollectSettings: function () {
		const current = TMS_GREP.App._config?.settings;

		if (!current) {
			return null;
		}

		return {
			theme              : /** @type {'system' | 'dark' | 'light'} */ (
				TMS_GREP.Settings.ReadSelect('tmsGrepSettingsTheme', current.theme)
			),
			confirmBeforeSearch: TMS_GREP.Settings.ReadCheckbox(
				'tmsGrepSettingsConfirmBeforeSearch',
				current.confirmBeforeSearch,
			),
			restoreLastSearch: TMS_GREP.Settings.ReadCheckbox(
				'tmsGrepSettingsRestoreLastSearch',
				current.restoreLastSearch,
			),
			esExePath: TMS_GREP.Settings.ReadText('tmsGrepSettingsEsExePath', current.esExePath).trim(),
			fileNameSearch: {
				...current.fileNameSearch,
				caseSensitive: TMS_GREP.Settings.ReadCheckbox(
					'tmsGrepSettingsFileNameCaseSensitive',
					current.fileNameSearch.caseSensitive,
				),
				wholeWord: TMS_GREP.Settings.ReadCheckbox(
					'tmsGrepSettingsFileNameWholeWord',
					current.fileNameSearch.wholeWord,
				),
				matchPath: TMS_GREP.Settings.ReadCheckbox(
					'tmsGrepSettingsFileNameMatchPath',
					current.fileNameSearch.matchPath,
				),
				diacritics: TMS_GREP.Settings.ReadCheckbox(
					'tmsGrepSettingsFileNameDiacritics',
					current.fileNameSearch.diacritics,
				),
				maxCandidateFiles: TMS_GREP.Settings.ReadNumber(
					'tmsGrepSettingsMaxCandidateFiles',
					current.fileNameSearch.maxCandidateFiles,
				),
				sort: /** @type {import('../../main/types').EsSortOption} */ (
					TMS_GREP.Settings.ReadSelect('tmsGrepSettingsFileNameSort', current.fileNameSearch.sort)
				),
				timeoutMs: TMS_GREP.Settings.ReadNumber(
					'tmsGrepSettingsFileNameTimeoutMs',
					current.fileNameSearch.timeoutMs,
				),
				additionalArgs: TMS_GREP.Settings.ReadText(
					'tmsGrepSettingsAdditionalArgs',
					current.fileNameSearch.additionalArgs,
				).trim(),
			},
			contentSearch: {
				...current.contentSearch,
				caseSensitive: TMS_GREP.Settings.ReadCheckbox(
					'tmsGrepSettingsContentCaseSensitive',
					current.contentSearch.caseSensitive,
				),
				encoding: /** @type {import('../../main/types').EncodingSetting} */ (
					TMS_GREP.Settings.ReadSelect('tmsGrepSettingsContentEncoding', current.contentSearch.encoding)
				),
				maxFileSizeMb: TMS_GREP.Settings.ReadNumber(
					'tmsGrepSettingsMaxFileSizeMb',
					current.contentSearch.maxFileSizeMb,
				),
				skipBinary: TMS_GREP.Settings.ReadCheckbox(
					'tmsGrepSettingsSkipBinary',
					current.contentSearch.skipBinary,
				),
				concurrency: TMS_GREP.Settings.ReadNumber(
					'tmsGrepSettingsConcurrency',
					current.contentSearch.concurrency,
				),
			},
			results: {
				...current.results,
				maxRows: TMS_GREP.Settings.ReadNumber('tmsGrepSettingsMaxRows', current.results.maxRows),
				copyFormat: /** @type {import('../../main/types').CopyFormat} */ (
					TMS_GREP.Settings.ReadSelect('tmsGrepSettingsCopyFormat', current.results.copyFormat)
				),
				copyLineEnding: /** @type {import('../../main/types').CopyLineEnding} */ (
					TMS_GREP.Settings.ReadSelect('tmsGrepSettingsCopyLineEnding', current.results.copyLineEnding)
				),
				tabHandling: /** @type {import('../../main/types').TabHandling} */ (
					TMS_GREP.Settings.ReadSelect('tmsGrepSettingsTabHandling', current.results.tabHandling)
				),
				tabSize: TMS_GREP.Settings.ReadNumber(
					'tmsGrepSettingsTabSize',
					current.results.tabSize,
				),
				trimLineText: TMS_GREP.Settings.ReadCheckbox(
					'tmsGrepSettingsTrimLineText',
					current.results.trimLineText,
				),
			},
			keybindings: {
				toggleFileNameRegex: TMS_GREP.Settings.ReadShortcutButton(
					'tmsGrepSettingsKbToggleFileNameRegex',
					current.keybindings.toggleFileNameRegex,
				),
				toggleContentRegex: TMS_GREP.Settings.ReadShortcutButton(
					'tmsGrepSettingsKbToggleContentRegex',
					current.keybindings.toggleContentRegex,
				),
				runSearch: TMS_GREP.Settings.ReadShortcutButton(
					'tmsGrepSettingsKbRunSearch',
					current.keybindings.runSearch,
				),
				clear: TMS_GREP.Settings.ReadShortcutButton(
					'tmsGrepSettingsKbClear',
					current.keybindings.clear,
				),
			},
		};
	},

	/**
	 * タブサイズ入力の表示状態を更新する
	 * @returns {void}
	 */
	UpdateTabSizeVisibility: function () {
		const handlingEl = document.getElementById('tmsGrepSettingsTabHandling');
		const tabSizeRow = document.getElementById('tmsGrepSettingsTabSizeRow');

		if (!(handlingEl instanceof HTMLSelectElement) || !tabSizeRow) {
			return;
		}

		tabSizeRow.hidden = handlingEl.value === 'preserve';
	},

	/**
	 * 追加オプションのエラー表示を更新する
	 * @param {string} message エラーメッセージ
	 * @returns {void}
	 */
	UpdateAdditionalArgsError: function (message) {
		const errorEl = document.getElementById('tmsGrepSettingsAdditionalArgsError');

		if (!errorEl) {
			return;
		}

		if (message) {
			errorEl.hidden      = false;
			errorEl.textContent = message;
		} else {
			errorEl.hidden      = true;
			errorEl.textContent = '';
		}
	},

	/**
	 * 設定保存状態を表示する
	 * @param {string} [message] メッセージ（空なら非表示）
	 * @returns {void}
	 */
	UpdateSaveStatus: function (message) {
		const statusEl = document.getElementById('tmsGrepSettingsSaveStatus');

		if (!statusEl) {
			return;
		}

		if (message) {
			statusEl.hidden      = false;
			statusEl.textContent = message;
			statusEl.className   = 'tms-grep-settings__status tms-grep-settings__save-status tms-grep-settings__status--error';
			return;
		}

		statusEl.hidden      = true;
		statusEl.textContent = '';
		statusEl.className   = 'tms-grep-settings__status tms-grep-settings__save-status tms-grep-settings__status--warn';
	},

	/**
	 * es.exe 検出状態表示を更新する
	 * @returns {Promise<void>}
	 */
	RefreshEsDetectStatus: async function () {
		const statusEl = document.getElementById('tmsGrepSettingsEsDetectStatus');

		if (!statusEl) {
			return;
		}

		const detect = await window.grepApi.detectEs();

		if (detect.available) {
			statusEl.textContent = detect.version
				? `検出済み: ${detect.path} (${detect.version})`
				: `検出済み: ${detect.path}`;
			statusEl.className   = 'tms-grep-settings__status tms-grep-settings__status--ok';
			return;
		}

		statusEl.textContent = detect.message ?? 'es.exe が見つかりません。';
		statusEl.className   = 'tms-grep-settings__status tms-grep-settings__status--warn';
	},

	/**
	 * 設定反映を遅延実行する
	 * @returns {void}
	 */
	ScheduleApply: function () {
		if (TMS_GREP.Settings._applyTimer !== null) {
			window.clearTimeout(TMS_GREP.Settings._applyTimer);
		}

		TMS_GREP.Settings._applyTimer = window.setTimeout(() => {
			TMS_GREP.Settings._applyTimer = null;
			void TMS_GREP.Settings.ApplySettings();
		}, TMS_GREP.Settings._APPLY_MS);
	},

	/**
	 * 未反映の設定を即時保存する
	 * @returns {Promise<void>}
	 */
	FlushApply: async function () {
		if (TMS_GREP.Settings._applyTimer !== null) {
			window.clearTimeout(TMS_GREP.Settings._applyTimer);
			TMS_GREP.Settings._applyTimer = null;
		}

		await TMS_GREP.Settings.ApplySettings();
	},

	/**
	 * 設定を保存して反映する
	 * @returns {Promise<void>}
	 */
	ApplySettings: async function () {
		const current = TMS_GREP.App._config?.settings;

		if (!current || TMS_GREP.Settings._isApplying) {
			return;
		}

		const nextSettings = TMS_GREP.Settings.CollectSettings();

		if (!nextSettings) {
			return;
		}

		const validation = await window.grepApi.validateEsAdditionalArgs(
			nextSettings.fileNameSearch.additionalArgs,
		);

		if (!validation.valid) {
			TMS_GREP.Settings.UpdateAdditionalArgsError(
				validation.errors.join(' ') || '追加オプションが不正です。',
			);
			return;
		}

		TMS_GREP.Settings.UpdateAdditionalArgsError('');

		if (validation.warnings.length > 0) {
			TMS_GREP_COMMON.Ui.ShowToast(validation.warnings.join('\n'), 'warn');
		}

		TMS_GREP.Settings._isApplying = true;

		try {
			const previousTheme  = current.theme;
			const previousEsPath = current.esExePath;
			const result         = await window.grepApi.updateSettings(nextSettings);

			if (!result?.success || !result.config) {
				TMS_GREP_COMMON.Ui.ShowToast(result?.message ?? '設定の保存に失敗しました。', 'error');
				TMS_GREP.Settings.UpdateSaveStatus(
					result?.message ?? '設定の保存に失敗しました。未保存の変更があります。',
				);
				return;
			}

			TMS_GREP.Settings.UpdateSaveStatus('');
			TMS_GREP.App._config = result.config;
			TMS_GREP.Settings.LoadForm();

			if (result.config.settings.theme !== previousTheme) {
				await TMS_GREP.Theme.Apply(result.config.settings.theme);
			}

			if (result.config.settings.esExePath !== previousEsPath) {
				await TMS_GREP.Es.Detect();
			} else {
				await TMS_GREP.Settings.RefreshEsDetectStatus();
			}

			TMS_GREP.App.UpdateStatus();
			TMS_GREP.Search.UpdateButtons();
		} finally {
			TMS_GREP.Settings._isApplying = false;
		}
	},

	/**
	 * 設定項目を既定値へ戻す
	 * @param {string} itemKey 設定キー
	 * @returns {Promise<void>}
	 */
	ResetField: async function (itemKey) {
		TMS_GREP.Settings.CancelShortcutCapture();

		const result = await window.grepApi.resetSettingItem(itemKey);

		if (!result?.success || !result.config) {
			TMS_GREP_COMMON.Ui.ShowToast(result?.message ?? '設定のリセットに失敗しました。', 'error');
			return;
		}

		TMS_GREP.App._config = result.config;
		TMS_GREP.Settings.LoadForm();
		await TMS_GREP.Theme.Apply(result.config.settings.theme);
		await TMS_GREP.Es.Detect();
		TMS_GREP.App.UpdateStatus();
		TMS_GREP.Search.UpdateButtons();
		TMS_GREP_COMMON.Ui.ShowToast('設定を既定値に戻しました。', 'info');
	},

	/**
	 * すべての設定を既定値へ戻す
	 * @returns {Promise<void>}
	 */
	ResetAll: async function () {
		const ok = window.confirm('すべての設定を既定値に戻します。よろしいですか？');

		if (!ok) {
			return;
		}

		TMS_GREP.Settings.CancelShortcutCapture();

		const result = await window.grepApi.resetAllConfig();

		if (!result?.success || !result.config) {
			TMS_GREP_COMMON.Ui.ShowToast(result?.message ?? '設定のリセットに失敗しました。', 'error');
			return;
		}

		TMS_GREP.App._config = result.config;
		TMS_GREP.Settings.LoadForm();
		await TMS_GREP.Theme.Apply(result.config.settings.theme);
		await TMS_GREP.Es.Detect();
		TMS_GREP.App.UpdateStatus();
		TMS_GREP.Search.UpdateButtons();
		TMS_GREP_COMMON.Ui.ShowToast('すべての設定を既定値に戻しました。', 'info');
	},

	/**
	 * es.exe 参照ダイアログを開く
	 * @returns {Promise<void>}
	 */
	BrowseEsExePath: async function () {
		const selected = await window.grepApi.openExecutableDialog();

		if (!selected) {
			return;
		}

		TMS_GREP.Settings.SetText('tmsGrepSettingsEsExePath', selected);
		await TMS_GREP.Settings.ApplySettings();
	},

	/**
	 * ショートカット記録を開始する
	 * @param {string} buttonId ボタン ID
	 * @returns {void}
	 */
	StartShortcutCapture: function (buttonId) {
		TMS_GREP.Settings.CancelShortcutCapture();

		const button = document.getElementById(buttonId);

		if (!(button instanceof HTMLButtonElement)) {
			return;
		}

		TMS_GREP.Settings._capturingShortcutButtonId = buttonId;
		button.dataset.capturePrevious               = TMS_GREP.Settings.ReadShortcutButton(
			buttonId,
			button.textContent.trim(),
		);
		button.textContent                           = 'キーを押してください…';
		button.classList.add('tms-grep-settings__shortcut--capturing');
		button.focus();
	},

	/**
	 * ショートカット記録をキャンセルする
	 * @returns {void}
	 */
	CancelShortcutCapture: function () {
		const buttonId = TMS_GREP.Settings._capturingShortcutButtonId;

		if (!buttonId) {
			return;
		}

		const button = document.getElementById(buttonId);

		if (button instanceof HTMLButtonElement) {
			const previous = button.dataset.capturePrevious ?? button.dataset.shortcutValue ?? '';

			button.textContent           = previous;
			button.dataset.shortcutValue = previous;
			button.classList.remove('tms-grep-settings__shortcut--capturing');
			delete button.dataset.capturePrevious;
		}

		TMS_GREP.Settings._capturingShortcutButtonId = null;
	},

	/**
	 * 押下キーをショートカットとして記録する
	 * @param {KeyboardEvent} event キーイベント
	 * @returns {boolean} 処理したら true
	 */
	HandleShortcutCapture: function (event) {
		if (!TMS_GREP.Settings._capturingShortcutButtonId) {
			return false;
		}

		event.preventDefault();
		event.stopPropagation();

		if (event.key === 'Escape') {
			TMS_GREP.Settings.CancelShortcutCapture();
			return true;
		}

		const shortcut = TMS_GREP.Keyboard.FormatShortcutFromEvent(event);

		if (!shortcut) {
			return true;
		}

		const buttonId = TMS_GREP.Settings._capturingShortcutButtonId;
		const button   = document.getElementById(buttonId);

		if (button instanceof HTMLButtonElement) {
			TMS_GREP.Settings.SetShortcutButton(buttonId, shortcut);
			button.classList.remove('tms-grep-settings__shortcut--capturing');
			delete button.dataset.capturePrevious;
		}

		TMS_GREP.Settings._capturingShortcutButtonId = null;
		TMS_GREP.Settings.ScheduleApply();

		return true;
	},

	/**
	 * モーダルを表示する
	 * @returns {void}
	 */
	Show: function () {
		const modal = document.getElementById('tmsGrepModalSettings');

		if (!modal) {
			return;
		}

		TMS_GREP.Settings._previousFocus = document.activeElement instanceof HTMLElement
			? document.activeElement
			: null;
		modal.hidden                     = false;

		const dialog = TMS_GREP.Settings.GetDialog();

		if (dialog) {
			dialog.scrollTop = TMS_GREP.Settings._dialogScrollTop;
			dialog.setAttribute('tabindex', '-1');
			dialog.focus({ preventScroll: true });
		}
	},

	/**
	 * モーダルを閉じる
	 * @returns {Promise<void>}
	 */
	Close: async function () {
		TMS_GREP.Settings.CancelShortcutCapture();
		await TMS_GREP.Settings.FlushApply();

		const dialog = TMS_GREP.Settings.GetDialog();

		if (dialog) {
			TMS_GREP.Settings._dialogScrollTop = dialog.scrollTop;
		}

		const modal = document.getElementById('tmsGrepModalSettings');

		if (modal) {
			modal.hidden = true;
		}

		if (TMS_GREP.Settings._previousFocus) {
			TMS_GREP.Settings._previousFocus.focus();
			TMS_GREP.Settings._previousFocus = null;
		}
	},

	/**
	 * モーダルを開く
	 * @returns {Promise<void>}
	 */
	Open: async function () {
		TMS_GREP.Settings.UpdateSaveStatus('');
		TMS_GREP.Settings.LoadForm();
		TMS_GREP.Settings.Show();
	},

	/**
	 * Tab キーでフォーカスをモーダル内に留める
	 * @param {KeyboardEvent} event キーイベント
	 * @returns {void}
	 */
	TrapFocus: function (event) {
		if (event.key !== 'Tab') {
			return;
		}

		const dialog = document.querySelector('#tmsGrepModalSettings .tms-grep-modal__dialog');

		if (!dialog) {
			return;
		}

		const focusable = dialog.querySelectorAll(
			'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
		);

		if (focusable.length === 0) {
			return;
		}

		const first = focusable[0];
		const last  = focusable[focusable.length - 1];

		if (!(first instanceof HTMLElement) || !(last instanceof HTMLElement)) {
			return;
		}

		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	},

	/**
	 * イベントを登録する
	 * @returns {void}
	 */
	BindEvents: function () {
		const closeBtn      = document.getElementById('tmsGrepBtnSettingsClose');
		const resetAllBtn   = document.getElementById('tmsGrepBtnSettingsResetAll');
		const browseEsBtn   = document.getElementById('tmsGrepBtnSettingsBrowseEsExe');
		const updateBtn     = document.getElementById('tmsGrepBtnSettingsCheckUpdate');
		const backdrop      = document.getElementById('tmsGrepModalSettingsBackdrop');
		const modal         = document.getElementById('tmsGrepModalSettings');
		const settingInputs = [
			'tmsGrepSettingsTheme',
			'tmsGrepSettingsConfirmBeforeSearch',
			'tmsGrepSettingsRestoreLastSearch',
			'tmsGrepSettingsEsExePath',
			'tmsGrepSettingsFileNameCaseSensitive',
			'tmsGrepSettingsFileNameWholeWord',
			'tmsGrepSettingsFileNameMatchPath',
			'tmsGrepSettingsFileNameDiacritics',
			'tmsGrepSettingsMaxCandidateFiles',
			'tmsGrepSettingsFileNameSort',
			'tmsGrepSettingsFileNameTimeoutMs',
			'tmsGrepSettingsAdditionalArgs',
			'tmsGrepSettingsContentCaseSensitive',
			'tmsGrepSettingsContentEncoding',
			'tmsGrepSettingsMaxFileSizeMb',
			'tmsGrepSettingsSkipBinary',
			'tmsGrepSettingsConcurrency',
			'tmsGrepSettingsMaxRows',
			'tmsGrepSettingsCopyFormat',
			'tmsGrepSettingsCopyLineEnding',
			'tmsGrepSettingsTabHandling',
			'tmsGrepSettingsTabSize',
			'tmsGrepSettingsTrimLineText',
		];

		if (closeBtn) {
			closeBtn.addEventListener('click', () => {
				void TMS_GREP.Settings.Close();
			});
		}

		if (resetAllBtn) {
			resetAllBtn.addEventListener('click', () => {
				void TMS_GREP.Settings.ResetAll();
			});
		}

		if (browseEsBtn) {
			browseEsBtn.addEventListener('click', () => {
				void TMS_GREP.Settings.BrowseEsExePath();
			});
		}

		if (updateBtn) {
			updateBtn.addEventListener('click', () => {
				void TMS_GREP.Settings.CheckForUpdates();
			});
		}

		if (backdrop) {
			backdrop.addEventListener('click', () => {
				void TMS_GREP.Settings.Close();
			});
		}

		for (const id of settingInputs) {
			const el = document.getElementById(id);

			if (!el) {
				continue;
			}

			el.addEventListener('change', () => {
				if (id === 'tmsGrepSettingsTabHandling') {
					TMS_GREP.Settings.UpdateTabSizeVisibility();
				}

				TMS_GREP.Settings.ScheduleApply();
			});

			if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'number')) {
				el.addEventListener('input', () => {
					TMS_GREP.Settings.ScheduleApply();
				});
			}
		}

		const resetButtons = document.querySelectorAll('[data-settings-reset]');

		for (const button of resetButtons) {
			button.addEventListener('click', () => {
				const field = button.getAttribute('data-settings-reset');

				if (field) {
					void TMS_GREP.Settings.ResetField(field);
				}
			});
		}

		const shortcutButtons = document.querySelectorAll('[data-shortcut-capture]');

		for (const button of shortcutButtons) {
			button.addEventListener('click', () => {
				if (button.id) {
					TMS_GREP.Settings.StartShortcutCapture(button.id);
				}
			});
		}

		if (modal) {
			modal.addEventListener('keydown', (event) => {
				if (!(event instanceof KeyboardEvent) || modal.hidden || TMS_GREP.Settings.IsCapturingShortcut()) {
					return;
				}

				TMS_GREP.Settings.TrapFocus(event);
			});
		}
	},

	/**
	 * 更新を手動確認する
	 * @returns {Promise<void>}
	 */
	CheckForUpdates: async function () {
		const btn = document.getElementById('tmsGrepBtnSettingsCheckUpdate');

		if (btn instanceof HTMLButtonElement) {
			btn.disabled = true;
		}

		try {
			const result = await window.grepApi.checkForUpdates();

			if (result.status === 'not-packaged') {
				TMS_GREP_COMMON.Ui.ShowToast('開発版では更新確認できません。', 'warn');
				return;
			}

			if (result.status === 'not-available') {
				TMS_GREP_COMMON.Ui.ShowToast('最新バージョンです。', 'info');
				return;
			}

			if (result.status === 'available') {
				TMS_GREP_COMMON.Ui.ShowToast(
					`新しいバージョン v${result.version ?? ''} が見つかりました。ダウンロードを開始します。`,
					'info',
				);
				return;
			}

			if (result.status === 'error' && result.error) {
				TMS_GREP_COMMON.Ui.ShowToast(result.error, 'error');
			}
		} catch (error) {
			TMS_GREP_COMMON.Ui.ShowToast(
				`更新確認に失敗しました: ${error instanceof Error ? error.message : String(error)}`,
				'error',
			);
		} finally {
			if (btn instanceof HTMLButtonElement) {
				btn.disabled = false;
			}
		}
	},
});
