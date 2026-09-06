/** 起動引数で渡された対象フォルダ */
let pendingLaunchTargetPath: string | undefined;

/**
 * 起動引数の対象フォルダを保持する
 * @param {string} targetPath 対象フォルダ
 * @returns {void}
 */
export function setPendingLaunchTargetPath(targetPath: string): void {
	pendingLaunchTargetPath = targetPath;
}

/**
 * 保持中の対象フォルダを返す
 * @returns {string | undefined} 対象フォルダ
 */
export function getPendingLaunchTargetPath(): string | undefined {
	return pendingLaunchTargetPath;
}
