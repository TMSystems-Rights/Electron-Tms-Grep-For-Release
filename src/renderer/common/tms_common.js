'use strict';

/**
 * TMS-GREP 共通モジュール
 * @namespace TMS_GREP_COMMON
 */
const TMS_GREP_COMMON = {
	/**
	 * 共通定数
	 * @namespace Const
	 */
	Const: {
		/** ログメッセージ接頭辞 */
		LOG_PREFIX: '[TmsGrep]',
		/** 空文字列 */
		BLANK     : '',
		/** ダークテーマ body クラス */
		THEME_CLASS_DARK: 'tms-grep-theme-dark',
		/** ライトテーマ body クラス */
		THEME_CLASS_LIGHT: 'tms-grep-theme-light',
	},

	/**
	 * 共通関数
	 * @namespace Funcs
	 */
	Funcs: {
		/**
		 * 値が空かどうかを判定する
		 * @param {*} value 判定対象の値
		 * @returns {boolean} 判定結果（true: 空、false: それ以外）
		 */
		IsEmpty: function (value) {
			if (typeof value === 'undefined' || value === null) {
				return true;
			}

			if (typeof value === 'string' && value.trim().length <= 0) {
				return true;
			}

			return false;
		},

		/**
		 * HTML エスケープ
		 * @param {string} text 文字列
		 * @returns {string} エスケープ済み文字列
		 */
		EscapeHtml: function (text) {
			if (TMS_GREP_COMMON.Funcs.IsEmpty(text)) {
				return TMS_GREP_COMMON.Const.BLANK;
			}

			return String(text)
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;')
				.replace(/"/g, '&quot;');
		},
	},

	/**
	 * UI ユーティリティ
	 * @namespace Ui
	 */
	Ui: {
		/**
		 * トースト通知を表示する
		 * @param {string} message メッセージ
		 * @param {'info' | 'warn' | 'error'} [type='info'] 種別
		 * @returns {void}
		 */
		ShowToast: function (message, type) {
			const container = document.getElementById('tmsGrepToastContainer');

			if (!container) {
				return;
			}

			const toast     = document.createElement('div');
			const toastType = type ?? 'info';

			toast.className   = `tms-grep-toast tms-grep-toast--${toastType}`;
			toast.textContent = message;
			container.appendChild(toast);

			setTimeout(() => {
				toast.remove();
			}, toastType === 'error' ? 8000 : 4000);
		},

		/**
		 * エラーをログ出力する
		 * @param {string} message メッセージ
		 * @param {Record<string, unknown>} [context] コンテキスト
		 * @returns {void}
		 */
		LogError: function (message, context) {
			if (window.grepApi?.writeLog) {
				window.grepApi.writeLog('ERROR', message, context);
			}

			console.error(`${TMS_GREP_COMMON.Const.LOG_PREFIX} ${message}`, context);
		},
	},
};

/**
 * オブジェクトを再帰的に凍結する
 * @param {object} object 凍結対象
 * @returns {object} 凍結済みオブジェクト
 */
function DeepFreeze(object) {
	if (object === null || typeof object !== 'object' || Object.isFrozen(object)) {
		return object;
	}

	for (const key of Object.keys(object)) {
		DeepFreeze(object[key]);
	}

	return Object.freeze(object);
}

DeepFreeze(TMS_GREP_COMMON.Funcs);
DeepFreeze(TMS_GREP_COMMON.Const);
DeepFreeze(TMS_GREP_COMMON.Ui);
Object.freeze(TMS_GREP_COMMON);

/**
 * TMS-GREP レンダラー名前空間
 * @namespace TMS_GREP
 */
// eslint-disable-next-line no-unused-vars -- 後続スクリプトから参照されるグローバル名前空間
const TMS_GREP = {
	Const   : {},
	Theme   : {},
	App     : {},
	Es      : {},
	Search  : {},
	Results : {},
	Confirm : {},
	Settings: {},
	Keyboard: {},
};
