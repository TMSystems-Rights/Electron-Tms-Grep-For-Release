'use strict';

Object.assign(TMS_GREP.Confirm, {
	/** @type {((value: boolean) => void) | null} */
	_resolver: null,

	/**
	 * 確認ダイアログが開いているか
	 * @returns {boolean} 開いていれば true
	 */
	IsOpen: function () {
		const modal = document.getElementById('tmsGrepModalConfirm');

		return Boolean(modal && !modal.hidden);
	},

	/**
	 * 確認ダイアログを閉じる
	 * @param {boolean} confirmed 確定したか
	 * @returns {void}
	 */
	Close: function (confirmed) {
		const modal = document.getElementById('tmsGrepModalConfirm');

		if (modal) {
			modal.hidden = true;
		}

		if (TMS_GREP.Confirm._resolver) {
			TMS_GREP.Confirm._resolver(confirmed);
			TMS_GREP.Confirm._resolver = null;
		}
	},

	/**
	 * モード表示名を返す
	 * @param {boolean} regex 正規表現モード
	 * @returns {string} 表示名
	 */
	FormatMode: function (regex) {
		return regex ? '正規表現' : '通常';
	},

	/**
	 * 大文字小文字区別の表示名を返す
	 * @param {boolean} caseSensitive 区別するか
	 * @returns {string} 表示名
	 */
	FormatCaseSensitive: function (caseSensitive) {
		return caseSensitive ? '区別する' : '区別しない';
	},

	/**
	 * 0 を上限なしとする数値設定の表示名を返す
	 * @param {number} value 設定値
	 * @returns {string} 表示名
	 */
	FormatOptionalLimit: function (value) {
		return value === 0 ? '上限なし' : String(value);
	},

	/**
	 * 候補ファイル上限の表示名を返す
	 * @param {number} maxCandidateFiles 候補ファイル上限
	 * @returns {string} 表示名
	 */
	FormatMaxCandidateFiles: function (maxCandidateFiles) {
		return TMS_GREP.Confirm.FormatOptionalLimit(maxCandidateFiles);
	},

	/**
	 * 確認ダイアログを表示する
	 * @param {object} summary 検索条件サマリ
	 * @returns {Promise<boolean>} 確定したら true
	 */
	Show: function (summary) {
		const modal = document.getElementById('tmsGrepModalConfirm');

		if (!modal) {
			return Promise.resolve(true);
		}

		const fields = {
			fileNameQuery  : document.getElementById('tmsGrepConfirmFileNameQuery'),
			fileNameMode   : document.getElementById('tmsGrepConfirmFileNameMode'),
			targetExtensions: document.getElementById('tmsGrepConfirmTargetExtensions'),
			contentQuery   : document.getElementById('tmsGrepConfirmContentQuery'),
			contentMode    : document.getElementById('tmsGrepConfirmContentMode'),
			targetPath     : document.getElementById('tmsGrepConfirmTargetPath'),
			fileNameCase   : document.getElementById('tmsGrepConfirmFileNameCase'),
			contentCase    : document.getElementById('tmsGrepConfirmContentCase'),
			maxCandidates  : document.getElementById('tmsGrepConfirmMaxCandidates'),
			maxRows        : document.getElementById('tmsGrepConfirmMaxRows'),
		};

		if (fields.fileNameQuery) {
			fields.fileNameQuery.textContent = summary.fileNameQuery;
		}

		if (fields.fileNameMode) {
			fields.fileNameMode.textContent = TMS_GREP.Confirm.FormatMode(summary.fileNameRegex);
		}

		if (fields.targetExtensions) {
			fields.targetExtensions.textContent = summary.targetExtensions || '未指定';
		}

		if (fields.contentQuery) {
			fields.contentQuery.textContent = summary.contentQuery;
		}

		if (fields.contentMode) {
			fields.contentMode.textContent = TMS_GREP.Confirm.FormatMode(summary.contentRegex);
		}

		if (fields.targetPath) {
			fields.targetPath.textContent = summary.targetPath || 'Everything 全体';
		}

		if (fields.fileNameCase) {
			fields.fileNameCase.textContent = TMS_GREP.Confirm.FormatCaseSensitive(summary.fileNameCaseSensitive);
		}

		if (fields.contentCase) {
			fields.contentCase.textContent = TMS_GREP.Confirm.FormatCaseSensitive(summary.contentCaseSensitive);
		}

		if (fields.maxCandidates) {
			fields.maxCandidates.textContent = TMS_GREP.Confirm.FormatMaxCandidateFiles(summary.maxCandidateFiles);
		}

		if (fields.maxRows) {
			fields.maxRows.textContent = TMS_GREP.Confirm.FormatOptionalLimit(summary.maxRows);
		}

		modal.hidden = false;

		const yesBtn = document.getElementById('tmsGrepConfirmYes');

		if (yesBtn) {
			yesBtn.focus();
		}

		return new Promise((resolve) => {
			TMS_GREP.Confirm._resolver = resolve;
		});
	},

	/**
	 * イベントを登録する
	 * @returns {void}
	 */
	BindEvents: function () {
		const backdrop = document.getElementById('tmsGrepModalConfirmBackdrop');
		const yesBtn   = document.getElementById('tmsGrepConfirmYes');
		const noBtn    = document.getElementById('tmsGrepConfirmNo');

		if (yesBtn) {
			yesBtn.addEventListener('click', () => {
				TMS_GREP.Confirm.Close(true);
			});
		}

		if (noBtn) {
			noBtn.addEventListener('click', () => {
				TMS_GREP.Confirm.Close(false);
			});
		}

		if (backdrop) {
			backdrop.addEventListener('click', () => {
				TMS_GREP.Confirm.Close(false);
			});
		}
	},
});
