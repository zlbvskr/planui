import { PlanuiError } from '../../i18n/errorsUk';

export const BACKUP_LIMITS = {
  MAX_ARCHIVE_BYTES: 100 * 1024 * 1024,
  MAX_TOTAL_UNCOMPRESSED_BYTES: 120 * 1024 * 1024,
  MAX_MANIFEST_BYTES: 2 * 1024 * 1024,
  MAX_DATA_JSON_BYTES: 20 * 1024 * 1024,
  MAX_SINGLE_MEDIA_BYTES: 15 * 1024 * 1024,
  MAX_ENTRY_COUNT: 500,
  MAX_COMPRESSION_RATIO: 50,
} as const;

export interface ZipInputFile {
  path: string;
  bytes: Uint8Array;
}

export interface ZipExtractedFile {
  path: string;
  bytes: Uint8Array;
  compressedSize: number;
  uncompressedSize: number;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.byteLength; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  const arr = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function normalizeAndValidateZipEntryPath(rawPath: string): string {
  if (typeof rawPath !== 'string' || rawPath.length === 0) {
    throw new PlanuiError('BACKUP_UNSAFE_PATH', rawPath);
  }
  if (/[\x00-\x1f\x7f%]/.test(rawPath) || rawPath.includes('\\')) {
    throw new PlanuiError('BACKUP_UNSAFE_PATH', rawPath);
  }
  if (rawPath.startsWith('/') || /^[A-Za-z]:/.test(rawPath)) {
    throw new PlanuiError('BACKUP_UNSAFE_PATH', rawPath);
  }
  const segments = rawPath.split('/');
  for (const seg of segments) {
    if (seg === '' || seg === '.' || seg === '..') {
      throw new PlanuiError('BACKUP_UNSAFE_PATH', rawPath);
    }
  }
  const lower = rawPath.toLowerCase();
  if (
    lower.endsWith('.zip') ||
    lower.endsWith('.tar') ||
    lower.endsWith('.gz') ||
    lower.endsWith('.tgz') ||
    lower.endsWith('.7z') ||
    lower.endsWith('.rar')
  ) {
    throw new PlanuiError('BACKUP_UNSAFE_PATH', rawPath);
  }
  return segments.join('/');
}

async function deflateRawCompress(data: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === 'undefined') {
    return data;
  }
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  // Drain concurrently: browsers can backpressure even a small write/close until
  // the readable side is consumed. Awaiting close before reading can deadlock.
  const reading = new Response(cs.readable).arrayBuffer();
  const writing = (async () => {
    await writer.write(data as BufferSource);
    await writer.close();
  })();
  const [, bytes] = await Promise.all([writing, reading]);
  return new Uint8Array(bytes);
}

