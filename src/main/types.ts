/** テーマ設定 */
export type ThemeSetting = 'system' | 'dark' | 'light';

/** 文字コード設定 */
export type EncodingSetting = 'auto' | 'utf8' | 'utf16le' | 'utf16be' | 'cp932';

/** コピー形式 */
export type CopyFormat =
	| 'grep'
	| 'tsv'
	| 'markdown-codeblock'
	| 'markdown-table'
	| 'markdown-table-aligned'
	| 'paths';

/** コピー時の改行コード */
export type CopyLineEnding = 'crlf' | 'cr' | 'lf';

/** タブ文字の扱い */
export type TabHandling = 'preserve' | 'replace-all' | 'replace-indent';

/** コピー時の該当行テキスト変換設定 */
export interface CopyTextTransformSettings {
	tabHandling: TabHandling;
	tabSize: number;
	trimLineText: boolean;
}

/** es.exe ソート項目 */
export type EsSortOption =
	| 'path-ascending'
	| 'path-descending'
	| 'name-ascending'
	| 'name-descending'
	| 'size-ascending'
	| 'size-descending'
	| 'date-modified-ascending'
	| 'date-modified-descending';

/** ウィンドウサイズ */
export interface WindowSize {
	width: number;
	height: number;
}

/** ファイル名検索設定 */
export interface FileNameSearchSettings {
	regex: boolean;
	caseSensitive: boolean;
	wholeWord: boolean;
	matchPath: boolean;
	diacritics: boolean;
	/** 候補ファイル上限（0=上限なし） */
	maxCandidateFiles: number;
	sort: EsSortOption;
	timeoutMs: number;
	additionalArgs: string;
}

/** 本文検索設定 */
export interface ContentSearchSettings {
	regex: boolean;
	caseSensitive: boolean;
	encoding: EncodingSetting;
	maxFileSizeMb: number;
	skipBinary: boolean;
	concurrency: number;
}

/** 結果表示設定 */
export interface ResultsSettings {
	/** 最大表示行数（0=上限なし） */
	maxRows: number;
	copyFormat: CopyFormat;
	copyLineEnding: CopyLineEnding;
	tabHandling: TabHandling;
	tabSize: number;
	trimLineText: boolean;
}

/** キーバインド設定 */
export interface KeybindingsSettings {
	toggleFileNameRegex: string;
	toggleContentRegex: string;
	runSearch: string;
	clear: string;
}

/** アプリ設定 */
export interface AppSettings {
	theme: ThemeSetting;
	confirmBeforeSearch: boolean;
	restoreLastSearch: boolean;
	esExePath: string;
	fileNameSearch: FileNameSearchSettings;
	contentSearch: ContentSearchSettings;
	results: ResultsSettings;
	keybindings: KeybindingsSettings;
}

/** 直近検索入力 */
export interface LastSearch {
	fileNameQuery: string;
	contentQuery: string;
	targetPath: string;
	targetExtensions: string;
	fileNameRegex: boolean;
	contentRegex: boolean;
}

/** config.json スキーマ */
export interface AppConfig {
	schemaVersion: number;
	window: WindowSize;
	settings: AppSettings;
	lastSearch: LastSearch;
}

/** 設定読込結果 */
export interface LoadConfigResult {
	success: boolean;
	config: AppConfig;
	message?: string;
}

/** 設定保存結果 */
export interface SaveConfigResult {
	success: boolean;
	message?: string;
	config?: AppConfig;
}

/** 設定項目リセット結果 */
export interface ResetSettingResult {
	success: boolean;
	message?: string;
	config?: AppConfig;
}

/** es.exe 検出結果 */
export interface EsDetectResult {
	available: boolean;
	path: string;
	version?: string;
	message?: string;
}

/** es.exe 検索リクエスト */
export interface EsSearchRequest {
	esExePath: string;
	fileNameQuery: string;
	targetPath?: string;
	targetExtensions?: string;
	regex: boolean;
	caseSensitive: boolean;
	wholeWord: boolean;
	matchPath: boolean;
	diacritics: boolean;
	/** 候補ファイル上限（0=上限なし） */
	maxCandidateFiles: number;
	sort: EsSortOption;
	timeoutMs: number;
	additionalArgs: string;
}

