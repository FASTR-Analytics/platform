// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { IMAGE_LIMITS } from "./deps.ts";
import type { ImageMediaType } from "./deps.ts";

// `data` is the bytes of an image file as base64, with no data: URL prefix,
// and `mediaType` is the type of that file.
export type AIToolImage = {
  readonly mediaType: ImageMediaType;
  readonly data: string;
};

type ImageSize = { width: number; height: number };

// An image the API refuses fails the request that carries it, and a stored
// conversation carries its images in every later request. So this throws for
// everything the API checks that can be read without decoding the picture:
// the media type, the encoding, the size, the file being of its stated type,
// and its sides.
export function validateAIToolImage(image: AIToolImage, label: string): void {
  const readSize = Object.hasOwn(SIZE_READERS, image.mediaType)
    ? SIZE_READERS[image.mediaType]
    : undefined;
  if (readSize === undefined) {
    throw new Error(
      `${label}: media type "${image.mediaType}" is not image/jpeg, image/png, image/gif or image/webp`,
    );
  }
  if (!isBase64(image.data)) {
    throw new Error(
      `${label}: data is not base64 (the file's bytes, with no data: URL prefix)`,
    );
  }
  if (image.data.length > IMAGE_LIMITS.MAX_BASE64_CHARS) {
    throw new Error(
      `${label}: ${image.data.length} base64 characters, over the ${IMAGE_LIMITS.MAX_BASE64_CHARS} the API takes for one image`,
    );
  }
  const size = readSize(atob(image.data));
  if (size === undefined || size.width === 0 || size.height === 0) {
    throw new Error(
      `${label}: data is not a readable ${image.mediaType} file`,
    );
  }
  if (
    size.width > IMAGE_LIMITS.MAX_SIDE_PX ||
    size.height > IMAGE_LIMITS.MAX_SIDE_PX
  ) {
    throw new Error(
      `${label}: ${size.width}×${size.height} px, over the ${IMAGE_LIMITS.MAX_SIDE_PX} px a side the API takes`,
    );
  }
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

function isBase64(data: unknown): data is string {
  return typeof data === "string" && data.length > 0 &&
    data.length % 4 === 0 && BASE64.test(data);
}

// Each reader takes the file's bytes as a binary string, one character per
// byte, and returns undefined when the bytes are not a file of its format or
// end before the size.
const SIZE_READERS: Record<
  ImageMediaType,
  (bytes: string) => ImageSize | undefined
> = {
  "image/png": readPngSize,
  "image/gif": readGifSize,
  "image/jpeg": readJpegSize,
  "image/webp": readWebpSize,
};

const PNG_SIGNATURE = "\x89PNG\r\n\x1a\n";

// The signature, then the IHDR chunk: its length, its name, and the width
// and height as 32-bit big-endian.
function readPngSize(bytes: string): ImageSize | undefined {
  if (
    bytes.length < 24 || !bytes.startsWith(PNG_SIGNATURE) ||
    bytes.slice(12, 16) !== "IHDR"
  ) {
    return undefined;
  }
  return { width: uint32BE(bytes, 16), height: uint32BE(bytes, 20) };
}

// The six-byte version, then the logical screen's width and height as 16-bit
// little-endian.
function readGifSize(bytes: string): ImageSize | undefined {
  if (
    bytes.length < 10 ||
    !(bytes.startsWith("GIF87a") || bytes.startsWith("GIF89a"))
  ) {
    return undefined;
  }
  return { width: uint16LE(bytes, 6), height: uint16LE(bytes, 8) };
}

const JPEG_MARKER_PREFIX = 0xff;
const JPEG_START_OF_IMAGE = 0xd8;
const JPEG_END_OF_IMAGE = 0xd9;
const JPEG_START_OF_SCAN = 0xda;
const JPEG_TEMPORARY = 0x01;
const JPEG_FIRST_RESTART = 0xd0;
const JPEG_LAST_RESTART = 0xd7;
const JPEG_FIRST_FRAME_HEADER = 0xc0;
const JPEG_LAST_FRAME_HEADER = 0xcf;
// In the frame headers' range, and not frame headers: the Huffman tables, a
// reserved marker and the arithmetic conditioning.
const JPEG_NOT_FRAME_HEADERS = [0xc4, 0xc8, 0xcc];

// The start-of-image marker, then segments, each a marker and a 16-bit
// big-endian length that counts itself. The frame header's segment holds the
// sample precision, then the height and the width as 16-bit big-endian.
function readJpegSize(bytes: string): ImageSize | undefined {
  if (
    bytes.charCodeAt(0) !== JPEG_MARKER_PREFIX ||
    bytes.charCodeAt(1) !== JPEG_START_OF_IMAGE
  ) {
    return undefined;
  }
  let at = 2;
  while (at + 3 < bytes.length) {
    if (bytes.charCodeAt(at) !== JPEG_MARKER_PREFIX) {
      return undefined;
    }
    const marker = bytes.charCodeAt(at + 1);
    if (marker === JPEG_MARKER_PREFIX) {
      at += 1;
    } else if (isJpegMarkerWithoutSegment(marker)) {
      at += 2;
    } else if (
      marker === JPEG_END_OF_IMAGE || marker === JPEG_START_OF_SCAN
    ) {
      return undefined;
    } else if (isJpegFrameHeader(marker)) {
      return at + 8 < bytes.length
        ? { width: uint16BE(bytes, at + 7), height: uint16BE(bytes, at + 5) }
        : undefined;
    } else {
      at += 2 + uint16BE(bytes, at + 2);
    }
  }
  return undefined;
}

function isJpegMarkerWithoutSegment(marker: number): boolean {
  return marker === JPEG_START_OF_IMAGE || marker === JPEG_TEMPORARY ||
    (marker >= JPEG_FIRST_RESTART && marker <= JPEG_LAST_RESTART);
}

function isJpegFrameHeader(marker: number): boolean {
  return marker >= JPEG_FIRST_FRAME_HEADER &&
    marker <= JPEG_LAST_FRAME_HEADER &&
    !JPEG_NOT_FRAME_HEADERS.includes(marker);
}

const WEBP_LOSSLESS_SIGNATURE = 0x2f;
const WEBP_LOSSY_START_CODE = "\x9d\x01\x2a";

// A RIFF container whose first chunk, at byte 12, is one of three. "VP8 "
// (lossy) holds a frame tag, a start code, then the width and height in the
// low 14 bits of two 16-bit little-endian values. "VP8L" (lossless) holds a
// signature byte, then width minus one and height minus one as two 14-bit
// fields packed from the low bit. "VP8X" (extended) holds flags, then the
// canvas width minus one and height minus one as 24-bit little-endian.
function readWebpSize(bytes: string): ImageSize | undefined {
  if (!bytes.startsWith("RIFF") || bytes.slice(8, 12) !== "WEBP") {
    return undefined;
  }
  const chunk = bytes.slice(12, 16);
  if (chunk === "VP8 ") {
    return bytes.length >= 30 && bytes.slice(23, 26) === WEBP_LOSSY_START_CODE
      ? {
        width: uint16LE(bytes, 26) & 0x3fff,
        height: uint16LE(bytes, 28) & 0x3fff,
      }
      : undefined;
  }
  if (chunk === "VP8L") {
    if (
      bytes.length < 25 || bytes.charCodeAt(20) !== WEBP_LOSSLESS_SIGNATURE
    ) {
      return undefined;
    }
    const packed = uint32LE(bytes, 21);
    return {
      width: (packed & 0x3fff) + 1,
      height: ((packed >>> 14) & 0x3fff) + 1,
    };
  }
  if (chunk === "VP8X") {
    return bytes.length >= 30
      ? {
        width: uint24LE(bytes, 24) + 1,
        height: uint24LE(bytes, 27) + 1,
      }
      : undefined;
  }
  return undefined;
}

function uint16BE(bytes: string, at: number): number {
  return (bytes.charCodeAt(at) << 8) | bytes.charCodeAt(at + 1);
}

function uint16LE(bytes: string, at: number): number {
  return bytes.charCodeAt(at) | (bytes.charCodeAt(at + 1) << 8);
}

function uint24LE(bytes: string, at: number): number {
  return uint16LE(bytes, at) | (bytes.charCodeAt(at + 2) << 16);
}

// Unsigned shifts keep a value with its top bit set positive.
function uint32BE(bytes: string, at: number): number {
  return ((uint16BE(bytes, at) << 16) | uint16BE(bytes, at + 2)) >>> 0;
}

function uint32LE(bytes: string, at: number): number {
  return (uint16LE(bytes, at) | (uint16LE(bytes, at + 2) << 16)) >>> 0;
}
