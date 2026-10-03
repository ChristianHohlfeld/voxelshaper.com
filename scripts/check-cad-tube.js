// Node sanity check for the CAD hose. Not part of the Pages runtime.
const Cad = require('../lib/cad-surface.js');
const fs = require('fs');
const html = fs.readFileSync(require('path').join(__dirname, '../index.html'), 'utf8');

function bresenham(x0, y0, z0, x1, y1, z1, plot) {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), dz = Math.abs(z1 - z0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, sz = z0 < z1 ? 1 : -1;
  if (dx >= dy && dx >= dz) {
    let yd = dy * 2 - dx, zd = dz * 2 - dx;
    while (x0 !== x1) {
      plot(x0, y0, z0);
      if (yd >= 0) { y0 += sy; yd -= dx * 2; }
      if (zd >= 0) { z0 += sz; zd -= dx * 2; }
      x0 += sx; yd += dy * 2; zd += dz * 2;
    }
  } else if (dy >= dx && dy >= dz) {
    let xd = dx * 2 - dy, zd = dz * 2 - dy;
    while (y0 !== y1) {
      plot(x0, y0, z0);
      if (xd >= 0) { x0 += sx; xd -= dy * 2; }
      if (zd >= 0) { z0 += sz; zd -= dy * 2; }
      y0 += sy; xd += dx * 2; zd += dz * 2;
    }
  } else {
    let xd = dx * 2 - dz, yd = dy * 2 - dz;
    while (z0 !== z1) {
      plot(x0, y0, z0);
      if (xd >= 0) { x0 += sx; xd -= dz * 2; }
      if (yd >= 0) { y0 += sy; yd -= dz * 2; }
      z0 += sz; xd += dx * 2; yd += dy * 2;
    }
  }
  plot(x1, y1, z1);
}

function raster(samples) {
  const seen = new Set();
  const cells = [];
  const add = (x, y, z) => {
    const k = x + ',' + y + ',' + z;
    if (seen.has(k)) return;
    seen.add(k);
    cells.push(x, y, z);
  };
  let prev = null;
  samples.forEach((p) => {
    const x = Math.round(p[0]), y = Math.round(p[1]), z = Math.round(p[2]);
    if (prev) bresenham(prev[0], prev[1], prev[2], x, y, z, add);
    prev = [x, y, z];
    add(x, y, z);
  });
  return cells;
}

function trefoil(scale, steps) {
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    samples.push([
      (Math.sin(t) + 2 * Math.sin(2 * t)) * scale,
      (Math.cos(t) - 2 * Math.cos(2 * t)) * scale,
      (-Math.sin(3 * t)) * scale
    ]);
  }
  return raster(samples);
}

function radialMad(positions, center, radius, stride) {
  const n = positions.length / 3;
  const m = center.length / 3;
  let acc = 0, count = 0, max = 0;
  stride = stride || 1;
  for (let i = 0; i < n; i += stride) {
    let best = Infinity, br = 0;
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    for (let j = 0; j < m; j += 3) {
      const dx = x - center[j * 3], dy = y - center[j * 3 + 1], dz = z - center[j * 3 + 2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) { best = d; br = radius[j]; }
    }
    const err = Math.abs(Math.sqrt(best) - br);
    acc += err;
    if (err > max) max = err;
    count++;
  }
  return { mad: acc / count, max: max };
}

function maxTurnDeg(center) {
  const n = center.length / 3;
  let max = 0;
  for (let i = 1; i < n - 1; i++) {
    const ax = center[i * 3] - center[(i - 1) * 3];
    const ay = center[i * 3 + 1] - center[(i - 1) * 3 + 1];
    const az = center[i * 3 + 2] - center[(i - 1) * 3 + 2];
    const bx = center[(i + 1) * 3] - center[i * 3];
    const by = center[(i + 1) * 3 + 1] - center[i * 3 + 1];
    const bz = center[(i + 1) * 3 + 2] - center[i * 3 + 2];
    const al = Math.hypot(ax, ay, az), bl = Math.hypot(bx, by, bz);
    if (al < 1e-6 || bl < 1e-6) continue;
    let d = (ax * bx + ay * by + az * bz) / (al * bl);
    d = Math.max(-1, Math.min(1, d));
    const ang = Math.acos(d) * 180 / Math.PI;
    if (ang > max) max = ang;
  }
  return max;
}

function fail(msg) {
  console.error('FAIL', msg);
  process.exit(1);
}

if (Cad.buildCad(null) !== null) fail('null input');
if (Cad.buildCad([]) !== null) fail('empty input');
if (Cad.buildCad([0, 0, 0]) === null) fail('single voxel should still mesh via fallback');

