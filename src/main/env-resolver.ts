import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** レジストリ参照スコープ */
type RegistryEnvScope = 'user' | 'machine';

/** レジストリへ問い合わせる環境変数名として許可する文字 */
const REGISTRY_ENV_NAME_PATTERN = /^[A-Za-z0-9_()]+$/u;

/**
 * プロセス環境変数を大文字小文字を無視して取得する
 * @param {string} name 変数名
 * @returns {string | undefined} 値
 */
export function getProcessEnvVar(name: string): string | undefined {
	if (process.env[name]) {
		return process.env[name];
	}

	const matchedKey = Object.keys(process.env).find(
		(key) => key.toLowerCase() === name.toLowerCase(),
	);

	return matchedKey ? process.env[matchedKey] : undefined;
}

/**
 * Windows レジストリから環境変数を読み取る
 * @param {string} name 変数名
 * @param {RegistryEnvScope} scope スコープ
 * @returns {string | undefined} 値
 */
export function readWindowsRegistryEnvVar(
	name: string,
	scope: RegistryEnvScope = 'user',
): string | undefined {
	if (process.platform !== 'win32') {
		return undefined;
	}

	if (!REGISTRY_ENV_NAME_PATTERN.test(name)) {
		return undefined;
	}

	const hive = scope === 'user'
		? 'HKCU\\Environment'
		: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';

	try {
		const output = execFileSync('reg.exe', ['query', hive, '/v', name], {
			encoding   : 'utf8',
			windowsHide: true,
			stdio      : ['ignore', 'pipe', 'ignore'],
		});

		const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const match       = output.match(
			new RegExp(`^\\s*${escapedName}\\s+REG_(?:EXPAND_)?SZ\\s+(.*)$`, 'im'),
		);

		return match?.[1]?.trim() || undefined;
	} catch {
		return undefined;
	}
}

/**
 * 環境変数参照を展開する
 * @param {string} value 展開対象文字列
 * @returns {string} 展開後文字列
 */
export function expandEnvString(value: string): string {
	return value.replace(/%([^%]+)%/g, (fullMatch, varName: string) => {
		const resolved = getProcessEnvVar(varName)
			?? readWindowsRegistryEnvVar(varName, 'user')
			?? readWindowsRegistryEnvVar(varName, 'machine');

		return resolved ?? fullMatch;
	});
}

/**
 * EverythingCmdHome を解決する
 * @returns {string | undefined} ディレクトリパス
 */
export function resolveEverythingCmdHome(): string | undefined {
	const fromProcess = getProcessEnvVar('EverythingCmdHome')?.trim();

	if (fromProcess) {
		return expandEnvString(fromProcess);
	}

	const fromUserRegistry = readWindowsRegistryEnvVar('EverythingCmdHome', 'user')?.trim();

	if (fromUserRegistry) {
		return expandEnvString(fromUserRegistry);
	}

	const fromMachineRegistry = readWindowsRegistryEnvVar('EverythingCmdHome', 'machine')?.trim();

	if (fromMachineRegistry) {
		return expandEnvString(fromMachineRegistry);
	}

	return undefined;
}

/**
 * PATH セグメントを展開する
 * @param {string} segment PATH セグメント
 * @returns {string} 展開後セグメント
 */
export function expandPathSegment(segment: string): string {
	const trimmed = segment.trim();

	if (!trimmed) {
		return trimmed;
	}

	return expandEnvString(trimmed);
}

/**
 * PATH から es.exe を探す
 * @returns {string | null} 見つかったパス
 */
export function findEsExeOnPath(): string | null {
	const pathEnv  = getProcessEnvVar('PATH') ?? getProcessEnvVar('Path') ?? '';
	const segments = pathEnv.split(path.delimiter);

	for (const segment of segments) {
		const expanded = expandPathSegment(segment);

		if (!expanded) {
			continue;
		}

		const candidate = path.join(expanded, 'es.exe');

		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}

	return null;
}

/**
 * where.exe で es.exe を探す（Windows のみ）
 * @returns {string | null} 見つかったパス
 */
export function findEsExeViaWhere(): string | null {
	if (process.platform !== 'win32') {
		return null;
	}

	try {
		const output = execFileSync('where.exe', ['es.exe'], {
			encoding   : 'utf8',
			windowsHide: true,
			stdio      : ['ignore', 'pipe', 'ignore'],
		});

		const first = output
			.split(/\r?\n/)
			.map((line) => line.trim())
			.find((line) => line.toLowerCase().endsWith('es.exe'));

		if (first && fs.existsSync(first)) {
			return first;
		}
	} catch {
		return null;
	}

	return null;
}
