(function () {
  'use strict';
  function mulberry(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s |= 0; s = s + 0x6D2B79F5 | 0;
      let t = Math.imul(s ^ s >>> 15, 1 | s);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function build(meta, app) {
    const type = String(meta.type || 'castle');
    const rand = mulberry(Number.isFinite(meta.seed) ? meta.seed : 7);
    const shape = Number.isFinite(meta.shape) ? meta.shape : 75;
    const N = clamp(Math.round(28 + shape * 0.2), 28, 48);
    const budget = (app && app.isMobile) ? 3600 : 7000;
    const voxels = [];
    const seen = new Set();
    function put(x, y, z, color) {
      x = x | 0; y = y | 0; z = z | 0;
      if (x < 0 || y < 0 || z < 0 || x >= N || y >= N || z >= N) return;
      const k = x + ',' + y + ',' + z;
      if (seen.has(k)) return;
      seen.add(k);
      voxels.push({ x: x, y: y, z: z, color: color });
    }
    function box(x0, x1, y0, y1, z0, z1, color) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, color);
    }
    function shell(x0, x1, y0, y1, z0, z1, color) {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++)
        if (x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1) put(x, y, z, color);
    }
    function sphere(cx, cy, cz, r, color) {
      const r2 = r * r;
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        for (let y = Math.floor(cy - r); y <= cy + r; y++)
          for (let z = Math.floor(cz - r); z <= cz + r; z++) {
            const dx = x - cx, dy = y - cy, dz = z - cz;
            if (dx * dx + dy * dy + dz * dz <= r2) put(x, y, z, color);
          }
    }
    function cylY(cx, cz, y0, y1, r, color) {
      const r2 = r * r;
      for (let y = y0; y <= y1; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++)
          for (let z = Math.floor(cz - r); z <= cz + r; z++) {
            const dx = x - cx, dz = z - cz;
            if (dx * dx + dz * dz <= r2) put(x, y, z, color);
          }
    }
    function cylZ(cx, cy, z0, z1, r, color) {
      const r2 = r * r;
      for (let z = z0; z <= z1; z++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++)
          for (let y = Math.floor(cy - r); y <= cy + r; y++) {
            const dx = x - cx, dy = y - cy;
            if (dx * dx + dy * dy <= r2) put(x, y, z, color);
          }
    }
    function cylX(cy, cz, x0, x1, r, color) {
      const r2 = r * r;
      for (let x = x0; x <= x1; x++)
        for (let y = Math.floor(cy - r); y <= cy + r; y++)
          for (let z = Math.floor(cz - r); z <= cz + r; z++) {
            const dy = y - cy, dz = z - cz;
            if (dy * dy + dz * dz <= r2) put(x, y, z, color);
          }
    }
    const mid = (N / 2) | 0;
    const C = {
      stone: '#9AA3AD', stone2: '#6B7280', roof: '#C0392B', gold: '#F2C14E',
      dark: '#1F2933', grass: '#3D9A4A', grass2: '#2E7D32', metal: '#B8C4CE',
      metal2: '#7B8A99', glow: '#5CE1FF', orange: '#F4A261', tire: '#111111',
      wood: '#7A4A24', leaf: '#2F9E44', leaf2: '#1B7A32', water: '#22B8CF',
      sand: '#D4B483', window: '#7DD3FC', white: '#E8EEF4', purple: '#A78BFA'
    };
    function castle() {
      const span = Math.max(12, Math.floor(N * 0.38));
      const x0 = mid - span, x1 = mid + span, z0 = mid - span, z1 = mid + span;
      box(x0 - 1, x1 + 1, 0, 1, z0 - 1, z1 + 1, C.grass);
      box(x0, x1, 2, 3, z0, z1, C.stone2);
      shell(x0, x1, 3, 9, z0, z1, C.stone);
      for (let x = x0 + 2; x < x1; x += 3) { put(x, 6, z0, C.window); put(x, 6, z1, C.window); }
      for (let z = z0 + 2; z < z1; z += 3) { put(x0, 6, z, C.window); put(x1, 6, z, C.window); }
      for (let x = x0; x <= x1; x += 2) { put(x, 10, z0, C.stone); put(x, 10, z1, C.stone); }
      for (let z = z0; z <= z1; z += 2) { put(x0, 10, z, C.stone); put(x1, 10, z, C.stone); }
      const tw = Math.max(4, Math.floor(N * 0.09));
      const th = 14 + (rand() * 4 | 0);
      [[x0, z0], [x1 - tw, z0], [x0, z1 - tw], [x1 - tw, z1 - tw]].forEach(function (c) {
        shell(c[0], c[0] + tw, 2, th, c[1], c[1] + tw, C.stone);
        for (let y = 5; y < th - 1; y += 3) {
          put(c[0] + 1, y, c[1], C.window);
          put(c[0] + tw - 1, y, c[1] + tw, C.window);
        }
        box(c[0] - 1, c[0] + tw + 1, th + 1, th + 1, c[1] - 1, c[1] + tw + 1, C.roof);
        box(c[0], c[0] + tw, th + 2, th + 3, c[1], c[1] + tw, C.roof);
        box(c[0] + 1, c[0] + tw - 1, th + 4, th + 5, c[1] + 1, c[1] + tw - 1, C.roof);
        put(((c[0] + c[0] + tw) / 2) | 0, th + 6, ((c[1] + c[1] + tw) / 2) | 0, C.gold);
      });
      box(mid - 2, mid + 2, 2, 6, z1 - 1, z1 + 1, C.dark);
      box(mid - 1, mid + 1, 2, 5, z1, z1 + 1, C.gold);
      shell(mid - 4, mid + 4, 3, 13, mid - 4, mid + 4, C.stone);
      box(mid - 3, mid + 3, 14, 16, mid - 3, mid + 3, C.roof);
      put(mid, 17, mid, C.gold);
    }
    function spaceship() {
      const z0 = Math.max(2, mid - Math.floor(N * 0.36));
      const z1 = Math.min(N - 3, mid + Math.floor(N * 0.36));
      for (let z = z0; z <= z1; z++) {
        const t = (z - z0) / Math.max(1, z1 - z0);
        const r = t < 0.18 ? 1 + t * 10 : (t > 0.82 ? 3 - (t - 0.82) * 8 : 3.4);
        cylZ(mid, mid + 3, z, z, r, t > 0.88 ? C.glow : C.metal);
      }
      box(mid - 11, mid - 4, mid + 2, mid + 3, mid - 2, mid + 4, C.metal2);
      box(mid + 4, mid + 11, mid + 2, mid + 3, mid - 2, mid + 4, C.metal2);
      for (let i = 0; i < 6; i++) {
        put(mid - 11 + i, mid + 2, mid + 5 - Math.floor(i / 2), C.glow);
        put(mid + 11 - i, mid + 2, mid + 5 - Math.floor(i / 2), C.glow);
      }
      cylZ(mid - 4, mid + 2, z0, z0 + 3, 2, C.dark);
      cylZ(mid + 4, mid + 2, z0, z0 + 3, 2, C.dark);
      box(mid - 1, mid + 1, mid + 4, mid + 8, mid - 1, mid + 1, C.metal2);
      sphere(mid, mid + 3, z1, 2.4, C.glow);
    }
    function car() {
      box(mid - 8, mid + 8, 3, 5, mid - 4, mid + 4, C.orange);
      box(mid - 5, mid + 4, 6, 9, mid - 3, mid + 3, C.white);
      box(mid - 4, mid + 3, 7, 9, mid - 3, mid - 3, C.window);
      box(mid - 4, mid + 3, 7, 9, mid + 3, mid + 3, C.window);
      box(mid + 7, mid + 8, 4, 5, mid - 3, mid - 2, C.gold);
      box(mid + 7, mid + 8, 4, 5, mid + 2, mid + 3, C.gold);
      box(mid - 8, mid - 7, 4, 5, mid - 3, mid + 3, C.dark);
      [[-6, -4], [5, -4], [-6, 4], [5, 4]].forEach(function (w) {
        cylX(3, mid + w[1], mid + w[0] - 1, mid + w[0] + 1, 2.2, C.tire);
        put(mid + w[0], 3, mid + w[1], C.metal);
      });
    }
    function tree() {
      box(mid - 8, mid + 8, 0, 0, mid - 8, mid + 8, C.grass);
      cylY(mid, mid, 1, 10, 1.8, C.wood);
      box(mid - 1, mid + 1, 6, 7, mid + 2, mid + 6, C.wood);
      box(mid + 2, mid + 6, 7, 8, mid - 1, mid + 1, C.wood);
      sphere(mid, 13, mid, 5.5, C.leaf);
      sphere(mid - 4, 12, mid + 3, 3.8, C.leaf2);
      sphere(mid + 4, 12, mid - 2, 3.6, C.leaf);
      sphere(mid + 2, 15, mid + 2, 3.2, C.leaf2);
    }
    function mech() {
      box(mid - 3, mid + 3, 9, 15, mid - 2, mid + 2, C.metal);
      box(mid - 2, mid + 2, 12, 14, mid + 2, mid + 3, C.glow);
      box(mid - 2, mid + 2, 16, 19, mid - 2, mid + 2, C.metal2);
      put(mid - 1, 18, mid + 2, C.glow); put(mid + 1, 18, mid + 2, C.glow);
      box(mid - 2, mid - 1, 3, 9, mid - 1, mid + 1, C.metal2);
      box(mid + 1, mid + 2, 3, 9, mid - 1, mid + 1, C.metal2);
      box(mid - 4, mid - 1, 1, 3, mid - 2, mid + 2, C.dark);
      box(mid + 1, mid + 4, 1, 3, mid - 2, mid + 2, C.dark);
      box(mid - 7, mid - 4, 11, 14, mid - 1, mid + 1, C.metal);
      box(mid + 4, mid + 7, 11, 14, mid - 1, mid + 1, C.metal);
      box(mid - 7, mid - 6, 6, 11, mid, mid + 1, C.orange);
      box(mid + 6, mid + 7, 6, 11, mid, mid + 1, C.orange);
    }
    function city() {
      box(0, N - 1, 0, 0, 0, N - 1, C.dark);
      for (let x = 0; x < N; x++) for (let z = 0; z < N; z++)
        if (x % 6 === 0 || z % 6 === 0) put(x, 1, z, '#374151');
      for (let bx = 2; bx < N - 3; bx += 6)
        for (let bz = 2; bz < N - 3; bz += 6) {
          if (bx % 6 === 0 || bz % 6 === 0) continue;
          const h = 4 + (rand() * Math.floor(N * 0.5) | 0);
          const w = 2 + (rand() * 2 | 0);
          shell(bx, bx + w, 1, h, bz, bz + w, rand() > 0.4 ? C.stone2 : '#4B5563');
          for (let y = 3; y < h - 1; y += 2)
            for (let x = bx + 1; x < bx + w; x++) put(x, y, bz, C.window);
          if (h > 10) box(bx + 1, bx + w - 1, h + 1, h + 1, bz + 1, bz + w - 1, C.glow);
        }
    }
    function island() {
      const R = Math.floor(N * 0.34);
      for (let x = mid - R - 2; x <= mid + R + 2; x++)
        for (let z = mid - R - 2; z <= mid + R + 2; z++) {
          const dx = x - mid, dz = z - mid;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R + 2) continue;
          const top = mid + 2 + Math.floor((1 - d / R) * 3);
          const bot = mid - 1 - Math.floor((1 - d / (R + 2)) * 7);
          for (let y = bot; y <= top; y++) {
            const c = y >= top ? (rand() > 0.2 ? C.grass : C.grass2) : (y < mid - 3 ? C.stone2 : C.sand);
            put(x, y, z, c);
          }
        }
      cylY(mid - 3, mid + 2, mid + 3, mid + 9, 1.3, C.wood);
      sphere(mid - 3, mid + 11, mid + 2, 3.4, C.leaf);
      box(mid + 2, mid + 6, mid + 3, mid + 7, mid - 2, mid + 2, C.stone);
      box(mid + 3, mid + 5, mid + 8, mid + 9, mid - 1, mid + 1, C.roof);
    }
    function crystal() {
      const cols = [C.glow, C.purple, C.window];
      sphere(mid, mid, mid, 2.5, C.white);
      for (let i = 0; i < 9; i++) {
        const a = i * 0.7 + rand() * 0.2;
        const len = 7 + rand() * 7;
        const x2 = mid + Math.cos(a) * len;
        const z2 = mid + Math.sin(a) * len;
        const y2 = mid + 3 + rand() * 8;
        const steps = 14;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          sphere(mid + (x2 - mid) * t, mid + (y2 - mid) * t, mid + (z2 - mid) * t, 2.2 * (1 - t * 0.75), cols[i % 3]);
        }
      }
    }
    function knot() {
      const R = N * 0.24;
      for (let a = 0; a < Math.PI * 2; a += 0.06) {
        const x = mid + Math.cos(a) * R;
        const z = mid + Math.sin(a) * R;
        const y = mid + Math.sin(3 * a) * (N * 0.18);
        sphere(x, y, z, 2.1, a % 1 > 0.5 ? C.orange : C.glow);
      }
    }
    function asteroid() {
      const R = Math.floor(N * 0.3);
      for (let x = mid - R; x <= mid + R; x++)
        for (let y = mid - R; y <= mid + R; y++)
          for (let z = mid - R; z <= mid + R; z++) {
            const dx = (x - mid) / R, dy = (y - mid) / (R * 0.85), dz = (z - mid) / R;
            const cr = 0.12 * Math.sin(x * 0.9 + z * 0.7);
            if (dx * dx + dy * dy + dz * dz < 1 - cr)
              put(x, y, z, (x + y + z) % 7 === 0 ? C.metal : C.stone2);
          }
    }
    function waterfall() {
      box(mid - 10, mid + 10, 0, 1, mid - 8, mid + 10, C.stone2);
      box(mid - 8, mid + 8, 2, 12, mid - 3, mid + 6, C.stone);
      for (let y = 3; y <= 13; y++) box(mid - 1, mid + 1, y, y, mid + 6, mid + 8, C.water);
      box(mid - 4, mid + 4, 0, 2, mid + 7, mid + 12, C.water);
      box(mid - 10, mid - 6, 2, 8, mid + 2, mid + 6, C.grass);
      box(mid + 6, mid + 10, 2, 7, mid + 1, mid + 5, C.grass);
      cylY(mid - 8, mid + 4, 8, 12, 1.1, C.wood);
      sphere(mid - 8, 14, mid + 4, 2.8, C.leaf);
    }
    const fn = {
      castle: castle, ruins: castle, spaceship: spaceship, car: car,
      tree: tree, ifs_tree: tree, mech: mech, city: city,
      floating_island: island, crystal: crystal, sponge: crystal,
      knot: knot, asteroid: asteroid, waterfall: waterfall
    }[type] || island;
    fn();
    if (voxels.length > budget) {
      const keep = [];
      const step = Math.ceil(voxels.length / budget);
      for (let i = 0; i < voxels.length; i += step) keep.push(voxels[i]);
      voxels.length = 0;
      Array.prototype.push.apply(voxels, keep.slice(0, budget));
    }
    return {
      gridSize: N,
      currentDrawingAxis: 'y',
      activeDrawingLevel: { x: 0, y: 0, z: 0 },
      voxels: voxels,
      metadata: { type: type, source: 'morph_v3', seed: meta.seed }
    };
  }
  function install() {
    const app = window.VoxelApp;
    if (!app || typeof app.openHubGenerator !== 'function') return false;
    app.generateDeterministicHubProject = function (meta) { return build(meta || {}, this); };
    app.fetchGeneratedHubProjectFromApi = async function (meta) { return build(meta || {}, this); };
    app._morphV2 = true;
    return true;
  }
  const t = setInterval(function () { if (install()) clearInterval(t); }, 150);
  setTimeout(function () { clearInterval(t); install(); }, 8000);
})();
