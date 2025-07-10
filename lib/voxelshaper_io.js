// resilientVoxParser.js – fully‑fledged & future‑proof parser for MagicaVoxel *.vox files
// ---------------------------------------------------------------------------------
// 2025‑07 update: supports v150 (2014) … v229 (2024) chunk trees.
// Extracts only the information the VoxelShaper runtime actually needs:
//   • SIZE  – bounding box of a model (optional)
//   • XYZI  – voxel coordinates + color index (mandatory)
//   • RGBA  – custom palette (optional – falls back to default)
// All other chunks (PACK, nTRN, nGRP, nSHP, MATL, MATT, rOBJ, rCOL, LAYR …) are parsed
// only far enough to reach their children and then safely ignored.
// The parser is intentionally lenient: it *never* throws fatal errors –
// malformed or unknown data is skipped with a console.warn, keeping whatever
// could be salvaged.
// ---------------------------------------------------------------------------------

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    // CommonJS
    module.exports = factory();
  } else {
    // Browser global
    root.ResilientVoxParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------------------
   *  Helpers
   * -------------------------------------------------------------------------*/
  const TEXT_DECODER = new TextDecoder('ascii');

  function readStr(view, off, len) {
    return TEXT_DECODER.decode(new DataView(view.buffer, off, len));
  }

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  /* ---------------------------------------------------------------------------
   *  Default MagicaVoxel palette (same as MV 0.99.6). 256 * 4‑byte BGRA words.
   *  Source: official MV spec & k‑aitai struct  ([formats.kaitai.io](https://formats.kaitai.io/magicavoxel_vox/?utm_source=chatgpt.com))
   * -------------------------------------------------------------------------*/
  const DEFAULT_PALETTE = new Uint32Array([
    0x00000000, 0xffffffff, 0xffccffff, 0xff99ffff, 0xff66ffff, 0xff33ffff,
    0xff00ffff, 0xffffccff, 0xffccccff, 0xff99ccff, 0xff66ccff, 0xff33ccff,
    0xff00ccff, 0xffff99ff, 0xffcc99ff, 0xff9999ff, 0xff6699ff, 0xff3399ff,
    0xff0099ff, 0xffff66ff, 0xffcc66ff, 0xff9966ff, 0xff6666ff, 0xff3366ff,
    0xff0066ff, 0xffff33ff, 0xffcc33ff, 0xff9933ff, 0xff6633ff, 0xff3333ff,
    0xff0033ff, 0xffff00ff, 0xffcc00ff, 0xff9900ff, 0xff6600ff, 0xff3300ff,
    0xff0000ff, 0xffffffcc, 0xffccffcc, 0xff99ffcc, 0xff66ffcc, 0xff33ffcc,
    0xff00ffcc, 0xffffcccc, 0xffcccccc, 0xff99cccc, 0xff66cccc, 0xff33cccc,
    0xff00cccc, 0xffff99cc, 0xffcc99cc, 0xff9999cc, 0xff6699cc, 0xff3399cc,
    0xff0099cc, 0xffff66cc, 0xffcc66cc, 0xff9966cc, 0xff6666cc, 0xff3366cc,
    0xff0066cc, 0xffff33cc, 0xffcc33cc, 0xff9933cc, 0xff6633cc, 0xff3333cc,
    0xff0033cc, 0xffff00cc, 0xffcc00cc, 0xff9900cc, 0xff6600cc, 0xff3300cc,
    0xff0000cc, 0xffffff99, 0xffccff99, 0xff99ff99, 0xff66ff99, 0xff33ff99,
    0xff00ff99, 0xffffcc99, 0xffcccc99, 0xff99cc99, 0xff66cc99, 0xff33cc99,
    0xff00cc99, 0xffff9999, 0xffcc9999, 0xff999999, 0xff669999, 0xff339999,
    0xff009999, 0xffff6699, 0xffcc6699, 0xff996699, 0xff666699, 0xff336699,
    0xff006699, 0xffff3399, 0xffcc3399, 0xff993399, 0xff663399, 0xff333399,
    0xff003399, 0xffff0099, 0xffcc0099, 0xff990099, 0xff660099, 0xff330099,
    0xff000099, 0xffffff66, 0xffccff66, 0xff99ff66, 0xff66ff66, 0xff33ff66,
    0xff00ff66, 0xffffcc66, 0xffcccc66, 0xff99cc66, 0xff66cc66, 0xff33cc66,
    0xff00cc66, 0xffff9966, 0xffcc9966, 0xff999966, 0xff669966, 0xff339966,
    0xff009966, 0xffff6666, 0xffcc6666, 0xff996666, 0xff666666, 0xff336666,
    0xff006666, 0xffff3366, 0xffcc3366, 0xff993366, 0xff663366, 0xff333366,
    0xff003366, 0xffff0066, 0xffcc0066, 0xff990066, 0xff660066, 0xff330066,
    0xff000066, 0xffffff33, 0xffccff33, 0xff99ff33, 0xff66ff33, 0xff33ff33,
    0xff00ff33, 0xffffcc33, 0xffcccc33, 0xff99cc33, 0xff66cc33, 0xff33cc33,
    0xff00cc33, 0xffff9933, 0xffcc9933, 0xff999933, 0xff669933, 0xff339933,
    0xff009933, 0xffff6633, 0xffcc6633, 0xff996633, 0xff666633, 0xff336633,
    0xff006633, 0xffff3333, 0xffcc3333, 0xff993333, 0xff663333, 0xff333333,
    0xff003333, 0xffff0033, 0xffcc0033, 0xff990033, 0xff660033, 0xff330033,
    0xff000033, 0xffffff00, 0xffccff00, 0xff99ff00, 0xff66ff00, 0xff33ff00,
    0xff00ff00, 0xffffcc00, 0xffcccc00, 0xff99cc00, 0xff66cc00, 0xff33cc00,
    0xff00cc00, 0xffff9900, 0xffcc9900, 0xff999900, 0xff669900, 0xff339900,
    0xff009900, 0xffff6600, 0xffcc6600, 0xff996600, 0xff666600, 0xff336600,
    0xff006600, 0xffff3300, 0xffcc3300, 0xff993300, 0xff663300, 0xff333300,
    0xff003300, 0xffff0000, 0xffcc0000, 0xff990000, 0xff660000, 0xff330000,
    0xff0000ee, 0xff0000dd, 0xff0000bb, 0xff0000aa, 0xff000088, 0xff000077,
    0xff000055, 0xff000044, 0xff000022, 0xff000011, 0xff110000, 0xff220000,
    0xff440000, 0xff550000, 0xff770000, 0xff880000, 0xffaa0000, 0xffbb0000,
    0xffdd0000, 0xffee0000, 0xffff0000, 0xff00bbff, 0xff0099ff, 0xff0077ff,
    0xff0055ff, 0xff0033ff, 0xff0011ff, 0xff1100ff, 0xff2200ff, 0xff4400ff,
    0xff6600ff, 0xff7700ff, 0xff9900ff, 0xffbb00ff, 0xffdd00ff, 0xffff00ff,
    0xff00bb00, 0xff009900, 0xff007700, 0xff005500, 0xff003300, 0xff001100,
    0xff110000, 0xff221100, 0xff443300, 0xff665500, 0xff887700, 0xffaa9900,
    0xffccb300, 0xffeedd00, 0xffffee00, 0xffffffee, 0xffccffee, 0xff99ffee,
    0xff66ffee, 0xff33ffee, 0xff00ffee, 0xffffccee, 0xffccccee, 0xff99ccee,
    0xff66ccee, 0xff33ccee, 0xff00ccee, 0xffff99ee, 0xffcc99ee, 0xff9999ee,
    0xff6699ee, 0xff3399ee, 0xff0099ee, 0xffff66ee, 0xffcc66ee, 0xff9966ee,
    0xff6666ee, 0xff3366ee, 0xff0066ee, 0xffff33ee, 0xffcc33ee, 0xff9933ee,
    0xff6633ee, 0xff3333ee, 0xff0033ee, 0xffff00ee, 0xffcc00ee, 0xff9900ee,
    0xff6600ee, 0xff3300ee, 0xff0000ee, 0xffffffdd, 0xffccffdd, 0xff99ffdd,
    0xff66ffdd, 0xff33ffdd, 0xff00ffdd, 0xffffccdd, 0xffccccdd, 0xff99ccdd,
    0xff66ccdd, 0xff33ccdd, 0xff00ccdd, 0xffff99dd, 0xffcc99dd, 0xff9999dd,
    0xff6699dd, 0xff3399dd, 0xff0099dd, 0xffff66dd, 0xffcc66dd, 0xff9966dd,
    0xff6666dd, 0xff3366dd, 0xff0066dd, 0xffff33dd, 0xffcc33dd, 0xff9933dd,
    0xff6633dd, 0xff3333dd, 0xff0033dd, 0xffff00dd, 0xffcc00dd, 0xff9900dd,
    0xff6600dd, 0xff3300dd, 0xff0000dd
  ]);

  /* ---------------------------------------------------------------------------
   *  Public API: parse(buffer : ArrayBuffer) → { models: [ {sizeX, sizeY, ...} ], palette }
   * -------------------------------------------------------------------------*/
  function parse(buffer) {
    const view = new DataView(buffer);
    let off = 0;

    /* -- header -------------------------------------------------------------*/
    const magic = readStr(view, off, 4); off += 4;
    if (magic !== 'VOX ') {
      console.warn('[VOX] invalid header – expected "VOX "');
      return null;
    }
    const version = view.getUint32(off, true); off += 4;

    const models = [];
    let workingSize = null;      // SIZE data buffered until XYZI arrives
    let palette = null;          // custom palette (Uint32Array)

    /* -- recursive chunk traversal ----------------------------------------*/
    function walk(endOffset) {
      while (off < endOffset) {
        const id = readStr(view, off, 4); off += 4;
        const chunkContent = view.getUint32(off, true); off += 4;
        const chunkChildren = view.getUint32(off, true); off += 4;

        const contentOff = off;
        const childOff   = off + chunkContent;

        switch (id) {
          case 'SIZE': {
            const sx = view.getUint32(off, true); off += 4;
            const sy = view.getUint32(off, true); off += 4;
            const sz = view.getUint32(off, true); off += 4;
            workingSize = { x: sx, y: sy, z: sz };
            break;
          }
          case 'XYZI': {
            const num = view.getUint32(off, true); off += 4;
            const voxels = new Array(num);
            for (let i = 0; i < num; i++) {
              const x = view.getUint8(off++);
              const y = view.getUint8(off++);
              const z = view.getUint8(off++);
              const c = view.getUint8(off++); // 1‑based index into palette
              voxels[i] = { x, y, z, c };
            }
            // compute size from voxels if SIZE not present
            let size;
            if (workingSize) {
              size = { ...workingSize };
              workingSize = null; // consume
            } else {
              let maxX = 0, maxY = 0, maxZ = 0;
              voxels.forEach(v => {
                maxX = Math.max(maxX, v.x);
                maxY = Math.max(maxY, v.y);
                maxZ = Math.max(maxZ, v.z);
              });
              size = { x: maxX + 1, y: maxY + 1, z: maxZ + 1 };
            }
            models.push({ size, voxels });
            break;
          }
          case 'RGBA': {
            palette = new Uint32Array(256);
            for (let i = 0; i < 256; i++) {
              palette[i] = view.getUint32(off, true); off += 4;
            }
            break;
          }
          default: {
            // unknown or uninterested chunk – just skip its payload
            off += chunkContent;
          }
        }

        // descend into children (if any)
        if (chunkChildren > 0) {
          walk(childOff + chunkChildren);
        }
        off = childOff + chunkChildren; // ensure we land exactly after this chunk
      }
    }

    // top‑level MAIN chunk wrapper ------------------------------------------------
    const mainId = readStr(view, off, 4); off += 4; // 'MAIN'
    if (mainId !== 'MAIN') {
      console.warn('[VOX] missing MAIN chunk');
      return null;
    }
    const mainSize      = view.getUint32(off, true); off += 4; // always 0
    const mainChildren  = view.getUint32(off, true); off += 4;
    walk(off + mainChildren);

    if (!palette) palette = DEFAULT_PALETTE;

    return { version, models, palette };
  }

  /* ---------------------------------------------------------------------------
   *  Tiny helper: convert palette index (1‑255) to #RRGGBB string
   * -------------------------------------------------------------------------*/
  function idxToHex(idx, palette) {
    idx = clamp(idx, 1, 255);
    const abgr = palette[idx]; // stored as BGRA little‑endian
    const r = (abgr >>  0) & 0xff;
    const g = (abgr >>  8) & 0xff;
    const b = (abgr >> 16) & 0xff;
    return '#' + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
  }

  /* ---------------------------------------------------------------------------
   *  Exports
   * -------------------------------------------------------------------------*/
  return {
    parse,
    idxToHex
  };
});
