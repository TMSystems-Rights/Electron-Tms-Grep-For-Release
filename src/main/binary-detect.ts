/** BOM 判定結果 */
export interface BomInfo {
	hasBom: boolean;
	encoding?: 'utf8' | 'utf16le' | 'utf16be';
	bomLength: number;
}

/**
 * BOM を判定する
 * @param {Buffer} buffer 先頭バイト列
 * @returns {BomInfo} BOM 情報
 */
export function detectBom(buffer: Buffer): BomInfo {
	if (buffer.length >= 3
		&& buffer[0] === 0xEF
		&& buffer[1] === 0xBB
		&& buffer[2] === 0xBF) {
		return {
			hasBom : true,
			encoding: 'utf8',
			bomLength: 3,
		};
	}

	if (buffer.length >= 2 && buffer[0] === 0xFF && buffer[1] === 0xFE) {
		return {
			hasBom : true,
			encoding: 'utf16le',
			bomLength: 2,
		};
	}

	if (buffer.length >= 2 && buffer[0] === 0xFE && buffer[1] === 0xFF) {
		return {
			hasBom : true,
			encoding: 'utf16be',
			bomLength: 2,
		};
	}

	return {
		hasBom   : false,
		bomLength: 0,
	};
}

/**
 * バッファがバイナリか判定する
 * @param {Buffer} buffer バイト列
 * @returns {boolean} バイナリなら true
 */
export function isBinaryBuffer(buffer: Buffer): boolean {
	if (buffer.length === 0) {
		return false;
	}

	const bom = detectBom(buffer);

	if (bom.hasBom && bom.encoding) {
		return false;
	}

	let controlCount = 0;
	const sampleSize = Math.min(buffer.length, 8192);

	for (let index = 0; index < sampleSize; index += 1) {
		const byte = buffer[index];

		if (byte === 0) {
			return true;
		}

		if (byte < 9 || (byte > 13 && byte < 32)) {
			controlCount += 1;
		}
	}

	return controlCount / sampleSize > 0.3;
}

/**
 * ファイルがバイナリか判定する
 * @param {Buffer} buffer 先頭付近のバイト列
 * @returns {boolean} バイナリなら true
 */
export function isBinaryFileBuffer(buffer: Buffer): boolean {
	return isBinaryBuffer(buffer);
}