const knot = trefoil(4, 1400);
const t0 = Date.now();
const tube = Cad.buildCad(knot, { voxelSize: 1 });
const dt = Date.now() - t0;
if (!tube || tube.surface !== 'tube') fail('knot should be a tube, got ' + (tube && tube.surface));
if (tube.triangleCount < 100) fail('tube has too few triangles');
if (Cad.signedVolume(tube.positions, tube.indices) <= 0) fail('tube volume not outward');
const smooth = radialMad(tube.positions, tube.centerline, tube.centerRadius, 2);
const turn = maxTurnDeg(tube.centerline);
if (smooth.mad > 0.08) fail('tube still dented, mad ' + smooth.mad);
if (smooth.max > 0.35) fail('tube has a spike, max ' + smooth.max);
if (turn > 20) fail('centerline still stair-stepped, turn ' + turn);
if (dt > 8000) fail('knot too slow ' + dt + 'ms');

const legacy = Cad.build(knot, { voxelSize: 1 });
if (!legacy || legacy.surface !== 'voxel' || !legacy.quads || legacy.quads.length === 0) fail('legacy cad surface missing');
const dents = radialMad(legacy.positions, tube.centerline, tube.centerRadius, 1);
if (!(dents.mad > smooth.mad * 4)) fail('legacy mesh was not dentier than the hose ' + dents.mad + ' vs ' + smooth.mad);

const cube = [];
for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 6; z++) cube.push(x, y, z);
const blob = Cad.buildCad(cube);
if (!blob || blob.surface !== 'voxel' || blob.triangleCount < 10) fail('blob should fall back to a mesh');

const plus = [];
for (let i = -8; i <= 8; i++) { plus.push(i, 0, 0, 0, i, 0, 0, 0, i); }
const branch = Cad.buildCad(plus);
if (!branch || branch.surface !== 'voxel' || branch.triangleCount < 10) fail('branch should fall back to a mesh');

const obj = Cad.toObj(tube, { scale: 1, upAxis: 'Z' });
if (!/^o voxel_cad/m.test(obj) || !/^v /m.test(obj) || !/^f /m.test(obj)) fail('obj export');

const curve = [];
{
  const seen = new Set();
  const add = (x, y, z) => {
    const k = x + ',' + y + ',' + z;
    if (seen.has(k)) return;
    seen.add(k);
    curve.push(x, y, z);
  };
  let prev = null;
  for (let i = 0; i < 280; i++) {
    const p = [Math.round(Math.cos(i * 0.18) * 12), i, Math.round(Math.sin(i * 0.18) * 6)];
    if (prev) bresenham(prev[0], prev[1], prev[2], p[0], p[1], p[2], add);
    prev = p;
  }
}
const t1 = Date.now();
const hose = Cad.buildCad(curve);
const dt2 = Date.now() - t1;
if (!hose || hose.surface !== 'tube') fail('few-hundred curve should be a tube');
if (dt2 > 4000) fail('few-hundred curve too slow ' + dt2 + 'ms for ' + (curve.length / 3) + ' voxels');


function edgeFrac(mesh) {
  const pos = mesh.positions;
  const idx = mesh.indices;
  const rad = mesh.centerRadius;
  const nTri = idx.length / 3;
  const stride = Math.max(1, Math.floor(nTri / 2000));
  const lens = [];
  for (let t = 0; t < nTri; t += stride) {
    const a = idx[t * 3], b = idx[t * 3 + 1], c = idx[t * 3 + 2];
    const len = (i, j) => Math.hypot(pos[i * 3] - pos[j * 3], pos[i * 3 + 1] - pos[j * 3 + 1], pos[i * 3 + 2] - pos[j * 3 + 2]);
    lens.push(len(a, b), len(b, c), len(c, a));
  }
  lens.sort((a, b) => a - b);
  let meanR = 0;
  for (let i = 0; i < rad.length; i++) meanR += rad[i];
  meanR /= rad.length;
  return { median: lens[lens.length >> 1], frac: lens[lens.length >> 1] / meanR, meanR };
}

function boundaryCount(mesh) {
  const idx = mesh.indices;
  const map = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const tri = [idx[i], idx[i + 1], idx[i + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const lo = a < b ? a : b, hi = a < b ? b : a;
      const k = lo + ',' + hi;
      map.set(k, (map.get(k) || 0) + 1);
    }
  }
  let boundary = 0;
  for (const c of map.values()) if (c === 1) boundary++;
  return boundary;
}

const tubeEdges = edgeFrac(tube);
if (tubeEdges.frac < 0.15 || tubeEdges.frac > 0.25) fail('tube edge fraction ' + tubeEdges.frac.toFixed(3) + ' outside 0.15-0.25');
if (boundaryCount(tube) !== 0) fail('tube not watertight, boundary ' + boundaryCount(tube));
const hoseEdges = edgeFrac(hose);
if (hoseEdges.frac < 0.15 || hoseEdges.frac > 0.25) fail('hose edge fraction ' + hoseEdges.frac.toFixed(3));
if (boundaryCount(hose) !== 0) fail('hose not watertight');