async function deflateRawDecompressBounded(
  compressed: Uint8Array,
  maxOutputBytes: number,
  maxRatio: number
): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'DecompressionStream unavailable');
  }
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const writePromise = writer
    .write(compressed as BufferSource)
    .then(() => writer.close())
    .catch(() => {});

  const chunks: Uint8Array[] = [];
  let totalOut = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalOut += value.byteLength;
    if (totalOut > maxOutputBytes) {
      void reader.cancel().catch(() => {});
      throw new PlanuiError('BACKUP_BOMB_DETECTED', `Expanded > ${maxOutputBytes}`);
    }
    if (
      compressed.byteLength > 0 &&
      totalOut / compressed.byteLength > maxRatio &&
      totalOut > 65536
    ) {
      void reader.cancel().catch(() => {});
      throw new PlanuiError('BACKUP_BOMB_DETECTED', 'Compression ratio exceeded');
    }
    chunks.push(value);
  }

  await writePromise;

  const out = new Uint8Array(totalOut);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function createZipArchive(
  files: readonly ZipInputFile[]
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const prepared: {
    pathBytes: Uint8Array;
    method: 0 | 8;
    crc: number;
    compressedBytes: Uint8Array;
    uncompressedSize: number;
    localHeaderOffset: number;
  }[] = [];

  for (const file of files) {
    const normalizedPath = normalizeAndValidateZipEntryPath(file.path);
    const pathBytes = encoder.encode(normalizedPath);
    const crc = crc32(file.bytes);
    const isAlreadyCompressedMedia = normalizedPath.startsWith('media/');
    let method: 0 | 8 = 0;
    let compressedBytes = file.bytes;

    if (!isAlreadyCompressedMedia && typeof CompressionStream !== 'undefined') {
      const deflated = await deflateRawCompress(file.bytes);
      if (deflated.byteLength < file.bytes.byteLength &&
          (file.bytes.length <= 65536 || file.bytes.length / Math.max(1, deflated.length) <= BACKUP_LIMITS.MAX_COMPRESSION_RATIO)) {
        method = 8;
        compressedBytes = deflated;
      }
    }

    prepared.push({
      pathBytes,
      method,
      crc,
      compressedBytes,
      uncompressedSize: file.bytes.byteLength,
      localHeaderOffset: 0,
    });
  }

  let localSectionBytes = 0;
  let centralDirBytes = 0;
  for (const item of prepared) {
    item.localHeaderOffset = localSectionBytes;
    localSectionBytes +=
      30 + item.pathBytes.byteLength + item.compressedBytes.byteLength;
    centralDirBytes += 46 + item.pathBytes.byteLength;
  }

  const totalSize = localSectionBytes + centralDirBytes + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  let offset = 0;

  for (const item of prepared) {
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 0x0800, true);
    view.setUint16(offset + 8, item.method, true);
    view.setUint16(offset + 10, 0, true);
    view.setUint16(offset + 12, 0x21, true);
    view.setUint32(offset + 14, item.crc, true);
    view.setUint32(offset + 18, item.compressedBytes.byteLength, true);
    view.setUint32(offset + 22, item.uncompressedSize, true);
    view.setUint16(offset + 26, item.pathBytes.byteLength, true);
    view.setUint16(offset + 28, 0, true);
    offset += 30;

    out.set(item.pathBytes, offset);
    offset += item.pathBytes.byteLength;

    out.set(item.compressedBytes, offset);
    offset += item.compressedBytes.byteLength;
  }

  const centralDirStart = offset;

  for (const item of prepared) {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, 0x0800, true);
    view.setUint16(offset + 10, item.method, true);
    view.setUint16(offset + 12, 0, true);
    view.setUint16(offset + 14, 0x21, true);
    view.setUint32(offset + 16, item.crc, true);
    view.setUint32(offset + 20, item.compressedBytes.byteLength, true);
    view.setUint32(offset + 24, item.uncompressedSize, true);
    view.setUint16(offset + 28, item.pathBytes.byteLength, true);
    view.setUint16(offset + 30, 0, true);
    view.setUint16(offset + 32, 0, true);
    view.setUint16(offset + 34, 0, true);
    view.setUint16(offset + 36, 0, true);
    view.setUint32(offset + 38, 0, true);
    view.setUint32(offset + 42, item.localHeaderOffset, true);
    offset += 46;

    out.set(item.pathBytes, offset);
    offset += item.pathBytes.byteLength;
  }

  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, prepared.length, true);
  view.setUint16(offset + 10, prepared.length, true);
  view.setUint32(offset + 12, centralDirBytes, true);
  view.setUint32(offset + 16, centralDirStart, true);
  view.setUint16(offset + 20, 0, true);

  return out;
}

