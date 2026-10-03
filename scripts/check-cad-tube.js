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
if (!blob || blob.surface !== 'organic' || blob.triangleCount < 10) fail('blob should fall back to an organic mesh, got ' + (blob && blob.surface));
if (boundaryCount(blob) !== 0) fail('organic blob not watertight');

const plus = [];
for (let i = -8; i <= 8; i++) { plus.push(i, 0, 0, 0, i, 0, 0, 0, i); }
const tBranch = Date.now();
const branch = Cad.buildCad(plus);
const dtBranch = Date.now() - tBranch;
if (!branch || branch.surface !== 'organic' || branch.triangleCount < 10) fail('branch should fall back to an organic mesh, got ' + (branch && branch.surface));
if (boundaryCount(branch) !== 0) fail('organic branch not watertight, ' + boundaryCount(branch));
if (dtBranch > 4000) fail('branch organic too slow ' + dtBranch + 'ms');

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
if (!paintedBlob || paintedBlob.surface !== 'organic') fail('blob should stay on the organic mesh');
const blobPaint = Cad.triangleColors(paintedBlob.positions, paintedBlob.indices, blobCells, blobColors, 1);
const blobSet = new Set(blobPaint);
if (!blobSet.has('#00FF00FF') || !blobSet.has('#FFFF00FF')) fail('fallback mesh dropped a color ' + [...blobSet].join(','));


function loadMorphKnot() {
  const fs = require('fs');
  const path = require('path');
  const code = fs.readFileSync(path.join(__dirname, '../morph-forms-v2.js'), 'utf8');
  const sandbox = { window: { VoxelApp: { openHubGenerator() {} } }, setInterval() { return 0; }, clearInterval() {} };
  sandbox.window.window = sandbox.window;
  const fn = new Function('window', 'setInterval', 'clearInterval', code);
  fn(sandbox.window, sandbox.setInterval, sandbox.clearInterval);
  const project = sandbox.window.VoxelApp.generateDeterministicHubProject({
    type: 'knot', seed: 7, shape: 35, detail: 40
  });
  const cells = [];
  for (const v of project.voxels) cells.push(v.x, v.y, v.z);
  return cells;
}

function dihedralStats(mesh) {
  const pos = mesh.positions;
  const idx = mesh.indices;
  const nTri = idx.length / 3;
  const normals = new Float32Array(nTri * 3);
  for (let t = 0; t < nTri; t++) {
    const a = idx[t * 3] * 3, b = idx[t * 3 + 1] * 3, c = idx[t * 3 + 2] * 3;
    const abx = pos[b] - pos[a], aby = pos[b + 1] - pos[a + 1], abz = pos[b + 2] - pos[a + 2];
    const acx = pos[c] - pos[a], acy = pos[c + 1] - pos[a + 1], acz = pos[c + 2] - pos[a + 2];
    let nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals[t * 3] = nx / len; normals[t * 3 + 1] = ny / len; normals[t * 3 + 2] = nz / len;
  }
  const map = new Map();
  for (let t = 0; t < nTri; t++) {
    const tri = [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]];
    for (let e = 0; e < 3; e++) {
      const a = tri[e], b = tri[(e + 1) % 3];
      const lo = a < b ? a : b, hi = a < b ? b : a;
      const k = lo + ',' + hi;
      const prev = map.get(k);
      if (prev == null) map.set(k, t);
      else map.set(k, [prev, t]);
    }
  }
  const angs = [];
  for (const pair of map.values()) {
    if (!Array.isArray(pair)) continue;
    const n0 = pair[0] * 3, n1 = pair[1] * 3;
    let d = normals[n0] * normals[n1] + normals[n0 + 1] * normals[n1 + 1] + normals[n0 + 2] * normals[n1 + 2];
    d = Math.max(-1, Math.min(1, d));
    angs.push(Math.acos(d) * 180 / Math.PI);
  }
  angs.sort((a, b) => a - b);
  if (!angs.length) return { median: 180, p90: 180, sharp: 1 };
  const median = angs[angs.length >> 1];
  const p90 = angs[Math.min(angs.length - 1, Math.floor(angs.length * 0.9))];
  let sharp = 0;
  for (const a of angs) if (a > 32) sharp++;
  return { median, p90, sharp: sharp / angs.length };
}

const morphCells = loadMorphKnot();
const tMorph = Date.now();
const morph = Cad.buildCad(morphCells, { voxelSize: 1 });
const dtMorph = Date.now() - tMorph;
if (!morph || morph.surface !== 'organic') fail('morph knot should be organic, got ' + (morph && morph.surface) + ' voxels ' + (morphCells.length / 3));
if (boundaryCount(morph) !== 0) fail('morph knot not watertight ' + boundaryCount(morph));
if (Cad.signedVolume(morph.positions, morph.indices) <= 0) fail('morph knot volume not outward');
if (dtMorph > 6000) fail('morph knot too slow ' + dtMorph + 'ms for ' + (morphCells.length / 3) + ' voxels');
const crease = dihedralStats(morph);
if (crease.median > 14) fail('morph knot still faceted, median dihedral ' + crease.median.toFixed(2));
if (crease.p90 > 26) fail('morph knot still has hard creases, p90 ' + crease.p90.toFixed(2));
if (crease.sharp > 0.04) fail('morph knot sharp edge fraction ' + crease.sharp.toFixed(3));
const legacyMorph = Cad.build(morphCells, { voxelSize: 1, subdiv: 1 });
const legacyCrease = dihedralStats(legacyMorph);
if (!(legacyCrease.median + 0.4 > crease.median)) fail('organic knot was not smoother than the voxel skin ' + crease.median.toFixed(2) + ' vs ' + legacyCrease.median.toFixed(2));