if (!html.includes('voxel-model-cad.3mf')) fail('CAD download is not 3MF');
if (html.includes('voxel-model-cad.obj')) fail('CAD download still OBJ');
if (!html.includes('saveBambuPackage')) fail('CAD does not reuse the 3MF package writer');
if (!html.includes('build3DModelXML')) fail('3MF model writer missing');
if (!html.includes('VoxelCadSurface.toBambuXYZ')) fail('CAD 3MF does not use the Bambu axis map');
if (!html.includes('VoxelCadSurface.triangleColors')) fail('CAD 3MF does not sample voxel colors');
if (!html.includes('tokenFromPaletteIndex')) fail('CAD 3MF does not use the existing paint token');
if (html.includes('z = -y')) fail('CAD 3MF still uses the STL Z flip');
const bambu = Cad.toBambuXYZ(1, 2, 3, 10);
if (bambu[0] !== 10 || bambu[1] !== -30 || bambu[2] !== 20) fail('toBambuXYZ ' + bambu.join(','));

const column = [];
const columnColors = [];
for (let y = 0; y < 24; y++) {
  column.push(0, y, 0);
  columnColors.push(y < 12 ? '#FF0000FF' : '#0000FFFF');
}
const upright = Cad.buildCad(column, { voxelSize: 1 });
if (!upright || upright.triangleCount < 10) fail('column did not mesh');
let hiY = -Infinity, hiZ = -Infinity, zAtHiY = -Infinity;
const up = upright.positions;
for (let i = 0; i < up.length; i += 3) {
  const mapped = Cad.toBambuXYZ(up[i], up[i + 1], up[i + 2], 1);
  if (up[i + 1] > hiY) { hiY = up[i + 1]; zAtHiY = mapped[2]; }
  if (mapped[2] > hiZ) hiZ = mapped[2];
}
if (Math.abs(zAtHiY - hiZ) > 1e-4) fail('editor up is not Bambu up, zAtHiY ' + zAtHiY + ' hiZ ' + hiZ);
const painted = Cad.triangleColors(up, upright.indices, column, columnColors, 1);
if (!painted || painted.length !== upright.triangleCount) fail('triangle colors missing');
let red = 0, blue = 0, lowWrong = 0, highWrong = 0, lowN = 0, highN = 0;
for (let t = 0; t < painted.length; t++) {
  if (painted[t] === '#FF0000FF') red++;
  else if (painted[t] === '#0000FFFF') blue++;
  else fail('unexpected color ' + painted[t]);
  const a = upright.indices[t * 3] * 3;
  const b = upright.indices[t * 3 + 1] * 3;
  const c = upright.indices[t * 3 + 2] * 3;
  const cy = (up[a + 1] + up[b + 1] + up[c + 1]) / 3;
  if (cy < 10) { lowN++; if (painted[t] !== '#FF0000FF') lowWrong++; }
  if (cy > 14) { highN++; if (painted[t] !== '#0000FFFF') highWrong++; }
}
if (red < painted.length * 0.2 || blue < painted.length * 0.2) fail('column lost a color ' + red + '/' + blue);
if (lowN < 5 || highN < 5) fail('color bands did not land on the column');
if (lowWrong > lowN * 0.15 || highWrong > highN * 0.15) fail('colors bled, low ' + lowWrong + '/' + lowN + ' high ' + highWrong + '/' + highN);

const blobCells = [];
const blobColors = [];
for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 6; z++) {
  blobCells.push(x, y, z);
  blobColors.push(x < 3 ? '#00FF00FF' : '#FFFF00FF');
}
const paintedBlob = Cad.buildCad(blobCells);
if (!paintedBlob || paintedBlob.surface === 'tube') fail('blob should stay on the fallback mesh');
const blobPaint = Cad.triangleColors(paintedBlob.positions, paintedBlob.indices, blobCells, blobColors, 1);
const blobSet = new Set(blobPaint);
if (!blobSet.has('#00FF00FF') || !blobSet.has('#FFFF00FF')) fail('fallback mesh dropped a color ' + [...blobSet].join(','));

console.log(JSON.stringify({
  knotVoxels: knot.length / 3,
  knotMs: dt,
  tubeTriangles: tube.triangleCount,
  tubeMad: Number(smooth.mad.toFixed(4)),
  tubeMax: Number(smooth.max.toFixed(4)),
  maxTurnDeg: Number(turn.toFixed(2)),
  legacyMad: Number(dents.mad.toFixed(4)),
  blob: blob.surface,
  branch: branch.surface,
  curveVoxels: curve.length / 3,
  curveMs: dt2,
  filename: 'voxel-model-cad.3mf',
  columnColors: { red, blue },
  bambuUp: 'y-editor-to-z',
  tubeEdgeFrac: Number(tubeEdges.frac.toFixed(3)),
  hoseEdgeFrac: Number(hoseEdges.frac.toFixed(3)),
  tubeStep: tube.meshStep
}));
