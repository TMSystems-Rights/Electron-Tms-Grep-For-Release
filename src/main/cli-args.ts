/** 対象フォルダを渡す起動フラグ */
const TARGET_PATH_FLAG = '--target-path';

/**
 * 起動引数から `--target-path` の値を取り出す
 * @param {readonly string[]} argv 起動引数
 * @returns {string | undefined} 対象フォルダ。未指定なら undefined
 */
export function parseTargetPath(argv: readonly string[]): string | undefined {
	let found: string | undefined;

	for (let index = 0; index < argv.length; index += 1) {
		const token = argv[index];
		const lower = token.toLowerCase();

		if (lower === TARGET_PATH_FLAG) {
			const value = argv[index + 1];

			if (typeof value === 'string' && value.length > 0) {
				found  = value;
				index += 1;
			}

			continue;
		}

		if (lower.startsWith(`${TARGET_PATH_FLAG}=`)) {
			const value = token.slice(TARGET_PATH_FLAG.length + 1);

			if (value.length > 0) {
				found = value;
			}
		}
	}

	return found;
}
