import fs from 'node:fs';
import iconv from 'iconv-lite';
import { logger } from './logger';
import { detectBom } from './binary-detect';
import type { EncodingSetting, ResolvedEncoding } from './types';

/** 自動判定用サンプルサイズ */
const DETECTION_SAMPLE_SIZE = 4096;

/**
 * UTF-8 として妥当か判定する
 * @param {Buffer} buffer バイト列
 * @returns {boolean} 妥当なら true
 */
export function isValidUtf8(buffer: Buffer): boolean {
	let index = 0;

	while (index < buffer.length) {
		const byte = buffer[index];

		if (byte <= 0x7F) {
			index += 1;
			continue;
		}

		let sequenceLength = 0;

		if ((byte & 0xE0) === 0xC0) {
			sequenceLength = 2;
		} else if ((byte & 0xF0) === 0xE0) {
			sequenceLength = 3;
		} else if ((byte & 0xF8) === 0xF0) {
			sequenceLength = 4;
		} else {
			return false;
		}

		if (index + sequenceLength > buffer.length) {
			// サンプル末尾で文字列が切れているだけなら UTF-8 として扱う
			return true;
		}

		for (let offset = 1; offset < sequenceLength; offset += 1) {
			if ((buffer[index + offset] & 0xC0) !== 0x80) {
				return false;
			}
		}

		index += sequenceLength;
	}

	return true;
}

/**
 * 文字コードを自動判定する
 * @param {Buffer} buffer 先頭バイト列
 * @returns {ResolvedEncoding} 判定結果
 */
export function detectEncodingFromBuffer(buffer: Buffer): ResolvedEncoding {
	const bom = detectBom(buffer);

	if (bom.encoding) {
		return bom.encoding;
	}

	const sample = buffer.subarray(0, Math.min(buffer.length, DETECTION_SAMPLE_SIZE));

	if (isValidUtf8(sample)) {
		return 'utf8';
	}

	return 'cp932';
}

/**
 * 設定値から文字コードを解決する
 * @param {Buffer} buffer 先頭バイト列
 * @param {EncodingSetting} setting 設定
 * @returns {ResolvedEncoding} 解決結果
 */
export function resolveEncoding(buffer: Buffer, setting: EncodingSetting): ResolvedEncoding {
	if (setting === 'auto') {
		return detectEncodingFromBuffer(buffer);
	}

	return setting;
}

/**
 * バッファを文字列へデコードする
 * @param {Buffer} buffer バイト列
 * @param {ResolvedEncoding} encoding 文字コード
 * @returns {string} デコード結果
 */
export function decodeBuffer(buffer: Buffer, encoding: ResolvedEncoding): string {
	return iconv.decode(buffer, encoding);
}

/**
 * ファイル全文を読み取りデコードする
 * @param {string} filePath ファイルパス
 * @param {EncodingSetting} encodingSetting 文字コード設定
 * @returns {{ content: string; encoding: ResolvedEncoding }} 読取結果
 */
export function readTextFile(
	filePath: string,
	encodingSetting: EncodingSetting,
): { content: string; encoding: ResolvedEncoding } {
	const buffer   = fs.readFileSync(filePath);
	const encoding = resolveEncoding(buffer, encodingSetting);

	logger.debug('File encoding resolved', {
		filePath,
		encoding,
		setting: encodingSetting,
	});

	return {
		content : decodeBuffer(buffer, encoding),
		encoding,
	};
}

/**
 * テキストを行単位に分割する
 * @param {string} content テキスト
 * @returns {string[]} 行配列
 */
export function splitLines(content: string): string[] {
	const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

	if (normalized.length === 0) {
		return [];
	}

	return normalized.split('\n');
}