function rayHits(pos, idx, origin, dir) {
  const hits = [];
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
    const e1x = pos[b] - ax, e1y = pos[b + 1] - ay, e1z = pos[b + 2] - az;
    const e2x = pos[c] - ax, e2y = pos[c + 1] - ay, e2z = pos[c + 2] - az;
    const px = dir[1] * e2z - dir[2] * e2y;
    const py = dir[2] * e2x - dir[0] * e2z;
    const pz = dir[0] * e2y - dir[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-10) continue;
    const inv = 1 / det;
    const tx = origin[0] - ax, ty = origin[1] - ay, tz = origin[2] - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dir[0] * qx + dir[1] * qy + dir[2] * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-5) hits.push(t);
  }
  hits.sort((a, b) => a - b);
  const uniq = [];
  for (const t of hits) if (!uniq.length || t - uniq[uniq.length - 1] > 1e-3) uniq.push(t);
  return uniq;
}

const vase = [];
for (let y = 0; y < 40; y++) {
  const R = 14 - Math.cos((y / 39) * Math.PI) * 3;
  const thick = 1.2;
  const lim = Math.ceil(R) + 1;
  for (let x = -lim; x <= lim; x++) {
    for (let z = -lim; z <= lim; z++) {
      const d = Math.hypot(x, z);
      const on = y < 2 ? d <= R + 0.05 : (d >= R - thick && d <= R + 0.05);
      if (on) vase.push(x + 30, y, z + 8);
    }
  }
}
const vaseMesh = Cad.buildCad(vase, { voxelSize: 1 });
if (!vaseMesh || vaseMesh.surface !== 'vessel') fail('hollow vase should be a vessel, got ' + (vaseMesh && vaseMesh.surface));
if (boundaryCount(vaseMesh) !== 0) fail('vase not watertight ' + boundaryCount(vaseMesh));
if (Cad.signedVolume(vaseMesh.positions, vaseMesh.indices) <= 0) fail('vase volume not outward');
const vaseBed = Cad.prepareBambuPositions(vaseMesh, 1);
const vaseBox = Cad.bboxSize(vaseBed);
const vaseMax = Math.max(vaseBox.size[0], vaseBox.size[1], vaseBox.size[2]);
if (Math.abs(vaseMax - 170) > 0.6) fail('vase max dim ' + vaseMax);
if (vaseBox.size[2] + 0.5 < vaseBox.size[0] || vaseBox.size[2] + 0.5 < vaseBox.size[1]) fail('vase is not upright ' + vaseBox.size.join(','));
const vcx = (vaseBox.min[0] + vaseBox.max[0]) / 2;
const vcy = (vaseBox.min[1] + vaseBox.max[1]) / 2;
const upHits = rayHits(vaseBed, vaseMesh.indices, [vcx, vcy, vaseBox.min[2] - 5], [0, 0, 1]);
if (upHits.length !== 2) fail('vase mouth should be open, vertical hits ' + upHits.length);
const floorTh = upHits[1] - upHits[0];
if (floorTh < 2.4 || floorTh > 3.2) fail('floor thickness ' + floorTh);
const mz = (vaseBox.min[2] + vaseBox.max[2]) / 2;
const sideHits = rayHits(vaseBed, vaseMesh.indices, [vaseBox.min[0] - 5, vcy, mz], [1, 0, 0]);
if (sideHits.length < 4) fail('side wall hits ' + sideHits.length);
const wallL = sideHits[1] - sideHits[0];
const wallR = sideHits[sideHits.length - 1] - sideHits[sideHits.length - 2];
if (wallL < 2.4 || wallL > 3.2 || wallR < 2.4 || wallR > 3.2) fail('wall thickness ' + wallL + ' ' + wallR);
const sideVase = [];
for (let z = 0; z < 36; z++) {
  const R = 12;
  const lim = 14;
  for (let x = -lim; x <= lim; x++) for (let y = -lim; y <= lim; y++) {
    const d = Math.hypot(x, y);
    const on = z < 2 ? d <= R : (d >= R - 1.2 && d <= R);
    if (on) sideVase.push(x, y, z);
  }
}
const stood = Cad.buildCad(sideVase, { voxelSize: 1 });
if (!stood || stood.surface !== 'vessel' || stood.vessel.axis !== 2) fail('Z vase axis ' + (stood && stood.vessel && stood.vessel.axis));
const stoodBed = Cad.prepareBambuPositions(stood, 1);
const stoodBox = Cad.bboxSize(stoodBed);
if (stoodBox.size[2] + 0.5 < stoodBox.size[0]) fail('Z vase stayed on its side ' + stoodBox.size.join(','));

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
  branchMs: dtBranch,
  morphVoxels: morphCells.length / 3,
  morphMs: dtMorph,
  morphTriangles: morph.triangleCount,
  morphMedianDihedral: Number(crease.median.toFixed(2)),
  morphP90Dihedral: Number(crease.p90.toFixed(2)),
  morphSigma: morph.blurSigma,
  morphStep: morph.meshStep,
  curveVoxels: curve.length / 3,
  curveMs: dt2,
  filename: 'voxel-model-cad.3mf',
  columnColors: { red, blue },
  bambuUp: 'y-editor-to-z',
  vase: 'upright-170',
  vaseWallMm: Number(wallL.toFixed(2)),
  tubeEdgeFrac: Number(tubeEdges.frac.toFixed(3)),
  hoseEdgeFrac: Number(hoseEdges.frac.toFixed(3)),
  tubeStep: tube.meshStep
}));
