import fs from 'node:fs';
import { shell } from 'electron';

/**
 * ファイルを OS 既定のアプリで開く
 * @param {string} filePath ファイルパス
 * @returns {Promise<{ success: boolean; message?: string }>} 結果
 */
export async function openFile(filePath: string): Promise<{ success: boolean; message?: string }> {
	const normalized = filePath.trim();

	if (!normalized) {
		return {
			success: false,
			message: 'ファイルパスが空です。',
		};
	}

	if (!fs.existsSync(normalized)) {
		return {
			success: false,
			message: `ファイルが存在しません: ${normalized}`,
		};
	}

	const result = await shell.openPath(normalized);

	if (result) {
		return {
			success: false,
			message: result,
		};
	}

	return { success: true };
}

/**
 * Explorer でファイルを選択表示する
 * @param {string} filePath ファイルパス
 * @returns {{ success: boolean; message?: string }} 結果
 */
export function showItemInFolder(filePath: string): { success: boolean; message?: string } {
	const normalized = filePath.trim();

	if (!normalized) {
		return {
			success: false,
			message: 'ファイルパスが空です。',
		};
	}

	if (!fs.existsSync(normalized)) {
		return {
			success: false,
			message: `ファイルが存在しません: ${normalized}`,
		};
	}

	shell.showItemInFolder(normalized);

	return { success: true };
}
