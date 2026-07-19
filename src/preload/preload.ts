import { contextBridge, ipcRenderer } from 'electron';

/**
 * レンダラー向け API 定義
 */
const grepApi = {
	/**
	 * アプリバージョンを取得する
	 * @returns {Promise<{ version: string }>} バージョン情報
	 */
	getVersion: () => ipcRenderer.invoke('app:getVersion'),

	/**
	 * 管理者権限で実行中か取得する
	 * @returns {Promise<boolean>} 管理者権限なら true
	 */
	isAdministrator: () => ipcRenderer.invoke('app:isAdministrator'),

	/**
	 * 設定を取得する
	 * @returns {Promise<import('../main/types').LoadConfigResult>} 読込結果
	 */
	getConfig: () => ipcRenderer.invoke('config:get'),

	/**
	 * 設定を保存する
	 * @param {import('../main/types').AppConfig} config 設定
	 * @returns {Promise<import('../main/types').SaveConfigResult>} 保存結果
	 */
	saveConfig: (config: import('../main/types').AppConfig) => ipcRenderer.invoke('config:save', config),

	/**
	 * 設定の一部を更新する
	 * @param {Partial<import('../main/types').AppSettings>} partialSettings 更新内容
	 * @returns {Promise<import('../main/types').SaveConfigResult>} 保存結果
	 */
	updateSettings: (partialSettings: Partial<import('../main/types').AppSettings>) => ipcRenderer.invoke('config:updateSettings', partialSettings),

	/**
	 * 既定設定を取得する
	 * @returns {Promise<import('../main/types').AppConfig>} 既定 config
	 */
	getDefaultConfig: () => ipcRenderer.invoke('config:getDefaults'),

	/**
	 * 既定 settings を取得する
	 * @returns {Promise<import('../main/types').AppSettings>} 既定 settings
	 */
	getDefaultSettings: () => ipcRenderer.invoke('config:getDefaultSettings'),

	/**
	 * 設定項目を既定値へリセットする
	 * @param {string} itemKey settings 配下の dot 記法キー
	 * @returns {Promise<import('../main/types').ResetSettingResult>} リセット結果
	 */
	resetSettingItem: (itemKey: string) => ipcRenderer.invoke('config:reset-item', itemKey),

	/**
	 * すべての設定を既定値へリセットする
	 * @returns {Promise<import('../main/types').ResetSettingResult>} リセット結果
	 */
	resetAllConfig: () => ipcRenderer.invoke('config:reset-all'),

	/**
	 * 直近検索入力を更新する
	 * @param {Partial<import('../main/types').LastSearch>} partialLastSearch 更新内容
	 * @returns {Promise<import('../main/types').SaveConfigResult>} 保存結果
	 */
	updateLastSearch: (partialLastSearch: Partial<import('../main/types').LastSearch>) => ipcRenderer.invoke('config:updateLastSearch', partialLastSearch),

	/**
	 * テーマを適用する
	 * @param {'system' | 'dark' | 'light'} appearance 外観
	 * @returns {Promise<boolean>} ダークカラー使用時 true
	 */
	applyTheme: (appearance: 'system' | 'dark' | 'light') => ipcRenderer.invoke('theme:apply', appearance),

	/**
	 * 現在ダークカラーか取得する
	 * @returns {Promise<boolean>} ダークなら true
	 */
	shouldUseDarkColors: () => ipcRenderer.invoke('theme:shouldUseDarkColors'),

	/**
	 * ウィンドウヘッダ用のシステム色を取得する
	 * @returns {Promise<import('../main/window').WindowChromeColors>} クローム色
	 */
	getWindowChromeColors: () => ipcRenderer.invoke('theme:getWindowChromeColors'),

	/**
	 * ログをメインプロセスへ送信する
	 * @param {'ERROR' | 'WARN' | 'INFO' | 'DEBUG'} level ログレベル
	 * @param {string} message メッセージ
	 * @param {Record<string, unknown>} [context] コンテキスト
	 * @returns {void}
	 */
	writeLog: (
		level: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG',
		message: string,
		context?: Record<string, unknown>,
	) => {
		ipcRenderer.send('log:write', { level, message, context });
	},

	/**
	 * テーマ変更イベントを購読する
	 * @param {() => void} callback コールバック
	 * @returns {() => void} 購読解除関数
	 */
	onThemeChanged: (callback: () => void) => {
		/** テーマ更新時に呼び出すリスナー */
		const listener = () => callback();
		ipcRenderer.on('theme:updated', listener);

		return () => {
			ipcRenderer.removeListener('theme:updated', listener);
		};
	},

	/**
	 * ウィンドウフォーカス変更イベントを購読する
	 * @param {(focused: boolean) => void} callback コールバック
	 * @returns {() => void} 購読解除関数
	 */
	onWindowFocusChanged: (callback: (focused: boolean) => void) => {
		/** フォーカス更新時に呼び出すリスナー */
		const listener = (_event: Electron.IpcRendererEvent, focused: boolean) => callback(focused);
		ipcRenderer.on('window:focus-changed', listener);

		return () => {
			ipcRenderer.removeListener('window:focus-changed', listener);
		};
	},

	/**
	 * 更新を手動確認する
	 * @returns {Promise<import('../main/types').UpdateCheckResult>} 確認結果
	 */
	checkForUpdates: () => ipcRenderer.invoke('update:check'),

	/**
	 * 更新状態イベントを購読する
	 * @param {(payload: import('../main/types').UpdateStatusPayload) => void} callback コールバック
	 * @returns {() => void} 購読解除関数
	 */
	onUpdateStatus: (callback: (payload: import('../main/types').UpdateStatusPayload) => void) => {
		/** 更新状態通知リスナー */
		const listener = (
			_event: Electron.IpcRendererEvent,
			payload: import('../main/types').UpdateStatusPayload,
		) => callback(payload);
		ipcRenderer.on('update:status', listener);

		return () => {
			ipcRenderer.removeListener('update:status', listener);
		};
	},

	/**
	 * 終了前イベントを購読する
	 * @param {() => void | Promise<void>} callback コールバック
	 * @returns {() => void} 購読解除関数
	 */
	onBeforeClose: (callback: () => void | Promise<void>) => {
		/** 終了前通知リスナー */
		const listener = () => {
			void callback();
		};
		ipcRenderer.on('app:before-close', listener);

		return () => {
			ipcRenderer.removeListener('app:before-close', listener);
		};
	},

	/**
	 * 終了前処理完了をメインプロセスへ通知する
	 * @returns {void}
	 */
	notifyCloseReady: () => {
		ipcRenderer.send('app:close-ready');
	},

	/**
	 * es.exe を検出する
	 * @returns {Promise<import('../main/types').EsDetectResult>} 検出結果
	 */
	detectEs: () => ipcRenderer.invoke('es:detect'),

	/**
	 * 追加オプションを検証する
	 * @param {string} additionalArgs 追加オプション文字列
	 * @returns {Promise<import('../main/types').EsAdditionalArgsValidation>} 検証結果
	 */
	validateEsAdditionalArgs: (additionalArgs: string) => ipcRenderer.invoke('es:validateAdditionalArgs', additionalArgs),

	/**
	 * es.exe で候補ファイルを取得する
	 * @param {object} payload 検索条件
	 * @returns {Promise<import('../main/types').EsCandidateSearchResult>} 検索結果
	 */
	searchEsCandidates: (payload: {
		fileNameQuery: string;
		targetPath?: string;
		targetExtensions?: string;
		regex?: boolean;
	}) => ipcRenderer.invoke('es:search', payload),

	/**
	 * 実行中の es.exe をキャンセルする
	 * @returns {Promise<boolean>} キャンセルしたら true
	 */
	cancelEsSearch: () => ipcRenderer.invoke('es:cancel'),

	/**
	 * 検索ジョブ状態を取得する
	 * @returns {Promise<{ state: import('../main/types').SearchJobState; running: boolean }>} 状態
	 */
	getSearchState: () => ipcRenderer.invoke('search:getState'),

	/**
	 * ファイル名検索条件を検証する
	 * @param {object} payload 検索条件
	 * @returns {Promise<{ valid: boolean; message?: string }>} 検証結果
	 */
	validateFileNameQuery: (payload: {
		fileNameQuery: string;
		fileNameRegex?: boolean;
	}) => ipcRenderer.invoke('search:validateFileNameQuery', payload),

	/**
	 * ファイル内正規表現を検証する
	 * @param {object} payload 検索条件
	 * @returns {Promise<import('../main/types').RegexValidationResult>} 検証結果
	 */
	validateContentRegex: (payload: {
		query: string;
		caseSensitive?: boolean;
	}) => ipcRenderer.invoke('search:validateContentRegex', payload),

	/**
	 * 検索開始前の入力を検証する
	 * @param {import('../main/types').SearchStartPayload} payload 検索条件
	 * @returns {Promise<{ valid: boolean; message?: string }>} 検証結果
	 */
	validateSearchStart: (payload: import('../main/types').SearchStartPayload) => ipcRenderer.invoke('search:validateStart', payload),

	/**
	 * 全文検索ジョブを開始する
	 * @param {import('../main/types').SearchStartPayload} payload 検索条件
	 * @returns {Promise<import('../main/types').SearchStartResult>} 開始結果
	 */
	startSearch: (payload: import('../main/types').SearchStartPayload) => ipcRenderer.invoke('search:start', payload),

	/**
	 * 検索ジョブをキャンセルする
	 * @returns {Promise<boolean>} キャンセル要求を受け付けたら true
	 */
	cancelSearch: () => ipcRenderer.invoke('search:cancel'),

	/**
	 * ヒット一覧を指定形式へ整形する
	 * @param {object} payload 整形条件
	 * @returns {Promise<string>} 整形結果
	 */
	formatHits: (payload: {
		hits: import('../main/types').SearchHit[];
		format: import('../main/types').CopyFormat;
		lineEnding?: import('../main/types').CopyLineEnding;
	}) => ipcRenderer.invoke('clipboard:formatHits', payload),

	/**
	 * ヒット一覧をクリップボードへコピーする
	 * @param {object} payload コピー条件
	 * @returns {Promise<{ success: boolean; message?: string; lineCount?: number }>} 結果
	 */
	copyHits: (payload: {
		hits: import('../main/types').SearchHit[];
		format: import('../main/types').CopyFormat;
		lineEnding?: import('../main/types').CopyLineEnding;
	}) => ipcRenderer.invoke('clipboard:copyHits', payload),

	/**
	 * ファイルを OS 既定のアプリで開く
	 * @param {string} filePath ファイルパス
	 * @returns {Promise<{ success: boolean; message?: string }>} 結果
	 */
	openFile: (filePath: string) => ipcRenderer.invoke('shell:openFile', filePath),

	/**
	 * Explorer でファイルを選択表示する
	 * @param {string} filePath ファイルパス
	 * @returns {Promise<{ success: boolean; message?: string }>} 結果
	 */
	showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),

	/**
	 * 実行ファイル選択ダイアログを開く
	 * @returns {Promise<string | null>} 選択パス
	 */
	openExecutableDialog: () => ipcRenderer.invoke('dialog:openExecutable'),

	/**
	 * フォルダ選択ダイアログを開く
	 * @returns {Promise<string | null>} 選択パス
	 */
	openDirectoryDialog: () => ipcRenderer.invoke('dialog:openDirectory'),

	/**
	 * 検索状態変更イベントを購読する
	 * @param {(payload: { state: import('../main/types').SearchJobState }) => void} callback コールバック
	 * @returns {() => void} 購読解除関数
	 */
	onSearchState: (callback: (payload: { state: import('../main/types').SearchJobState }) => void) => {
		/** 状態変更リスナー */
		const listener = (_event: Electron.IpcRendererEvent, payload: { state: import('../main/types').SearchJobState }) => {
			callback(payload);
		};
		ipcRenderer.on('search:on-state', listener);

		return () => {
			ipcRenderer.removeListener('search:on-state', listener);
		};
	},

	/**
	 * 検索進捗イベントを購読する
	 * @param {(progress: import('../main/types').SearchJobProgress) => void} callback コールバック
	 * @returns {() => void} 購読解除関数
	 */
	onSearchProgress: (callback: (progress: import('../main/types').SearchJobProgress) => void) => {
		/** 進捗通知リスナー */
		const listener = (_event: Electron.IpcRendererEvent, progress: import('../main/types').SearchJobProgress) => {
			callback(progress);
		};
		ipcRenderer.on('search:on-progress', listener);

		return () => {
			ipcRenderer.removeListener('search:on-progress', listener);
		};
	},

	/**
	 * 検索ヒットイベントを購読する
	 * @param {(hit: import('../main/types').SearchHit) => void} callback コールバック
	 * @returns {() => void} 購読解除関数
	 */
	onSearchResult: (callback: (hit: import('../main/types').SearchHit) => void) => {
		/** ヒット通知リスナー */
		const listener = (_event: Electron.IpcRendererEvent, hit: import('../main/types').SearchHit) => {
			callback(hit);
		};
		ipcRenderer.on('search:on-result', listener);

		return () => {
			ipcRenderer.removeListener('search:on-result', listener);
		};
	},

	/**
	 * 検索完了イベントを購読する
	 * @param {(result: import('../main/types').SearchJobComplete) => void} callback コールバック
	 * @returns {() => void} 購読解除関数
	 */
	onSearchComplete: (callback: (result: import('../main/types').SearchJobComplete) => void) => {
		/** 完了通知リスナー */
		const listener = (_event: Electron.IpcRendererEvent, result: import('../main/types').SearchJobComplete) => {
			callback(result);
		};
		ipcRenderer.on('search:on-complete', listener);

		return () => {
			ipcRenderer.removeListener('search:on-complete', listener);
		};
	},
};

contextBridge.exposeInMainWorld('grepApi', grepApi);

export type GrepApi = typeof grepApi;
