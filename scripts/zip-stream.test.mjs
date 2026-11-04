import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createZipArchive } from '../src/storage/backup/zipCodec.ts';
test('ZIP compression drains readable output while its writer is backpressured', {timeout:2000}, async()=>{
  const original=globalThis.CompressionStream;
  // A zero-buffer TransformStream forces write/close to wait for a reader,
  // reproducing the browser export stall without changing the ZIP format.
  globalThis.CompressionStream=class extends TransformStream { constructor() { super(); } };
  try {
    const zip=await createZipArchive([{path:'data.json',bytes:new TextEncoder().encode('{"text":"Перевірка"}')}]);
    assert.equal(new DataView(zip.buffer).getUint32(0,true),0x04034b50);
  } finally {globalThis.CompressionStream=original;}
});
