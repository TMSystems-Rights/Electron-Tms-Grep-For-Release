'use strict';

Object.assign(TMS_GREP.Keyboard, {
	/**
	 * ショートカット文字列がイベントと一致するか
	 * @param {KeyboardEvent} event キーイベント
	 * @param {string} shortcut ショートカット
	 * @returns {boolean} 一致すれば true
	 */
	MatchesShortcut: function (event, shortcut) {
		if (!shortcut) {
			return false;
		}

		const parts   = shortcut.split('+').map((part) => part.trim()).filter(Boolean);
		let needCtrl  = false;
		let needShift = false;
		let needAlt   = false;
		let keyPart   = '';

		for (const part of parts) {
			const lower = part.toLowerCase();

			if (lower === 'ctrl' || lower === 'control') {
				needCtrl = true;
				continue;
			}

			if (lower === 'shift') {
				needShift = true;
				continue;
			}

			if (lower === 'alt') {
				needAlt = true;
				continue;
			}

			keyPart = part;
		}

		if (!keyPart) {
			return false;
		}

		const normalizedEventKey = event.key.length === 1
			? event.key.toLowerCase()
			: TMS_GREP.Keyboard.NormalizeKeyName(event.key);

		const targetKey = keyPart.length === 1
			? keyPart.toLowerCase()
			: TMS_GREP.Keyboard.NormalizeKeyName(keyPart);

		return event.ctrlKey === needCtrl
			&& event.shiftKey === needShift
			&& event.altKey === needAlt
			&& normalizedEventKey === targetKey;
	},

	/**
	 * キー名を KeyboardEvent.key と比較可能な形に揃える
	 * @param {string} key キー名
	 * @returns {string} 正規化後のキー名
	 */
	NormalizeKeyName: function (key) {
		if (key === 'Esc') {
			return 'Escape';
		}

		return key;
	},

	/**
	 * KeyboardEvent からショートカット文字列を生成する
	 * @param {KeyboardEvent} event キーイベント
	 * @returns {string | null} ショートカット（修飾キーのみの場合 null）
	 */
	FormatShortcutFromEvent: function (event) {
		if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
			return null;
		}

		const parts = [];

		if (event.ctrlKey) {
			parts.push('Ctrl');
		}

		if (event.shiftKey) {
			parts.push('Shift');
		}

		if (event.altKey) {
			parts.push('Alt');
		}

		let keyLabel = event.key;

		if (keyLabel === ' ') {
			keyLabel = 'Space';
		} else if (keyLabel.length === 1) {
			keyLabel = keyLabel.toUpperCase();
		} else if (keyLabel === 'Escape') {
			keyLabel = 'Esc';
		} else if (keyLabel.startsWith('Arrow')) {
			keyLabel = keyLabel.replace('Arrow', '');
		}

		parts.push(keyLabel);

		return parts.join('+');
	},

	/**
	 * 入力欄にフォーカスがあるか
	 * @returns {boolean} 入力欄なら true
	 */
	IsTypingTarget: function () {
		const active = document.activeElement;

		if (!active) {
			return false;
		}

		const tag = active.tagName.toLowerCase();

		return tag === 'input' || tag === 'textarea' || active.isContentEditable;
	},

	/**
	 * キーボード操作を処理する
	 * @param {KeyboardEvent} event キーイベント
	 * @returns {void}
	 */
	HandleKeyDown: function (event) {
		if (TMS_GREP.Confirm.IsOpen()) {
			if (event.key === 'Escape') {
				event.preventDefault();
				TMS_GREP.Confirm.Close(false);
			}

			return;
		}

		if (TMS_GREP.Settings.IsCapturingShortcut()) {
			if (TMS_GREP.Settings.HandleShortcutCapture(event)) {
				return;
			}
		}

		if (TMS_GREP.Settings.IsOpen()) {
			if (event.key === 'Escape') {
				event.preventDefault();
				void TMS_GREP.Settings.Close();
			}

			return;
		}

		const config        = TMS_GREP.App._config;
		const keybindings   = config?.settings?.keybindings ?? {};
		const toggleFile    = keybindings.toggleFileNameRegex ?? 'Ctrl+R';
		const toggleContent = keybindings.toggleContentRegex ?? 'Ctrl+Shift+R';
		const runSearch     = keybindings.runSearch ?? 'Ctrl+Enter';
		const clearSearch   = keybindings.clear ?? 'Ctrl+Shift+C';

		if (TMS_GREP.Keyboard.MatchesShortcut(event, toggleFile)) {
			event.preventDefault();
			TMS_GREP.Search.ToggleFileNameRegex();
			return;
		}

		if (TMS_GREP.Keyboard.MatchesShortcut(event, toggleContent)) {
			event.preventDefault();
			TMS_GREP.Search.ToggleContentRegex();
			return;
		}

		if (TMS_GREP.Keyboard.MatchesShortcut(event, runSearch)) {
			event.preventDefault();
			void TMS_GREP.Search.RequestSearch();
			return;
		}

		if (TMS_GREP.Keyboard.MatchesShortcut(event, clearSearch)) {
			event.preventDefault();

			if (!TMS_GREP.Search.IsBusy()) {
				TMS_GREP.Search.ClearAll();
			}
		}
	},

	/**
	 * グローバルキーボードイベントを登録する
	 * @returns {void}
	 */
	BindEvents: function () {
		document.addEventListener('keydown', (event) => {
			TMS_GREP.Keyboard.HandleKeyDown(event);
		});
	},
});