/** es.exe 検索結果 */
export interface EsSearchResult {
	success: boolean;
	files: string[];
	elapsedMs: number;
	stderr: string;
	exitCode: number | null;
	message?: string;
	warnings?: string[];
}

/** 候補ファイル取得ボタン向け es.exe 検索結果 */
export interface EsCandidateSearchResult {
	success: boolean;
	fileCount: number;
	elapsedMs: number;
	stderr: string;
	exitCode: number | null;
	message?: string;
	warnings?: string[];
}

/** 追加オプション検証結果 */
export interface EsAdditionalArgsValidation {
	valid: boolean;
	args: string[];
	warnings: string[];
	errors: string[];
}

/** 解決済み文字コード */
export type ResolvedEncoding = 'utf8' | 'utf16le' | 'utf16be' | 'cp932';

/** ファイル内検索リクエスト */
export interface ContentSearchRequest {
	files: string[];
	query: string;
	regex: boolean;
	caseSensitive: boolean;
	encoding: EncodingSetting;
	maxFileSizeBytes: number;
	skipBinary: boolean;
	concurrency: number;
	/** 最大表示行数（0=上限なし） */
	maxRows: number;
}

/** 検索ヒット */
export interface SearchHit {
	id: string;
	filePath: string;
	lineNumber: number;
	columnNumber: number;
	hitCountInLine: number;
	lineText: string;
	matchRanges: Array<{ start: number; end: number }>;
}

/** ファイル内検索進捗 */
export interface ContentSearchProgress {
	searchedFileCount: number;
	totalFileCount: number;
	hitCount: number;
	skippedCount: number;
	errorCount: number;
}

/** ファイル内検索結果 */
export interface ContentSearchResult {
	hits: SearchHit[];
	searchedFileCount: number;
	skippedCount: number;
	errorCount: number;
	cancelled: boolean;
	stoppedByMaxRows: boolean;
}

/** 正規表現検証結果 */
export interface RegexValidationResult {
	valid: boolean;
	message?: string;
}

/** 検索ジョブ状態 */
export type SearchJobState =
	| 'idle'
	| 'running-es'
	| 'searching-content'
	| 'completed'
	| 'cancelled'
	| 'failed';

/** 検索ジョブ開始リクエスト */
export interface SearchStartPayload {
	fileNameQuery: string;
	contentQuery: string;
	targetPath?: string;
	targetExtensions?: string;
	fileNameRegex?: boolean;
	contentRegex?: boolean;
}

/** 検索開始結果 */
export interface SearchStartResult {
	success: boolean;
	message?: string;
	state?: SearchJobState;
}

/** 検索ジョブ進捗 */
export interface SearchJobProgress {
	state: SearchJobState;
	candidateFileCount: number;
	searchedFileCount: number;
	totalFileCount: number;
	hitCount: number;
	skippedCount: number;
	errorCount: number;
	elapsedMs: number;
}

/** 検索ジョブ完了 */
export interface SearchJobComplete {
	state: SearchJobState;
	candidateFileCount: number;
	searchedFileCount: number;
	hitCount: number;
	skippedCount: number;
	errorCount: number;
	elapsedMs: number;
	stoppedByMaxRows: boolean;
	message?: string;
	warnings?: string[];
}

/** 手動更新確認結果 */
export interface UpdateCheckResult {
	status: 'not-packaged' | 'available' | 'not-available' | 'error';
	version?: string;
	currentVersion?: string;
	error?: string;
}

/** レンダラーへ通知する更新状態 */
export type UpdateStatusPayload =
	| { type: 'checking' }
	| { type: 'available'; version: string }
	| { type: 'not-available' }
	| { type: 'download-progress'; percent: number }
	| { type: 'downloaded'; version: string }
	| { type: 'error'; message: string };