export async function extractAndVerifyZipArchive(
  zipBytes: Uint8Array,
  limits = BACKUP_LIMITS,
  signal?: AbortSignal
): Promise<Map<string, ZipExtractedFile>> {
  if (signal?.aborted) {
    throw new PlanuiError('BACKUP_VALIDATION_ABORTED');
  }
  if (zipBytes.byteLength > limits.MAX_ARCHIVE_BYTES) {
    throw new PlanuiError('BACKUP_BOMB_DETECTED', 'Archive exceeds maximum size');
  }
  if (zipBytes.byteLength < 22) {
    throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'Archive too small');
  }

  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength
  );

  let eocdOffset = -1;
  const minEocdSearch = Math.max(0, zipBytes.byteLength - 65557);
  for (let i = zipBytes.byteLength - 22; i >= minEocdSearch; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      if (i + 22 + view.getUint16(i + 20, true) === zipBytes.byteLength) {
        eocdOffset = i;
        break;
      }
    }
  }
  if (eocdOffset < 0) {
    throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'EOCD not found');
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  if (view.getUint16(eocdOffset + 4, true) !== 0 || view.getUint16(eocdOffset + 6, true) !== 0 ||
      view.getUint16(eocdOffset + 8, true) !== entryCount || entryCount === 0xffff) {
    throw new PlanuiError('BACKUP_CORRUPTED_ZIP');
  }
  if (entryCount > limits.MAX_ENTRY_COUNT) {
    throw new PlanuiError(
      'BACKUP_BOMB_DETECTED',
      `Entry count ${entryCount} > ${limits.MAX_ENTRY_COUNT}`
    );
  }

  const centralDirSize = view.getUint32(eocdOffset + 12, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);

  if (
    centralDirOffset + centralDirSize !== eocdOffset ||
    centralDirOffset < 0
  ) {
    throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'Invalid central directory bounds');
  }

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const extracted = new Map<string, ZipExtractedFile>();
  let cdCursor = centralDirOffset;
  let runningExpandedBytes = 0;
  const ranges: Array<[number, number]> = [];
  const foldedPaths = new Set<string>();

  for (let i = 0; i < entryCount; i++) {
    if (signal?.aborted) {
      throw new PlanuiError('BACKUP_VALIDATION_ABORTED');
    }
    if (cdCursor + 46 > centralDirOffset + centralDirSize) {
      throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'Truncated CDFH');
    }
    const sig = view.getUint32(cdCursor, true);
    if (sig !== 0x02014b50) {
      throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'Invalid CDFH signature');
    }

    const versionMadeBy = view.getUint16(cdCursor + 4, true);
    const flags = view.getUint16(cdCursor + 8, true);
    if ((flags & ~0x0800) !== 0 || view.getUint16(cdCursor + 34, true) !== 0 || view.getUint16(cdCursor + 6, true) > 20) {
      throw new PlanuiError('BACKUP_CORRUPTED_ZIP');
    }
    const method = view.getUint16(cdCursor + 10, true);
    const expectedCrc = view.getUint32(cdCursor + 16, true);
    const compressedSize = view.getUint32(cdCursor + 20, true);
    const declaredUncompressedSize = view.getUint32(cdCursor + 24, true);
    const fileNameLen = view.getUint16(cdCursor + 28, true);
    const extraLen = view.getUint16(cdCursor + 30, true);
    const commentLen = view.getUint16(cdCursor + 32, true);
    const externalAttrs = view.getUint32(cdCursor + 38, true);
    const localHeaderOffset = view.getUint32(cdCursor + 42, true);

    if ((versionMadeBy >> 8) === 3) {
      const unixMode = (externalAttrs >>> 16) & 0xf000;
      if (unixMode === 0xa000) {
        throw new PlanuiError('BACKUP_UNSAFE_PATH', 'Symlink entry rejected');
      }
    }

    const nameStart = cdCursor + 46;
    const nameEnd = nameStart + fileNameLen;
    if (nameEnd + extraLen + commentLen > centralDirOffset + centralDirSize) {
      throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'CDFH name overflow');
    }

    let rawName: string;
    try {
      rawName = decoder.decode(zipBytes.subarray(nameStart, nameEnd));
    } catch {
      throw new PlanuiError('BACKUP_UNSAFE_PATH', 'Invalid UTF-8 path');
    }

    const normalizedPath = normalizeAndValidateZipEntryPath(rawName);
    const folded = normalizedPath.normalize('NFC').toLowerCase();
    if (foldedPaths.has(folded)) {
      throw new PlanuiError('BACKUP_DUPLICATE_ENTRY', normalizedPath);
    }

    foldedPaths.add(folded);
    for (let cursor = nameEnd; cursor < nameEnd + extraLen;) {
      if (cursor + 4 > nameEnd + extraLen) throw new PlanuiError('BACKUP_CORRUPTED_ZIP');
      const tag = view.getUint16(cursor, true);
      const length = view.getUint16(cursor + 2, true);
      cursor += 4 + length;
      if (cursor > nameEnd + extraLen || tag === 1 || tag === 0x7075) throw new PlanuiError('BACKUP_CORRUPTED_ZIP');
    }
    if (method !== 0 && method !== 8) {
      throw new PlanuiError(
        'BACKUP_CORRUPTED_ZIP',
        `Unsupported compression method ${method}`
      );
    }

    if (localHeaderOffset + 30 > centralDirOffset) {
      throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'Invalid LFH offset');
    }
    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'Invalid LFH signature');
    }

    const lfhNameLen = view.getUint16(localHeaderOffset + 26, true);
    const lfhExtraLen = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > centralDirOffset || dataStart < 0) {
      throw new PlanuiError('BACKUP_CORRUPTED_ZIP', 'Entry data out of bounds');
    }

    if (lfhNameLen !== fileNameLen || lfhExtraLen !== 0 ||
        !zipBytes.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + lfhNameLen).every((value, index) => value === zipBytes[nameStart + index]) ||
        view.getUint16(localHeaderOffset + 6, true) !== flags ||
        view.getUint16(localHeaderOffset + 8, true) !== method ||
        view.getUint32(localHeaderOffset + 14, true) !== expectedCrc ||
        view.getUint32(localHeaderOffset + 18, true) !== compressedSize ||
        view.getUint32(localHeaderOffset + 22, true) !== declaredUncompressedSize ||
        ranges.some(([start, end]) => localHeaderOffset < end && dataEnd > start)) {
      throw new PlanuiError('BACKUP_CORRUPTED_ZIP');
    }
    ranges.push([localHeaderOffset, dataEnd]);
    const compressedSlice = zipBytes.subarray(dataStart, dataEnd);
    const perEntryLimit = normalizedPath === 'data.json' ? limits.MAX_DATA_JSON_BYTES :
      normalizedPath === 'manifest.json' ? limits.MAX_MANIFEST_BYTES : limits.MAX_SINGLE_MEDIA_BYTES;
    const remainingBudget = Math.min(perEntryLimit,
      limits.MAX_TOTAL_UNCOMPRESSED_BYTES - runningExpandedBytes);
    if (declaredUncompressedSize > remainingBudget) throw new PlanuiError('BACKUP_BOMB_DETECTED');
    if (remainingBudget <= 0) {
      throw new PlanuiError('BACKUP_BOMB_DETECTED', 'Total uncompressed limit');
    }

    let fileBytes: Uint8Array;
    if (method === 0) {
      if (compressedSlice.byteLength > remainingBudget) {
        throw new PlanuiError('BACKUP_BOMB_DETECTED', normalizedPath);
      }
      fileBytes = new Uint8Array(compressedSlice);
    } else {
      fileBytes = await deflateRawDecompressBounded(
        compressedSlice,
        remainingBudget,
        limits.MAX_COMPRESSION_RATIO
      );
    }

    if (fileBytes.byteLength !== declaredUncompressedSize) {
      throw new PlanuiError('BACKUP_CHECKSUM_MISMATCH', normalizedPath);
    }

    const actualCrc = crc32(fileBytes);
    if (actualCrc !== expectedCrc) {
      throw new PlanuiError('BACKUP_CHECKSUM_MISMATCH', normalizedPath);
    }

    runningExpandedBytes += fileBytes.byteLength;
    extracted.set(normalizedPath, {
      path: normalizedPath,
      bytes: fileBytes,
      compressedSize,
      uncompressedSize: fileBytes.byteLength,
    });

    cdCursor = nameEnd + extraLen + commentLen;
  }

  const orderedRanges = ranges.sort((a, b) => a[0] - b[0]);
  let expectedOffset = 0;
  for (const [start, end] of orderedRanges) {
    if (start !== expectedOffset) throw new PlanuiError('BACKUP_CORRUPTED_ZIP');
    expectedOffset = end;
  }
  if (expectedOffset !== centralDirOffset || cdCursor !== centralDirOffset + centralDirSize) throw new PlanuiError('BACKUP_CORRUPTED_ZIP');
  return extracted;
}
