'use strict';

Object.assign(TMS_GREP.Results, {
	/** @type {Set<string>} */
	_selectedIds: new Set(),

	/** @type {number} */
	_renderedCount: 0,

	/** @type {number | null} */
	_renderTimer: null,

	/** @type {boolean} */
	_fullRenderRequired: false,

	/** バッチ描画間隔（ms） */
	_RENDER_INTERVAL_MS: 100,

	/**
	 * 結果 UI を初期化する
	 * @returns {void}
	 */
	Init: function () {
		TMS_GREP.Results.BindEvents();
		TMS_GREP.Results.InitColumnResize();
		TMS_GREP.Results.UpdateToolbar();
	},

	/**
	 * 選択状態をクリアする
	 * @returns {void}
	 */
	ClearSelection: function () {
		TMS_GREP.Results._selectedIds.clear();
		const selectAll = document.getElementById('tmsGrepSelectAll');

		if (selectAll) {
			selectAll.checked       = false;
			selectAll.indeterminate = false;
		}
	},

	/**
	 * 結果テーブルをクリアする
	 * @returns {void}
	 */
	Clear: function () {
		TMS_GREP.Results.ClearSelection();
		TMS_GREP.Results._renderedCount      = 0;
		TMS_GREP.Results._fullRenderRequired = false;

		if (TMS_GREP.Results._renderTimer !== null) {
			window.clearTimeout(TMS_GREP.Results._renderTimer);
			TMS_GREP.Results._renderTimer = null;
		}

		const tbody = document.getElementById('tmsGrepResultTableBody');

		if (tbody) {
			tbody.replaceChildren();
		}

		TMS_GREP.Results.UpdateToolbar();
		TMS_GREP.Results.UpdateSelectAllState();
	},

	/**
	 * ヒット追加後に描画を予約する
	 * @returns {void}
	 */
	ScheduleRender: function () {
		if (TMS_GREP.Results._renderTimer !== null) {
			return;
		}

		TMS_GREP.Results._renderTimer = window.setTimeout(() => {
			TMS_GREP.Results._renderTimer = null;
			TMS_GREP.Results.Render();
		}, TMS_GREP.Results._RENDER_INTERVAL_MS);
	},

	/**
	 * 全件再描画を要求する
	 * @returns {void}
	 */
	RequestFullRender: function () {
		TMS_GREP.Results._fullRenderRequired = true;
		TMS_GREP.Results._renderedCount      = 0;
		TMS_GREP.Results.ScheduleRender();
	},

	/**
	 * テーブルを描画する
	 * @returns {void}
	 */
	Render: function () {
		const tbody = document.getElementById('tmsGrepResultTableBody');
		const hits  = TMS_GREP.Search._hits;

		if (!tbody) {
			return;
		}

		if (TMS_GREP.Results._fullRenderRequired) {
			tbody.replaceChildren();
			TMS_GREP.Results._renderedCount      = 0;
			TMS_GREP.Results._fullRenderRequired = false;
		}

		if (TMS_GREP.Results._renderedCount >= hits.length) {
			TMS_GREP.Results.UpdateToolbar();
			TMS_GREP.Results.UpdateSelectAllState();
			return;
		}

		const fragment = document.createDocumentFragment();

		for (let index = TMS_GREP.Results._renderedCount; index < hits.length; index += 1) {
			fragment.appendChild(TMS_GREP.Results.CreateRow(hits[index], index + 1));
		}

		tbody.appendChild(fragment);
		TMS_GREP.Results._renderedCount = hits.length;
		TMS_GREP.Results.UpdateToolbar();
		TMS_GREP.Results.UpdateSelectAllState();
		TMS_GREP.Results.ScheduleSyncTableWidth();
	},

	/**
	 * 一致箇所をハイライトした HTML を返す
	 * @param {string} lineText 行テキスト
	 * @param {Array<{ start: number; end: number }>} matchRanges 一致範囲
	 * @returns {string} HTML
	 */
	BuildHighlightedLineHtml: function (lineText, matchRanges) {
		if (!matchRanges || matchRanges.length === 0) {
			return TMS_GREP_COMMON.Funcs.EscapeHtml(lineText);
		}

		const ranges = [...matchRanges].sort((left, right) => left.start - right.start);
		let html     = '';
		let cursor   = 0;

		for (const range of ranges) {
			if (range.start < cursor) {
				continue;
			}

			html  += TMS_GREP_COMMON.Funcs.EscapeHtml(lineText.slice(cursor, range.start));
			html  += `<mark class="tms-grep-hit-mark">${TMS_GREP_COMMON.Funcs.EscapeHtml(lineText.slice(range.start, range.end))}</mark>`;
			cursor = range.end;
		}

		html += TMS_GREP_COMMON.Funcs.EscapeHtml(lineText.slice(cursor));

		return html;
	},

	/**
	 * 結果行 TR を生成する
	 * @param {import('../../main/types').SearchHit} hit ヒット
	 * @param {number} rowNumber 行番号
	 * @returns {HTMLTableRowElement} TR 要素
	 */
	CreateRow: function (hit, rowNumber) {
		const row     = document.createElement('tr');
		const checked = TMS_GREP.Results._selectedIds.has(hit.id);

		row.className     = 'tms-grep-result-table__row';
		row.dataset.hitId = hit.id;

		row.innerHTML = [
			`<td class="tms-grep-result-table__cell tms-grep-result-table__cell--select">`,
			`<input type="checkbox" class="tms-grep-result-table__checkbox" data-hit-id="${TMS_GREP_COMMON.Funcs.EscapeHtml(hit.id)}"${checked ? ' checked' : ''} aria-label="行 ${rowNumber} を選択">`,
			'</td>',
			`<td class="tms-grep-result-table__cell tms-grep-result-table__cell--no">${rowNumber}</td>`,
			`<td class="tms-grep-result-table__cell tms-grep-result-table__cell--path" title="${TMS_GREP_COMMON.Funcs.EscapeHtml(hit.filePath)}">${TMS_GREP_COMMON.Funcs.EscapeHtml(hit.filePath)}</td>`,
			`<td class="tms-grep-result-table__cell tms-grep-result-table__cell--num">${hit.lineNumber}</td>`,
			`<td class="tms-grep-result-table__cell tms-grep-result-table__cell--num">${hit.columnNumber}</td>`,
			`<td class="tms-grep-result-table__cell tms-grep-result-table__cell--num">${hit.hitCountInLine}</td>`,
			`<td class="tms-grep-result-table__cell tms-grep-result-table__cell--line">${TMS_GREP.Results.BuildHighlightedLineHtml(hit.lineText, hit.matchRanges)}</td>`,
			`<td class="tms-grep-result-table__cell tms-grep-result-table__cell--actions">`,
			`<div class="tms-grep-result-table__actions">`,
			`<button type="button" class="tms-grep-btn tms-grep-btn--small" data-action="copy-row" data-hit-id="${TMS_GREP_COMMON.Funcs.EscapeHtml(hit.id)}" title="行コピー">行</button>`,
			`<button type="button" class="tms-grep-btn tms-grep-btn--small" data-action="copy-path" data-hit-id="${TMS_GREP_COMMON.Funcs.EscapeHtml(hit.id)}" title="パスコピー">パス</button>`,
			`<button type="button" class="tms-grep-btn tms-grep-btn--small" data-action="open-file" data-hit-id="${TMS_GREP_COMMON.Funcs.EscapeHtml(hit.id)}" title="ファイルを開く">開く</button>`,
			`<button type="button" class="tms-grep-btn tms-grep-btn--small" data-action="open-folder" data-hit-id="${TMS_GREP_COMMON.Funcs.EscapeHtml(hit.id)}" title="フォルダを開く">📁</button>`,
			'</div>',
			'</td>',
		].join('');

		return row;
	},

	/**
	 * ヒット ID からヒットを取得する
	 * @param {string} hitId ヒット ID
	 * @returns {import('../../main/types').SearchHit | undefined} ヒット
	 */
	FindHitById: function (hitId) {
		return TMS_GREP.Search._hits.find((hit) => hit.id === hitId);
	},

	/**
	 * 現在のコピー形式を返す
	 * @returns {import('../../main/types').CopyFormat} コピー形式
	 */
	GetCopyFormat: function () {
		return TMS_GREP.App._config?.settings?.results?.copyFormat ?? 'grep';
	},

	/**
	 * 選択中のヒット一覧を返す
	 * @returns {import('../../main/types').SearchHit[]} ヒット一覧
	 */
	GetSelectedHits: function () {
		return TMS_GREP.Search._hits.filter((hit) => TMS_GREP.Results._selectedIds.has(hit.id));
	},

	/**
	 * ツールバーの活性状態を更新する
	 * @returns {void}
	 */
	UpdateToolbar: function () {
		const hasHits      = TMS_GREP.Search._hits.length > 0;
		const selectedHits = TMS_GREP.Results.GetSelectedHits();
		const copyAllBtn   = document.getElementById('tmsGrepBtnCopyAll');
		const copySelBtn   = document.getElementById('tmsGrepBtnCopySelected');
		const copyPathsBtn = document.getElementById('tmsGrepBtnCopyPaths');

		if (copyAllBtn) {
			copyAllBtn.disabled = !hasHits;
		}

		if (copySelBtn) {
			copySelBtn.disabled = selectedHits.length === 0;
		}

		if (copyPathsBtn) {
			copyPathsBtn.disabled = !hasHits;
		}
	},

	/**
	 * 全選択チェックボックスの状態を更新する
	 * @returns {void}
	 */
	UpdateSelectAllState: function () {
		const selectAll = document.getElementById('tmsGrepSelectAll');
		const hits      = TMS_GREP.Search._hits;

		if (!selectAll || hits.length === 0) {
			if (selectAll) {
				selectAll.checked       = false;
				selectAll.indeterminate = false;
			}

			return;
		}

		const selectedCount = TMS_GREP.Results.GetSelectedHits().length;

		selectAll.checked       = selectedCount === hits.length;
		selectAll.indeterminate = selectedCount > 0 && selectedCount < hits.length;
	},

	/**
	 * ヒット一覧をクリップボードへコピーする
	 * @param {import('../../main/types').SearchHit[]} hits ヒット一覧
	 * @param {import('../../main/types').CopyFormat} format コピー形式
	 * @param {string} emptyMessage 空時メッセージ
	 * @returns {Promise<void>}
	 */
	CopyHits: async function (hits, format, emptyMessage) {
		if (hits.length === 0) {
			TMS_GREP_COMMON.Ui.ShowToast(emptyMessage, 'warn');
			return;
		}

		try {
			const result = await window.grepApi.copyHits({ hits, format });

			if (!result?.success) {
				TMS_GREP_COMMON.Ui.ShowToast(result?.message ?? 'コピーに失敗しました。', 'error');
				return;
			}

			TMS_GREP_COMMON.Ui.ShowToast(`${result.lineCount ?? hits.length} 件をコピーしました。`, 'info');
		} catch (error) {
			TMS_GREP_COMMON.Ui.ShowToast(
				error instanceof Error ? error.message : 'コピーに失敗しました。',
				'error',
			);
		}
	},

	/**
	 * 全結果をコピーする
	 * @returns {Promise<void>}
	 */
	CopyAll: async function () {
		await TMS_GREP.Results.CopyHits(
			TMS_GREP.Search._hits,
			TMS_GREP.Results.GetCopyFormat(),
			'コピー対象の検索結果がありません。',
		);
	},

	/**
	 * 選択結果をコピーする
	 * @returns {Promise<void>}
	 */
	CopySelected: async function () {
		await TMS_GREP.Results.CopyHits(
			TMS_GREP.Results.GetSelectedHits(),
			TMS_GREP.Results.GetCopyFormat(),
			'コピーする行を選択してください。',
		);
	},

	/**
	 * パス一覧をコピーする
	 * @returns {Promise<void>}
	 */
	CopyPaths: async function () {
		await TMS_GREP.Results.CopyHits(
			TMS_GREP.Search._hits,
			'paths',
			'コピー対象の検索結果がありません。',
		);
	},

	/**
	 * 1 行をコピーする
	 * @param {string} hitId ヒット ID
	 * @returns {Promise<void>}
	 */
	CopyRow: async function (hitId) {
		const hit = TMS_GREP.Results.FindHitById(hitId);

		if (!hit) {
			TMS_GREP_COMMON.Ui.ShowToast('コピー対象が見つかりません。', 'warn');
			return;
		}

		await TMS_GREP.Results.CopyHits([hit], TMS_GREP.Results.GetCopyFormat(), 'コピー対象が見つかりません。');
	},

	/**
	 * 1 件のパスをコピーする
	 * @param {string} hitId ヒット ID
	 * @returns {Promise<void>}
	 */
	CopyPath: async function (hitId) {
		const hit = TMS_GREP.Results.FindHitById(hitId);

		if (!hit) {
			TMS_GREP_COMMON.Ui.ShowToast('コピー対象が見つかりません。', 'warn');
			return;
		}

		await TMS_GREP.Results.CopyHits([hit], 'paths', 'コピー対象が見つかりません。');
	},

	/**
	 * ファイルを開く
	 * @param {string} hitId ヒット ID
	 * @returns {Promise<void>}
	 */
	OpenFile: async function (hitId) {
		const hit = TMS_GREP.Results.FindHitById(hitId);

		if (!hit) {
			TMS_GREP_COMMON.Ui.ShowToast('対象ファイルが見つかりません。', 'warn');
			return;
		}

		try {
			const result = await window.grepApi.openFile(hit.filePath);

			if (!result?.success) {
				TMS_GREP_COMMON.Ui.ShowToast(result?.message ?? 'ファイルを開けませんでした。', 'error');
			}
		} catch (error) {
			TMS_GREP_COMMON.Ui.ShowToast(
				error instanceof Error ? error.message : 'ファイルを開けませんでした。',
				'error',
			);
		}
	},

	/**
	 * フォルダを開く
	 * @param {string} hitId ヒット ID
	 * @returns {Promise<void>}
	 */
	OpenFolder: async function (hitId) {
		const hit = TMS_GREP.Results.FindHitById(hitId);

		if (!hit) {
			TMS_GREP_COMMON.Ui.ShowToast('対象ファイルが見つかりません。', 'warn');
			return;
		}

		try {
			const result = await window.grepApi.showItemInFolder(hit.filePath);

			if (!result?.success) {
				TMS_GREP_COMMON.Ui.ShowToast(result?.message ?? 'フォルダを開けませんでした。', 'error');
			}
		} catch (error) {
			TMS_GREP_COMMON.Ui.ShowToast(
				error instanceof Error ? error.message : 'フォルダを開けませんでした。',
				'error',
			);
		}
	},

	/**
	 * 行チェック状態を切り替える
	 * @param {string} hitId ヒット ID
	 * @param {boolean} checked 選択状態
	 * @returns {void}
	 */
	SetRowSelected: function (hitId, checked) {
		if (checked) {
			TMS_GREP.Results._selectedIds.add(hitId);
		} else {
			TMS_GREP.Results._selectedIds.delete(hitId);
		}

		TMS_GREP.Results.UpdateToolbar();
		TMS_GREP.Results.UpdateSelectAllState();
	},

	/**
	 * 全行の選択状態を切り替える
	 * @param {boolean} checked 選択状態
	 * @returns {void}
	 */
	SetAllSelected: function (checked) {
		TMS_GREP.Results._selectedIds.clear();

		if (checked) {
			for (const hit of TMS_GREP.Search._hits) {
				TMS_GREP.Results._selectedIds.add(hit.id);
			}
		}

		const checkboxes = document.querySelectorAll('.tms-grep-result-table__checkbox');

		for (const checkbox of checkboxes) {
			if (checkbox instanceof HTMLInputElement) {
				checkbox.checked = checked;
			}
		}

		TMS_GREP.Results.UpdateToolbar();
		TMS_GREP.Results.UpdateSelectAllState();
	},

	/**
	 * テーブル操作イベントを処理する
	 * @param {MouseEvent} event クリックイベント
	 * @returns {void}
	 */
	HandleTableClick: function (event) {
		const target = event.target;

		if (!(target instanceof HTMLElement)) {
			return;
		}

		const actionButton = target.closest('[data-action]');

		if (actionButton instanceof HTMLElement) {
			const hitId  = actionButton.dataset.hitId ?? '';
			const action = actionButton.dataset.action ?? '';

			switch (action) {
				case 'copy-row':
					void TMS_GREP.Results.CopyRow(hitId);
					break;
				case 'copy-path':
					void TMS_GREP.Results.CopyPath(hitId);
					break;
				case 'open-file':
					void TMS_GREP.Results.OpenFile(hitId);
					break;
				case 'open-folder':
					void TMS_GREP.Results.OpenFolder(hitId);
					break;
				default:
					break;
			}

			return;
		}

		const checkbox = target.closest('.tms-grep-result-table__checkbox');

		if (checkbox instanceof HTMLInputElement) {
			TMS_GREP.Results.SetRowSelected(checkbox.dataset.hitId ?? '', checkbox.checked);
		}
	},

	/**
	 * col 要素の幅（px）を返す
	 * @param {Element | null | undefined} col col 要素
	 * @returns {number} 幅（px）
	 */
	GetColWidthPx: function (col) {
		if (!(col instanceof HTMLTableColElement)) {
			return 0;
		}

		const styleWidth = col.style.width;

		if (styleWidth && styleWidth.endsWith('px')) {
			const parsed = Number.parseInt(styleWidth, 10);

			if (parsed > 0) {
				return parsed;
			}
		}

		const measured = col.getBoundingClientRect().width;

		return measured > 0 ? Math.round(measured) : 0;
	},

	/**
	 * 操作列がボタン群に収まるよう最小幅を確保する
	 * @returns {void}
	 */
	EnsureActionsColumnWidth: function () {
		const table   = document.getElementById('tmsGrepResultTable');
		const content = document.getElementById('tmsGrepResultsContent');

		if (!table || content?.hidden || TMS_GREP.Search._hits.length === 0) {
			return;
		}

		const actionsCol = table.querySelector('col[data-col-key="actions"]');
		const sampleCell = table.querySelector('.tms-grep-result-table__cell--actions');

		if (!(actionsCol instanceof HTMLTableColElement) || !(sampleCell instanceof HTMLElement)) {
			return;
		}

		const needed  = Math.ceil(sampleCell.scrollWidth);
		const current = TMS_GREP.Results.GetColWidthPx(actionsCol) || 220;

		if (needed > current) {
			actionsCol.style.width = `${needed}px`;
		}
	},

	/**
	 * レイアウト確定後にテーブル幅を同期する
	 * @returns {void}
	 */
	ScheduleSyncTableWidth: function () {
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				TMS_GREP.Results.EnsureActionsColumnWidth();
				TMS_GREP.Results.SyncTableWidth();
			});
		});
	},

	/**
	 * 列幅合計に合わせてテーブル幅を更新する
	 * @returns {void}
	 */
	SyncTableWidth: function () {
		const table   = document.getElementById('tmsGrepResultTable');
		const wrap    = document.getElementById('tmsGrepResultTableWrap');
		const content = document.getElementById('tmsGrepResultsContent');

		if (!table || !wrap || content?.hidden) {
			return;
		}

		const cols  = table.querySelectorAll('colgroup col');
		let totalPx = 0;

		for (const col of cols) {
			totalPx += TMS_GREP.Results.GetColWidthPx(col);
		}

		if (totalPx <= 0) {
			return;
		}

		table.style.width = `${Math.max(totalPx, wrap.clientWidth)}px`;
	},

	/**
	 * 列幅ドラッグ調整を初期化する
	 * @returns {void}
	 */
	InitColumnResize: function () {
		const table = document.getElementById('tmsGrepResultTable');

		if (!table) {
			return;
		}

		const resizers = table.querySelectorAll('.tms-grep-result-table__col-resizer');

		for (const resizer of resizers) {
			resizer.addEventListener('mousedown', (event) => {
				if (!(event instanceof MouseEvent)) {
					return;
				}

				event.preventDefault();
				event.stopPropagation();

				const header = resizer.closest('th');

				if (!(header instanceof HTMLTableCellElement)) {
					return;
				}

				const colKey = header.dataset.colKey ?? '';
				const col    = table.querySelector(`col[data-col-key="${colKey}"]`);

				if (!(col instanceof HTMLTableColElement)) {
					return;
				}

				const startX     = event.clientX;
				const startWidth = col.getBoundingClientRect().width;

				/**
				 * 列幅ドラッグ中の処理
				 * @param {MouseEvent} moveEvent マウスイベント
				 * @returns {void}
				 */
				const onMouseMove = (moveEvent) => {
					const nextWidth = Math.max(48, Math.round(startWidth + (moveEvent.clientX - startX)));
					col.style.width = `${nextWidth}px`;
					TMS_GREP.Results.SyncTableWidth();
				};

				/**
				 * 列幅ドラッグ終了時の処理
				 * @returns {void}
				 */
				const onMouseUp = () => {
					document.body.classList.remove('tms-grep-col-resizing');
					document.removeEventListener('mousemove', onMouseMove);
					document.removeEventListener('mouseup', onMouseUp);
					TMS_GREP.Results.SyncTableWidth();
				};

				document.body.classList.add('tms-grep-col-resizing');
				document.addEventListener('mousemove', onMouseMove);
				document.addEventListener('mouseup', onMouseUp);
			});
		}

		window.addEventListener('resize', () => {
			TMS_GREP.Results.SyncTableWidth();
		});
	},

	/**
	 * イベントを登録する
	 * @returns {void}
	 */
	BindEvents: function () {
		const copyAllBtn   = document.getElementById('tmsGrepBtnCopyAll');
		const copySelBtn   = document.getElementById('tmsGrepBtnCopySelected');
		const copyPathsBtn = document.getElementById('tmsGrepBtnCopyPaths');
		const selectAll    = document.getElementById('tmsGrepSelectAll');
		const tableWrap    = document.getElementById('tmsGrepResultTableWrap');

		if (copyAllBtn) {
			copyAllBtn.addEventListener('click', () => {
				void TMS_GREP.Results.CopyAll();
			});
		}

		if (copySelBtn) {
			copySelBtn.addEventListener('click', () => {
				void TMS_GREP.Results.CopySelected();
			});
		}

		if (copyPathsBtn) {
			copyPathsBtn.addEventListener('click', () => {
				void TMS_GREP.Results.CopyPaths();
			});
		}

		if (selectAll) {
			selectAll.addEventListener('change', () => {
				TMS_GREP.Results.SetAllSelected(selectAll.checked);
			});
		}

		if (tableWrap) {
			tableWrap.addEventListener('click', (event) => {
				TMS_GREP.Results.HandleTableClick(event);
			});
		}
	},
});
