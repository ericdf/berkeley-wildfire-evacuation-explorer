// Minimal GeoTIFF reader for single-band float32/int16 rasters, uncompressed or
// LZW, stripped or tiled. Enough to read a DEM without GDAL. Not a general TIFF library.

export function readTiff(buf) {
  const le = buf.toString('latin1', 0, 2) === 'II';
  const u16 = o => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o);
  const u32 = o => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
  if (u16(2) !== 42) throw new Error('not a classic TIFF (BigTIFF unsupported)');
  const ifd = u32(4);
  const n = u16(ifd);
  const tags = {};
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 11: 4, 12: 8, 16: 8 };
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    const tag = u16(e), type = u16(e + 2), count = u32(e + 4);
    const sz = SIZE[type] * count;
    const off = sz <= 4 ? e + 8 : u32(e + 8);
    const vals = [];
    for (let k = 0; k < Math.min(count, 1 << 20); k++) {
      if (type === 3) vals.push(u16(off + 2 * k));
      else if (type === 4) vals.push(u32(off + 4 * k));
      else if (type === 12) vals.push(le ? buf.readDoubleLE(off + 8 * k) : buf.readDoubleBE(off + 8 * k));
      else if (type === 1 || type === 2) vals.push(buf[off + k]);
      else break;
    }
    tags[tag] = vals;
  }
  const width = tags[256][0], height = tags[257][0];
  const bits = (tags[258] || [8])[0];
  const comp = (tags[259] || [1])[0];
  const fmt = (tags[339] || [1])[0];
  const predictor = (tags[317] || [1])[0];
  if ((tags[277] || [1])[0] !== 1) throw new Error('only single-band rasters are supported');
  if (comp !== 1 && comp !== 5) throw new Error(`unsupported compression ${comp}`);
  const bpp = bits / 8;
  const data = new Float32Array(width * height);
  const sample = (b, o) => {
    if (fmt === 3 && bits === 32) return le ? b.readFloatLE(o) : b.readFloatBE(o);
    if (fmt === 2 && bits === 16) return le ? b.readInt16LE(o) : b.readInt16BE(o);
    if (fmt === 1 && bits === 16) return le ? b.readUInt16LE(o) : b.readUInt16BE(o);
    if (fmt === 2 && bits === 32) return le ? b.readInt32LE(o) : b.readInt32BE(o);
    throw new Error(`unsupported sample format ${fmt}/${bits}`);
  };
  const decode = (off, len, rowBytes) => {
    let chunk = buf.subarray(off, off + len);
    if (comp === 5) chunk = lzwDecode(chunk, rowBytes * 1e6 > 0 ? (tags[322] ? tags[322][0] * tags[323][0] * bpp : (tags[278] || [height])[0] * width * bpp) : 0);
    if (predictor === 2 && bpp === 2) {
      // horizontal differencing on 16-bit samples
      for (let r = 0; r * rowBytes < chunk.length; r++) for (let c = r * rowBytes + 2; c < (r + 1) * rowBytes; c += 2) {
        const prev = le ? chunk.readUInt16LE(c - 2) : chunk.readUInt16BE(c - 2);
        const cur = le ? chunk.readUInt16LE(c) : chunk.readUInt16BE(c);
        le ? chunk.writeUInt16LE((prev + cur) & 0xffff, c) : chunk.writeUInt16BE((prev + cur) & 0xffff, c);
      }
    } else if (predictor !== 1) throw new Error(`unsupported predictor ${predictor}`);
    return chunk;
  };
  if (tags[322]) {
    const tw = tags[322][0], th = tags[323][0];
    const offs = tags[324], lens = tags[325];
    const across = Math.ceil(width / tw);
    offs.forEach((o, t) => {
      const chunk = decode(o, lens[t], tw * bpp);
      const tx = (t % across) * tw, ty = Math.floor(t / across) * th;
      for (let r = 0; r < th && ty + r < height; r++) for (let c = 0; c < tw && tx + c < width; c++)
        data[(ty + r) * width + tx + c] = sample(chunk, (r * tw + c) * bpp);
    });
  } else {
    const rps = (tags[278] || [height])[0];
    tags[273].forEach((o, s) => {
      const chunk = decode(o, tags[279][s], width * bpp);
      for (let r = 0; r < rps && s * rps + r < height; r++) for (let c = 0; c < width; c++)
        data[(s * rps + r) * width + c] = sample(chunk, (r * width + c) * bpp);
    });
  }
  return { width, height, data, tags };
}

// TIFF LZW (MSB-first codes, early change). Table-based, no per-entry arrays.
export function lzwDecode(src, outLen) {
  const out = new Uint8Array(outLen);
  const pre = new Int32Array(4096), suf = new Uint8Array(4096), len = new Int32Array(4096), first = new Uint8Array(4096);
  for (let i = 0; i < 256; i++) { pre[i] = -1; suf[i] = i; len[i] = 1; first[i] = i; }
  let next = 258, cl = 9, bit = 0, old = -1, op = 0;
  const nbits = src.length * 8;
  const emit = c => {
    const l = len[c];
    if (op + l > outLen) return false;
    for (let k = l - 1, x = c; k >= 0; k--, x = pre[x]) out[op + k] = suf[x];
    op += l; return true;
  };
  while (bit + cl <= nbits) {
    const p = bit >> 3;
    const v = ((src[p] << 16) | ((src[p + 1] || 0) << 8) | (src[p + 2] || 0)) >>> 0;
    const code = (v >>> (24 - (bit & 7) - cl)) & ((1 << cl) - 1);
    bit += cl;
    if (code === 257) break;
    if (code === 256) { next = 258; cl = 9; old = -1; continue; }
    if (old < 0) { if (!emit(code)) break; old = code; continue; }
    let fc;
    if (code < next) { fc = first[code]; if (!emit(code)) break; }
    else { fc = first[old]; pre[next] = old; suf[next] = fc; len[next] = len[old] + 1; first[next] = first[old];
      if (!emit(next)) break; next++; old = code; if (next + 1 >= (1 << cl) && cl < 12) cl++; continue; }
    pre[next] = old; suf[next] = fc; len[next] = len[old] + 1; first[next] = first[old]; next++;
    if (next + 1 >= (1 << cl) && cl < 12) cl++;
    old = code;
  }
  return Buffer.from(out.buffer, 0, outLen);
}
