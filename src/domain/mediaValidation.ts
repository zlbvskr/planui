import { PlanuiError } from "../i18n/errorsUk";

import { assertValidIsoInstant } from "./temporal";

import { MediaAssetMeta, SupportedMediaMimeType } from "./types";

import { assertNonEmptyString } from "./validationInputs";

export const MAX_MEDIA_DIMENSION_PX = 8192;

export const MAX_MEDIA_DECODED_PIXELS = 25_000_000;

export const MAX_SINGLE_MEDIA_BYTES = 15 * 1024 * 1024;

export function sniffMediaMagicBytes(
  bytes: Uint8Array,
): SupportedMediaMimeType | null {
  if (bytes.byteLength >= 3) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return "image/jpeg";
    }
  }
  if (bytes.byteLength >= 8) {
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47 &&
      bytes[4] === 0x0d &&
      bytes[5] === 0x0a &&
      bytes[6] === 0x1a &&
      bytes[7] === 0x0a
    ) {
      return "image/png";
    }
  }
  if (bytes.byteLength >= 12) {
    if (
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50
    ) {
      return "image/webp";
    }
  }
  return null;
}

function tryExtractBinaryRasterDimensions(
  bytes: Uint8Array,
  mimeType: SupportedMediaMimeType,
): { width: number; height: number } | null {
  if (mimeType === "image/png") {
    // Minimal 16-byte PNG header fixtures (without width/height bytes) have < 24 bytes
    if (bytes.byteLength < 24) {
      return null;
    }
    const ihdrTag = String.fromCharCode(
      bytes[12],
      bytes[13],
      bytes[14],
      bytes[15],
    );
    if (ihdrTag !== "IHDR") {
      throw new PlanuiError("MEDIA_SIGNATURE_MISMATCH", "Missing PNG IHDR");
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    return { width, height };
  }

  if (mimeType === "image/webp") {
    if (bytes.byteLength < 30) {
      return null;
    }
    const chunkFourCC = String.fromCharCode(
      bytes[12],
      bytes[13],
      bytes[14],
      bytes[15],
    );
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (chunkFourCC === "VP8X") {
      const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width, height };
    }
    if (chunkFourCC === "VP8 ") {
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
        throw new PlanuiError("MEDIA_SIGNATURE_MISMATCH", "Invalid VP8 frame");
      }
      const width = view.getUint16(26, true) & 0x3fff;
      const height = view.getUint16(28, true) & 0x3fff;
      return { width, height };
    }
    if (chunkFourCC === "VP8L") {
      if (bytes[20] !== 0x2f) {
        throw new PlanuiError(
          "MEDIA_SIGNATURE_MISMATCH",
          "Invalid VP8L signature",
        );
      }
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      return { width, height };
    }
    throw new PlanuiError("MEDIA_SIGNATURE_MISMATCH", "Unsupported WebP chunk");
  }

  if (mimeType === "image/jpeg") {
    if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
      throw new PlanuiError("MEDIA_SIGNATURE_MISMATCH", "Invalid JPEG SOI");
    }
    let offset = 2;
    while (offset + 4 <= bytes.byteLength) {
      if (bytes[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = bytes[offset + 1];
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        offset += 2;
        continue;
      }
      if (offset + 4 > bytes.byteLength) break;
      const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (segmentLength < 2 || offset + 2 + segmentLength > bytes.byteLength) {
        break;
      }
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof) {
        if (offset + 9 > bytes.byteLength) {
          throw new PlanuiError(
            "MEDIA_SIGNATURE_MISMATCH",
            "Truncated JPEG SOF",
          );
        }
        const height = (bytes[offset + 5] << 8) | bytes[offset + 6];
        const width = (bytes[offset + 7] << 8) | bytes[offset + 8];
        return { width, height };
      }
      offset += 2 + segmentLength;
    }
    return null;
  }

  return null;
}

export function validateMediaAssetMetaAndBytes(
  meta: MediaAssetMeta,
  bytes?: Uint8Array,
): MediaAssetMeta {
  assertNonEmptyString(meta.id, "INVALID_ID");
  const rawMime = String(meta.mimeType).toLowerCase();
  if (rawMime.includes("svg") || rawMime.includes("xml")) {
    throw new PlanuiError("ACTIVE_SVG_FORBIDDEN", meta.id);
  }
  if (
    meta.mimeType !== "image/jpeg" &&
    meta.mimeType !== "image/png" &&
    meta.mimeType !== "image/webp"
  ) {
    throw new PlanuiError("UNSUPPORTED_MEDIA_TYPE", String(meta.mimeType));
  }
  if (
    meta.width <= 0 ||
    meta.height <= 0 ||
    meta.width > MAX_MEDIA_DIMENSION_PX ||
    meta.height > MAX_MEDIA_DIMENSION_PX ||
    meta.width * meta.height > MAX_MEDIA_DECODED_PIXELS ||
    meta.byteSize <= 0 ||
    meta.byteSize > MAX_SINGLE_MEDIA_BYTES
  ) {
    throw new PlanuiError("MEDIA_DIMENSIONS_EXCEEDED", meta.id);
  }
  if (bytes) {
    const headLen = Math.min(bytes.byteLength, 512);
    const asciiHead = new TextDecoder("utf-8", { fatal: false })
      .decode(bytes.subarray(0, headLen))
      .toLowerCase();
    if (
      asciiHead.includes("<svg") ||
      asciiHead.includes("<?xml") ||
      asciiHead.includes("<!doctype svg") ||
      asciiHead.includes("<script")
    ) {
      throw new PlanuiError("ACTIVE_SVG_FORBIDDEN", meta.id);
    }
    if (bytes.byteLength !== meta.byteSize) {
      throw new PlanuiError("BACKUP_CHECKSUM_MISMATCH", meta.id);
    }
    const detected = sniffMediaMagicBytes(bytes);
    if (!detected || detected !== meta.mimeType) {
      throw new PlanuiError("MEDIA_SIGNATURE_MISMATCH", meta.id);
    }
    const binaryDims = tryExtractBinaryRasterDimensions(bytes, meta.mimeType);
    if (binaryDims) {
      if (
        binaryDims.width <= 0 ||
        binaryDims.height <= 0 ||
        binaryDims.width > MAX_MEDIA_DIMENSION_PX ||
        binaryDims.height > MAX_MEDIA_DIMENSION_PX ||
        binaryDims.width * binaryDims.height > MAX_MEDIA_DECODED_PIXELS
      ) {
        throw new PlanuiError(
          "MEDIA_DIMENSIONS_EXCEEDED",
          `${meta.id}:${binaryDims.width}x${binaryDims.height}`,
        );
      }
      if (
        binaryDims.width !== meta.width ||
        binaryDims.height !== meta.height
      ) {
        throw new PlanuiError(
          "MEDIA_SIGNATURE_MISMATCH",
          `${meta.id}: meta ${meta.width}x${meta.height} != binary ${binaryDims.width}x${binaryDims.height}`,
        );
      }
    }
  }
  assertValidIsoInstant(meta.createdAt);
  return meta;
}
