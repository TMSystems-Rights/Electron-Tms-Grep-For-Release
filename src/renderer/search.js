'use strict';

Object.assign(TMS_GREP.Search, {
	/** @type {boolean} */
	_running: false,

	/** @type {boolean} */
	_cancelling: false,

	/** @type {import('../../main/types').SearchHit[]} */
	_hits: [],

	/** @type {import('../../main/types').SearchJobProgress | null} */
	_progress: null,

	/** @type {boolean | null} */
	_contentRegexValid: null,

	/** @type {boolean | null} */
	_fileNameValid: null,

	/** @type {number | null} */
	_contentRegexValidateTimer: null,

	/** @type {number | null} */
	_fileNameValidateTimer: null,

	/** @type {number | null} */
	_lastSearchPersistTimer: null,

	/** @type {boolean} */
	_suppressLastSearchPersist: false,

	/** 直近検索条件の保存 debounce（ms） */
	_LAST_SEARCH_PERSIST_MS: 300,

	/** @type {(() => void) | null} */
	_unsubscribeState: null,

	/** @type {(() => void) | null} */
	_unsubscribeProgress: null,

	/** @type {(() => void) | null} */
	_unsubscribeResult: null,

	/** @type {(() => void) | null} */
	_unsubscribeComplete: null,

	/**
	 * 検索処理中か判定する
	 * @returns {boolean} 実行中なら true
	 */
	IsBusy: function () {
		return TMS_GREP.Search._running || TMS_GREP.Es._running;
	},

	/**
	 * フォーム値を取得する
	 * @returns {object} フォーム値
	 */
	GetFormValues: function () {
		const fileNameInput   = document.getElementById('tmsGrepFileNameQuery');
		const contentInput    = document.getElementById('tmsGrepContentQuery');
		const targetInput     = document.getElementById('tmsGrepTargetPath');
		const extensionsInput = document.getElementById('tmsGrepTargetExtensions');
		const fileNameRegex   = document.getElementById('tmsGrepFileNameRegex');
		const contentRegex    = document.getElementById('tmsGrepContentRegex');

		return {
			fileNameQuery: fileNameInput?.value.trim() ?? '',
			contentQuery : contentInput?.value.trim() ?? '',
			targetPath   : targetInput?.value.trim() ?? '',
			targetExtensions: extensionsInput?.value.trim() ?? '',
			fileNameRegex: Boolean(fileNameRegex?.checked),
			contentRegex : Boolean(contentRegex?.checked),
		};
	},

	/**
	 * 直近検索条件の保存内容を組み立てる
	 * @returns {import('../../main/types').LastSearch | null} 保存内容
	 */
	BuildLastSearchPayload: function () {
		const values = TMS_GREP.Search.GetFormValues();

		return {
			fileNameQuery: values.fileNameQuery,
			contentQuery : values.contentQuery,
			targetPath   : values.targetPath,
			targetExtensions: values.targetExtensions,
			fileNameRegex: values.fileNameRegex,
			contentRegex : values.contentRegex,
		};
	},

	/**
	 * 直近検索条件が変更されていないか判定する
	 * @param {import('../../main/types').LastSearch} payload 保存内容
	 * @returns {boolean} 変更がなければ true
	 */
	IsLastSearchUnchanged: function (payload) {
		const current = TMS_GREP.App._config?.lastSearch;

		if (!current) {
			return false;
		}

		return current.fileNameQuery === payload.fileNameQuery
			&& current.contentQuery === payload.contentQuery
			&& current.targetPath === payload.targetPath
			&& current.targetExtensions === payload.targetExtensions
			&& current.fileNameRegex === payload.fileNameRegex
			&& current.contentRegex === payload.contentRegex;
	},

	/**
	 * 直近検索条件を config に保存する
	 * @returns {Promise<void>}
	 */
	PersistLastSearch: async function () {
		const config = TMS_GREP.App._config;

		if (!config?.settings.restoreLastSearch || TMS_GREP.Search._suppressLastSearchPersist) {
			return;
		}

		const payload = TMS_GREP.Search.BuildLastSearchPayload();

		if (TMS_GREP.Search.IsLastSearchUnchanged(payload)) {
			return;
		}

		try {
			const result = await window.grepApi.updateLastSearch(payload);

			if (result?.success && result.config) {
				TMS_GREP.App._config = result.config;
			}
		} catch {
			// 入力保存失敗は UI を妨げない
		}
	},

	/**
	 * 直近検索条件の保存を遅延実行する
	 * @returns {void}
	 */
	SchedulePersistLastSearch: function () {
		if (TMS_GREP.Search._suppressLastSearchPersist) {
			return;
		}

		if (TMS_GREP.Search._lastSearchPersistTimer !== null) {
			window.clearTimeout(TMS_GREP.Search._lastSearchPersistTimer);
		}

		TMS_GREP.Search._lastSearchPersistTimer = window.setTimeout(() => {
			TMS_GREP.Search._lastSearchPersistTimer = null;
			void TMS_GREP.Search.PersistLastSearch();
		}, TMS_GREP.Search._LAST_SEARCH_PERSIST_MS);
	},

	/**
	 * 直近検索条件を即時保存する
	 * @returns {Promise<void>}
	 */
	PersistLastSearchImmediate: function () {
		if (TMS_GREP.Search._lastSearchPersistTimer !== null) {
			window.clearTimeout(TMS_GREP.Search._lastSearchPersistTimer);
			TMS_GREP.Search._lastSearchPersistTimer = null;
		}

		return TMS_GREP.Search.PersistLastSearch();
	},

	/**
	 * ファイル名検索条件が有効か判定する
	 * @returns {boolean} 有効なら true
	 */
	HasValidFileNameQuery: function () {
		const values = TMS_GREP.Search.GetFormValues();

		if (TMS_GREP.Es.TrimmedLength(values.fileNameQuery) <= 0) {
			return false;
		}

		return TMS_GREP.Search._fileNameValid !== false;
	},

	/**
	 * ファイル内検索条件が有効か判定する
	 * @returns {boolean} 有効なら true
	 */
	HasValidContentQuery: function () {
		const values = TMS_GREP.Search.GetFormValues();

		if (TMS_GREP.Es.TrimmedLength(values.contentQuery) <= 0) {
			return false;
		}

		if (values.contentRegex) {
			return TMS_GREP.Search._contentRegexValid !== false;
		}

		return true;
	},

	/**
	 * モード表示を更新する
	 * @returns {void}
	 */
	UpdateModeLabels: function () {
		const fileNameRegex = document.getElementById('tmsGrepFileNameRegex');
		const contentRegex  = document.getElementById('tmsGrepContentRegex');
		const fileNameLabel = document.getElementById('tmsGrepFileNameRegexLabel');
		const contentLabel  = document.getElementById('tmsGrepContentRegexLabel');

		if (fileNameLabel) {
			fileNameLabel.classList.toggle('tms-grep-toggle-label--active', Boolean(fileNameRegex?.checked));
		}

		if (contentLabel) {
			contentLabel.classList.toggle('tms-grep-toggle-label--active', Boolean(contentRegex?.checked));
		}
	},

	/**
	 * 入力エラー表示を更新する
	 * @returns {void}
	 */
	UpdateInputErrors: function () {
		const fileNameErrorEl = document.getElementById('tmsGrepFileNameQueryError');
		const contentErrorEl  = document.getElementById('tmsGrepContentRegexError');
		const values          = TMS_GREP.Search.GetFormValues();

		if (fileNameErrorEl) {
			if (TMS_GREP.Es.TrimmedLength(values.fileNameQuery) <= 0
				|| TMS_GREP.Search._fileNameValid !== false) {
				fileNameErrorEl.hidden      = true;
				fileNameErrorEl.textContent = '';
			} else {
				fileNameErrorEl.hidden      = false;
				fileNameErrorEl.textContent = TMS_GREP.Search._fileNameErrorMessage
					?? 'ファイル名検索条件が不正です。';
			}
		}

		if (contentErrorEl) {
			if (!values.contentRegex || TMS_GREP.Search._contentRegexValid !== false) {
				contentErrorEl.hidden      = true;
				contentErrorEl.textContent = '';
			} else {
				contentErrorEl.hidden      = false;
				contentErrorEl.textContent = TMS_GREP.Search._contentRegexErrorMessage
					?? '正規表現が不正です。';
			}
		}
	},

	/** @type {string} */
	_fileNameErrorMessage: '',

	/** @type {string} */
	_contentRegexErrorMessage: '',

	/**
	 * ファイル名検索条件を検証する
	 * @returns {Promise<void>}
	 */
	ValidateFileNameQuery: async function () {
		const values = TMS_GREP.Search.GetFormValues();

		if (TMS_GREP.Es.TrimmedLength(values.fileNameQuery) <= 0) {
			TMS_GREP.Search._fileNameValid        = null;
			TMS_GREP.Search._fileNameErrorMessage = '';
			TMS_GREP.Search.UpdateInputErrors();
			TMS_GREP.Search.UpdateButtons();
			return;
		}

		const result = await window.grepApi.validateFileNameQuery({
			fileNameQuery: values.fileNameQuery,
			fileNameRegex: values.fileNameRegex,
		});

		TMS_GREP.Search._fileNameValid        = result.valid;
		TMS_GREP.Search._fileNameErrorMessage = result.message ?? '';
		TMS_GREP.Search.UpdateInputErrors();
		TMS_GREP.Search.UpdateButtons();
	},

	/**
	 * ファイル名検索条件の検証を遅延実行する
	 * @returns {void}
	 */
	ScheduleFileNameValidation: function () {
		if (TMS_GREP.Search._fileNameValidateTimer !== null) {
			window.clearTimeout(TMS_GREP.Search._fileNameValidateTimer);
		}

		TMS_GREP.Search._fileNameValidateTimer = window.setTimeout(() => {
			TMS_GREP.Search._fileNameValidateTimer = null;
			void TMS_GREP.Search.ValidateFileNameQuery();
		}, 200);
	},

	/**
	 * ファイル内正規表現を検証する
	 * @returns {Promise<void>}
	 */
	ValidateContentRegex: async function () {
		const values = TMS_GREP.Search.GetFormValues();
		const config = TMS_GREP.App._config;

		if (!values.contentRegex || TMS_GREP.Es.TrimmedLength(values.contentQuery) <= 0) {
			TMS_GREP.Search._contentRegexValid        = null;
			TMS_GREP.Search._contentRegexErrorMessage = '';
			TMS_GREP.Search.UpdateInputErrors();
			TMS_GREP.Search.UpdateButtons();
			return;
		}

		const result = await window.grepApi.validateContentRegex({
			query        : values.contentQuery,
			caseSensitive: config?.settings?.contentSearch?.caseSensitive ?? false,
		});

		TMS_GREP.Search._contentRegexValid        = result.valid;
		TMS_GREP.Search._contentRegexErrorMessage = result.message ?? '';
		TMS_GREP.Search.UpdateInputErrors();
		TMS_GREP.Search.UpdateButtons();
	},

	/**
	 * ファイル内正規表現検証を遅延実行する
	 * @returns {void}
	 */
	ScheduleContentRegexValidation: function () {
		if (TMS_GREP.Search._contentRegexValidateTimer !== null) {
			window.clearTimeout(TMS_GREP.Search._contentRegexValidateTimer);
		}

		TMS_GREP.Search._contentRegexValidateTimer = window.setTimeout(() => {
			TMS_GREP.Search._contentRegexValidateTimer = null;
			void TMS_GREP.Search.ValidateContentRegex();
		}, 200);
	},

	/**
	 * ボタン活性状態を更新する
	 * @returns {void}
	 */
	UpdateButtons: function () {
		const esTestBtn   = document.getElementById('tmsGrepBtnEsTest');
		const searchBtn   = document.getElementById('tmsGrepBtnSearch');
		const clearBtn    = document.getElementById('tmsGrepBtnClear');
		const cancelBtn   = document.getElementById('tmsGrepBtnCancel');
		const available   = Boolean(TMS_GREP.Es._status?.available);
		const busy        = TMS_GREP.Search.IsBusy();
		const hasFileName = TMS_GREP.Search.HasValidFileNameQuery();
		const hasContent  = TMS_GREP.Search.HasValidContentQuery();
		const canSearch   = available
			&& hasFileName
			&& hasContent
			&& !busy;

		if (esTestBtn) {
			esTestBtn.disabled = !available || !hasFileName || busy;
		}

		if (searchBtn) {
			searchBtn.disabled = !canSearch;
		}

		if (clearBtn) {
			clearBtn.disabled = busy;
		}

		if (cancelBtn) {
			cancelBtn.disabled = !TMS_GREP.Search._running || TMS_GREP.Search._cancelling;
		}

		TMS_GREP.Search.UpdateModeLabels();
	},

	/**
	 * 進捗パネルを更新する
	 * @returns {void}
	 */
	UpdateProgressPanel: function () {
		const panel    = document.getElementById('tmsGrepProgressPanel');
		const stateEl  = document.getElementById('tmsGrepProgressState');
		const summary  = document.getElementById('tmsGrepProgressSummary');
		const bar      = document.getElementById('tmsGrepProgressBar');
		const barFill  = document.getElementById('tmsGrepProgressBarFill');
		const spinner  = document.getElementById('tmsGrepProgressSpinner');
		const progress = TMS_GREP.Search._progress;

		if (!panel || !summary || !stateEl) {
			return;
		}

		if (!TMS_GREP.Search._running) {
			panel.hidden = true;
			panel.setAttribute('aria-busy', 'false');
			return;
		}

		panel.hidden = false;
		panel.setAttribute('aria-busy', 'true');

		if (spinner) {
			spinner.hidden = false;
		}

		if (!progress) {
			stateEl.textContent = '検索を開始しています…';
			summary.textContent = '候補 0 件 / 検索済 0/0 件 / ヒット 0 件';
			return;
		}

		const elapsedSec = (progress.elapsedMs / 1000).toFixed(1);
		const stateLabel = progress.state === 'running-es'
			? '候補ファイル取得中'
			: 'ファイル内検索中';
		const percent    = progress.totalFileCount > 0
			? Math.min(100, Math.round((progress.searchedFileCount / progress.totalFileCount) * 100))
			: progress.state === 'running-es'
				? 8
				: 0;

		stateEl.textContent = stateLabel;
		summary.textContent = [
			`候補 ${progress.candidateFileCount} 件`,
			`検索済 ${progress.searchedFileCount}/${progress.totalFileCount} 件`,
			`ヒット ${progress.hitCount} 件`,
			`スキップ ${progress.skippedCount} 件`,
			`読取エラー ${progress.errorCount ?? 0} 件`,
			`${elapsedSec} 秒`,
		].join(' / ');

		if (bar) {
			bar.setAttribute('aria-valuenow', String(percent));
		}

		if (barFill) {
			barFill.style.width = `${percent}%`;
		}
	},

	/**
	 * 結果ペインの空表示／一覧表示を切り替える
	 * @returns {void}
	 */
	UpdateResultsLayout: function () {
		const emptyEl    = document.getElementById('tmsGrepResultsEmpty');
		const contentEl  = document.getElementById('tmsGrepResultsContent');
		const summaryEl  = document.getElementById('tmsGrepSearchResultSummary');
		const esSummary  = document.getElementById('tmsGrepEsResultSummary');
		const hasSummary = Boolean(
			(summaryEl && !summaryEl.hidden && summaryEl.textContent)
			|| (esSummary && !esSummary.hidden && esSummary.textContent),
		);
		const hasContent = TMS_GREP.Search._hits.length > 0
			|| hasSummary
			|| TMS_GREP.Search._running;

		if (emptyEl) {
			emptyEl.hidden = hasContent;
		}

		if (contentEl) {
			const wasHidden  = contentEl.hidden;
			contentEl.hidden = !hasContent;

			if (wasHidden && hasContent) {
				TMS_GREP.Results.ScheduleSyncTableWidth();
			}
		}
	},

	/**
	 * 検索結果サマリを更新する
	 * @param {import('../../main/types').SearchJobComplete | null} [result] 完了結果
	 * @returns {void}
	 */
	UpdateResultSummary: function (result) {
		const summaryEl = document.getElementById('tmsGrepSearchResultSummary');
		const esSummary = document.getElementById('tmsGrepEsResultSummary');

		if (summaryEl) {
			if (!result) {
				summaryEl.hidden      = true;
				summaryEl.textContent = '';
			} else {
				summaryEl.hidden      = false;
				summaryEl.textContent = result.message
					?? [
						`候補 ${result.candidateFileCount} 件`,
						`検索済 ${result.searchedFileCount} 件`,
						`ヒット ${result.hitCount} 件`,
						`スキップ ${result.skippedCount} 件`,
						`読取エラー ${result.errorCount} 件`,
						`${(result.elapsedMs / 1000).toFixed(1)} 秒`,
					].join(' / ');
			}
		}

		if (esSummary && result) {
			esSummary.hidden = true;
		}

		if (result) {
			TMS_GREP.Results.RequestFullRender();
		}

		TMS_GREP.Search.UpdateResultsLayout();
	},

	/**
	 * 検索前入力を検証する
	 * @returns {Promise<{ valid: boolean; message?: string }>} 検証結果
	 */
	ValidateBeforeSearch: async function () {
		const values = TMS_GREP.Search.GetFormValues();

		if (TMS_GREP.Es.TrimmedLength(values.fileNameQuery) <= 0) {
			return { valid: false, message: 'ファイル名検索条件を入力してください。' };
		}

		if (TMS_GREP.Es.TrimmedLength(values.contentQuery) <= 0) {
			return { valid: false, message: 'ファイル内検索条件を入力してください。' };
		}

		await TMS_GREP.Search.ValidateFileNameQuery();

		if (!TMS_GREP.Search.HasValidFileNameQuery()) {
			return {
				valid  : false,
				message: TMS_GREP.Search._fileNameErrorMessage || 'ファイル名検索条件が不正です。',
			};
		}

		if (values.contentRegex) {
			await TMS_GREP.Search.ValidateContentRegex();

			if (!TMS_GREP.Search.HasValidContentQuery()) {
				return {
					valid  : false,
					message: TMS_GREP.Search._contentRegexErrorMessage || 'ファイル内検索の正規表現が不正です。',
				};
			}
		}

		const startValidation = await window.grepApi.validateSearchStart({
			fileNameQuery: values.fileNameQuery,
			contentQuery : values.contentQuery,
			targetPath   : values.targetPath || undefined,
			targetExtensions: values.targetExtensions || undefined,
			fileNameRegex: values.fileNameRegex,
			contentRegex : values.contentRegex,
		});

		if (!startValidation.valid) {
			return {
				valid  : false,
				message: startValidation.message ?? '検索条件が不正です。',
			};
		}

		return { valid: true };
	},

	/**
	 * 全文検索を要求する
	 * @returns {Promise<void>}
	 */
	RequestSearch: async function () {
		if (TMS_GREP.Search._running || TMS_GREP.Search.IsBusy()) {
			return;
		}

		TMS_GREP.Search.PersistLastSearchImmediate();

		const validation = await TMS_GREP.Search.ValidateBeforeSearch();

		if (!validation.valid) {
			TMS_GREP_COMMON.Ui.ShowToast(validation.message ?? '検索条件が不正です。', 'warn');
			return;
		}

		const config = TMS_GREP.App._config;
		const values = TMS_GREP.Search.GetFormValues();

		if (config?.settings?.confirmBeforeSearch !== false) {
			const confirmed = await TMS_GREP.Confirm.Show({
				fileNameQuery        : values.fileNameQuery,
				targetExtensions     : values.targetExtensions,
				contentQuery         : values.contentQuery,
				targetPath           : values.targetPath,
				fileNameRegex        : values.fileNameRegex,
				contentRegex         : values.contentRegex,
				fileNameCaseSensitive: config.settings.fileNameSearch.caseSensitive,
				contentCaseSensitive : config.settings.contentSearch.caseSensitive,
				maxCandidateFiles    : config.settings.fileNameSearch.maxCandidateFiles,
				maxRows              : config.settings.results.maxRows,
			});

			if (!confirmed) {
				return;
			}
		}

		await TMS_GREP.Search.RunSearch();
	},

	/**
	 * 全文検索を実行する
	 * @returns {Promise<void>}
	 */
	RunSearch: async function () {
		const values = TMS_GREP.Search.GetFormValues();

		if (TMS_GREP.Search._running) {
			return;
		}

		TMS_GREP.Search._running  = true;
		TMS_GREP.Search._hits     = [];
		TMS_GREP.Search._progress = null;
		TMS_GREP.Results.Clear();
		TMS_GREP.Search.UpdateResultSummary(null);
		TMS_GREP.Search.UpdateResultsLayout();
		TMS_GREP.Search.UpdateButtons();
		TMS_GREP.Search.UpdateProgressPanel();

		const payload = {
			fileNameQuery: values.fileNameQuery,
			contentQuery : values.contentQuery,
			targetPath   : values.targetPath || undefined,
			targetExtensions: values.targetExtensions || undefined,
			fileNameRegex: values.fileNameRegex,
			contentRegex : values.contentRegex,
		};

		try {
			const result = await window.grepApi.startSearch(payload);

			if (!result?.success) {
				TMS_GREP.Search._running    = false;
				TMS_GREP.Search._cancelling = false;
				TMS_GREP.Search.UpdateButtons();
				TMS_GREP.Search.UpdateProgressPanel();
				TMS_GREP_COMMON.Ui.ShowToast(result?.message ?? '全文検索の開始に失敗しました。', 'error');
			}
		} catch (error) {
			TMS_GREP.Search._running    = false;
			TMS_GREP.Search._cancelling = false;
			TMS_GREP.Search.UpdateButtons();
			TMS_GREP.Search.UpdateProgressPanel();
			TMS_GREP_COMMON.Ui.ShowToast(
				error instanceof Error ? error.message : '全文検索の開始に失敗しました。',
				'error',
			);
		}
	},

	/**
	 * 検索をキャンセルする
	 * @returns {Promise<void>}
	 */
	CancelSearch: async function () {
		if (!TMS_GREP.Search._running || TMS_GREP.Search._cancelling) {
			return;
		}

		TMS_GREP.Search._cancelling = true;
		TMS_GREP.Search.UpdateButtons();

		const cancelled = await window.grepApi.cancelSearch();

		if (cancelled) {
			TMS_GREP_COMMON.Ui.ShowToast('検索をキャンセルしています…', 'info');
		} else {
			TMS_GREP.Search._cancelling = false;
			TMS_GREP.Search.UpdateButtons();
			TMS_GREP_COMMON.Ui.ShowToast('キャンセルできませんでした。', 'warn');
		}
	},

	/**
	 * ファイル名正規表現モードを切り替える
	 * @returns {void}
	 */
	ToggleFileNameRegex: function () {
		const checkbox = document.getElementById('tmsGrepFileNameRegex');

		if (!checkbox || TMS_GREP.Search.IsBusy()) {
			return;
		}

		checkbox.checked               = !checkbox.checked;
		TMS_GREP.Search._fileNameValid = null;
		TMS_GREP.Search.ScheduleFileNameValidation();
		TMS_GREP.Search.UpdateButtons();
		TMS_GREP.Search.PersistLastSearchImmediate();
	},

	/**
	 * ファイル内正規表現モードを切り替える
	 * @returns {void}
	 */
	ToggleContentRegex: function () {
		const checkbox = document.getElementById('tmsGrepContentRegex');

		if (!checkbox || TMS_GREP.Search.IsBusy()) {
			return;
		}

		checkbox.checked                   = !checkbox.checked;
		TMS_GREP.Search._contentRegexValid = null;
		TMS_GREP.Search.ScheduleContentRegexValidation();
		TMS_GREP.Search.UpdateButtons();
		TMS_GREP.Search.PersistLastSearchImmediate();
	},

	/**
	 * 入力欄のみクリアする
	 * @returns {void}
	 */
	ClearInputs: function () {
		const fileNameInput   = document.getElementById('tmsGrepFileNameQuery');
		const contentInput    = document.getElementById('tmsGrepContentQuery');
		const targetInput     = document.getElementById('tmsGrepTargetPath');
		const extensionsInput = document.getElementById('tmsGrepTargetExtensions');
		const fileNameRegex   = document.getElementById('tmsGrepFileNameRegex');
		const contentRegex    = document.getElementById('tmsGrepContentRegex');

		if (fileNameInput) {
			fileNameInput.value = '';
		}

		if (contentInput) {
			contentInput.value = '';
		}

		if (targetInput) {
			targetInput.value = '';
		}

		if (extensionsInput) {
			extensionsInput.value = '';
		}

		if (fileNameRegex) {
			fileNameRegex.checked = false;
		}

		if (contentRegex) {
			contentRegex.checked = false;
		}

		TMS_GREP.Search._fileNameValid            = null;
		TMS_GREP.Search._fileNameErrorMessage     = '';
		TMS_GREP.Search._contentRegexValid        = null;
		TMS_GREP.Search._contentRegexErrorMessage = '';
		TMS_GREP.Search.UpdateInputErrors();
		TMS_GREP.Search.UpdateButtons();
		TMS_GREP.Search.PersistLastSearchImmediate();
	},

	/**
	 * 入力と結果をクリアする
	 * @returns {void}
	 */
	ClearAll: function () {
		TMS_GREP.Search.ClearInputs();
		TMS_GREP.Search._hits = [];
		TMS_GREP.Results.Clear();

		const esSummary = document.getElementById('tmsGrepEsResultSummary');

		if (esSummary) {
			esSummary.hidden      = true;
			esSummary.textContent = '';
		}

		TMS_GREP.Search.UpdateResultSummary(null);
	},

	/**
	 * 対象フォルダ参照ダイアログを開く
	 * @returns {Promise<void>}
	 */
	BrowseTargetPath: async function () {
		if (TMS_GREP.Search.IsBusy()) {
			return;
		}

		const selected = await window.grepApi.openDirectoryDialog();

		if (!selected) {
			return;
		}

		const targetInput = document.getElementById('tmsGrepTargetPath');

		if (targetInput instanceof HTMLInputElement) {
			targetInput.value = selected;
		}

		TMS_GREP.Search.PersistLastSearchImmediate();
		TMS_GREP.Search.UpdateButtons();
	},

	/**
	 * IPC イベントを購読する
	 * @returns {void}
	 */
	BindEvents: function () {
		TMS_GREP.Search._unsubscribeState = window.grepApi.onSearchState((payload) => {
			if (TMS_GREP.Search._progress) {
				TMS_GREP.Search._progress.state = payload.state;
			}

			TMS_GREP.Search.UpdateProgressPanel();
		});

		TMS_GREP.Search._unsubscribeProgress = window.grepApi.onSearchProgress((progress) => {
			TMS_GREP.Search._progress = progress;
			TMS_GREP.Search.UpdateProgressPanel();
		});

		TMS_GREP.Search._unsubscribeResult = window.grepApi.onSearchResult((hit) => {
			TMS_GREP.Search._hits.push(hit);
			TMS_GREP.Results.ScheduleRender();
			TMS_GREP.Search.UpdateResultsLayout();
		});

		TMS_GREP.Search._unsubscribeComplete = window.grepApi.onSearchComplete((result) => {
			TMS_GREP.Search._running    = false;
			TMS_GREP.Search._cancelling = false;
			TMS_GREP.Search.UpdateButtons();
			TMS_GREP.Search.UpdateProgressPanel();
			TMS_GREP.Search.UpdateResultSummary(result);
			TMS_GREP.App.UpdateStatusAfterSearch(result);

			if (result.warnings?.length) {
				TMS_GREP_COMMON.Ui.ShowToast(result.warnings.join('\n'), 'warn');
			}

			if (result.errorCount > 0 && result.state !== 'failed') {
				TMS_GREP_COMMON.Ui.ShowToast(
					`${result.errorCount} 件のファイルを読み取れませんでした。`,
					'warn',
				);
			}

			const toastType = result.state === 'failed'
				? 'error'
				: result.errorCount > 0 || result.skippedCount > 0
					? 'warn'
					: 'info';
			const message   = result.message
				?? (result.state === 'cancelled'
					? '検索をキャンセルしました。'
					: `検索完了 — ヒット ${result.hitCount} 件`);

			TMS_GREP_COMMON.Ui.ShowToast(message, toastType);

			const logLevel = result.state === 'failed'
				? 'ERROR'
				: result.errorCount > 0 || result.skippedCount > 0
					? 'WARN'
					: 'INFO';

			window.grepApi.writeLog(logLevel, 'Search job completed in renderer', {
				state        : result.state,
				hitCount     : result.hitCount,
				skippedCount : result.skippedCount,
				errorCount   : result.errorCount,
				candidateFileCount: result.candidateFileCount,
				searchedFileCount : result.searchedFileCount,
				elapsedMs    : result.elapsedMs,
			});
		});

		const searchBtn       = document.getElementById('tmsGrepBtnSearch');
		const clearBtn        = document.getElementById('tmsGrepBtnClear');
		const cancelBtn       = document.getElementById('tmsGrepBtnCancel');
		const fileNameInput   = document.getElementById('tmsGrepFileNameQuery');
		const contentInput    = document.getElementById('tmsGrepContentQuery');
		const targetInput     = document.getElementById('tmsGrepTargetPath');
		const extensionsInput = document.getElementById('tmsGrepTargetExtensions');
		const fileNameRegex   = document.getElementById('tmsGrepFileNameRegex');
		const contentRegex    = document.getElementById('tmsGrepContentRegex');
		const browsePathBtn   = document.getElementById('tmsGrepBtnBrowsePath');

		if (searchBtn) {
			searchBtn.addEventListener('click', () => {
				void TMS_GREP.Search.RequestSearch();
			});
		}

		if (clearBtn) {
			clearBtn.addEventListener('click', () => {
				TMS_GREP.Search.ClearAll();
			});
		}

		if (cancelBtn) {
			cancelBtn.addEventListener('click', () => {
				void TMS_GREP.Search.CancelSearch();
			});
		}

		if (browsePathBtn) {
			browsePathBtn.addEventListener('click', () => {
				void TMS_GREP.Search.BrowseTargetPath();
			});
		}

		for (const input of [contentInput, targetInput, extensionsInput]) {
			input?.addEventListener('input', () => {
				TMS_GREP.Search.SchedulePersistLastSearch();
				TMS_GREP.Search.UpdateButtons();
			});
		}

		fileNameInput?.addEventListener('input', () => {
			TMS_GREP.Search._fileNameValid = null;
			TMS_GREP.Search.ScheduleFileNameValidation();
			TMS_GREP.Search.SchedulePersistLastSearch();
			TMS_GREP.Search.UpdateButtons();
		});

		fileNameRegex?.addEventListener('change', () => {
			TMS_GREP.Search._fileNameValid = null;
			TMS_GREP.Search.ScheduleFileNameValidation();
			TMS_GREP.Search.PersistLastSearchImmediate();
			TMS_GREP.Search.UpdateButtons();
		});

		contentInput?.addEventListener('input', () => {
			TMS_GREP.Search._contentRegexValid = null;
			TMS_GREP.Search.ScheduleContentRegexValidation();
			TMS_GREP.Search.SchedulePersistLastSearch();
			TMS_GREP.Search.UpdateButtons();
		});

		contentRegex?.addEventListener('change', () => {
			TMS_GREP.Search._contentRegexValid = null;
			TMS_GREP.Search.ScheduleContentRegexValidation();
			TMS_GREP.Search.PersistLastSearchImmediate();
			TMS_GREP.Search.UpdateButtons();
		});
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

		const contentInput      = document.getElementById('tmsGrepContentQuery');
		const contentRegexInput = document.getElementById('tmsGrepContentRegex');
		const lastSearch        = config.lastSearch;

		if (contentInput) {
			contentInput.value = lastSearch.contentQuery ?? '';
		}

		if (contentRegexInput instanceof HTMLInputElement) {
			contentRegexInput.checked = Boolean(lastSearch.contentRegex);
		}
	},
});
