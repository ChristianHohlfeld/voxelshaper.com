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
  function irand(rand, a, b) { return a + ((rand() * (b - a + 1)) | 0); }
  function pick(rand, arr) { return arr[(rand() * arr.length) | 0]; }

  function build(meta, app) {
    const type = String(meta.type || 'castle');
    const rand = mulberry(Number.isFinite(meta.seed) ? meta.seed : ((Math.random() * 1e9) | 0));
    const shape = Number.isFinite(meta.shape) ? meta.shape : 75;
    const N = clamp(Math.round(28 + shape * 0.2 + rand() * 4), 28, 48);
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
    const palettes = [
      { stone: '#9AA3AD', stone2: '#6B7280', roof: '#C0392B', gold: '#F2C14E', dark: '#1F2933', grass: '#3D9A4A', grass2: '#2E7D32', metal: '#B8C4CE', metal2: '#7B8A99', glow: '#5CE1FF', body: '#F4A261', tire: '#111111', wood: '#7A4A24', leaf: '#2F9E44', leaf2: '#1B7A32', water: '#22B8CF', sand: '#D4B483', window: '#7DD3FC', white: '#E8EEF4', accent: '#A78BFA' },
      { stone: '#A89F91', stone2: '#5C5346', roof: '#2C3E50', gold: '#E8C547', dark: '#1B1B1B', grass: '#5B8C2A', grass2: '#3F6B1A', metal: '#C5D0D8', metal2: '#8A9AA8', glow: '#FF6B6B', body: '#4ECDC4', tire: '#111111', wood: '#6B3F24', leaf: '#4C9A2A', leaf2: '#2D6A1E', water: '#3A86FF', sand: '#E2C290', window: '#FFE066', white: '#F4F1DE', accent: '#F72585' },
      { stone: '#8D99AE', stone2: '#2B2D42', roof: '#D90429', gold: '#FFD166', dark: '#0D1B2A', grass: '#80B918', grass2: '#55A630', metal: '#E0E1DD', metal2: '#778DA9', glow: '#00F5D4', body: '#EF476F', tire: '#111111', wood: '#9C6644', leaf: '#70E000', leaf2: '#38B000', water: '#4CC9F0', sand: '#E9C46A', window: '#90E0EF', white: '#EDF2F4', accent: '#7B2CBF' }
    ];
    const C = palettes[(rand() * palettes.length) | 0];

    function castle() {
      const spanX = irand(rand, 10, Math.floor(N * 0.42));
      const spanZ = irand(rand, 10, Math.floor(N * 0.42));
      const ox = irand(rand, -2, 2), oz = irand(rand, -2, 2);
      const x0 = clamp(mid - spanX + ox, 1, N - 8);
      const x1 = clamp(mid + spanX + ox, x0 + 8, N - 2);
      const z0 = clamp(mid - spanZ + oz, 1, N - 8);
      const z1 = clamp(mid + spanZ + oz, z0 + 8, N - 2);
      box(x0 - 1, x1 + 1, 0, 1, z0 - 1, z1 + 1, C.grass);
      box(x0, x1, 2, 3, z0, z1, C.stone2);
      const wallH = irand(rand, 7, 11);
      shell(x0, x1, 3, wallH, z0, z1, C.stone);
      if (rand() > 0.35) {
        const gx = irand(rand, x0 + 3, x1 - 5);
        box(gx, gx + 3, 2, wallH - 2, z1 - 1, z1 + 1, C.dark);
      }
      const tw = irand(rand, 3, 5);
      const towers = [];
      towers.push([x0, z0], [x1 - tw, z0], [x0, z1 - tw], [x1 - tw, z1 - tw]);
      if (rand() > 0.45) towers.push([((x0 + x1) / 2 - tw / 2) | 0, z0]);
      if (rand() > 0.6) towers.push([x0, ((z0 + z1) / 2 - tw / 2) | 0]);
      towers.forEach(function (c) {
        const th = irand(rand, wallH + 3, wallH + 10);
        shell(c[0], c[0] + tw, 2, th, c[1], c[1] + tw, C.stone);
        for (let y = 5; y < th - 1; y += irand(rand, 2, 4)) {
          put(c[0] + 1, y, c[1], C.window);
          put(c[0] + tw - 1, y, c[1] + tw, C.window);
        }
        const roofH = irand(rand, 2, 5);
        box(c[0] - 1, c[0] + tw + 1, th + 1, th + 1, c[1] - 1, c[1] + tw + 1, C.roof);
        box(c[0], c[0] + tw, th + 2, th + roofH, c[1], c[1] + tw, C.roof);
        if (rand() > 0.4) put(((c[0] + c[0] + tw) / 2) | 0, th + roofH + 1, ((c[1] + c[1] + tw) / 2) | 0, C.gold);
      });
      if (rand() > 0.3) {
        const ks = irand(rand, 3, 5);
        shell(mid - ks + ox, mid + ks + ox, 3, irand(rand, 11, 16), mid - ks + oz, mid + ks + oz, C.stone);
        box(mid - ks + ox + 1, mid + ks + ox - 1, 14, 16, mid - ks + oz + 1, mid + ks + oz - 1, C.roof);
      }
      if (rand() > 0.5) {
        cylY(irand(rand, x0 + 3, x1 - 3), irand(rand, z0 + 3, z1 - 3), 4, 8, 1.1, C.wood);
        sphere(x0 + 4, 10, z0 + 4, 2.4, C.leaf);
      }
    }

    function spaceship() {
      const len = irand(rand, Math.floor(N * 0.5), Math.floor(N * 0.78));
      const z0 = clamp(mid - (len / 2 | 0), 1, N - 8);
      const z1 = clamp(z0 + len, z0 + 8, N - 2);
      const bodyR = 2.4 + rand() * 1.8;
      const nose = rand();
      for (let z = z0; z <= z1; z++) {
        const t = (z - z0) / Math.max(1, z1 - z0);
        let r = bodyR;
        if (t < 0.2) r = 1 + t * bodyR * 5;
        if (t > 0.8) r = bodyR * (1 - (t - 0.8) * 2.2);
        cylZ(mid, mid + 3, z, z, Math.max(1.2, r), t > 0.88 ? C.glow : C.metal);
      }
      const wing = pick(rand, ['delta', 'straight', 'dual']);
      const wspan = irand(rand, 7, 12);
      if (wing === 'delta') {
        for (let i = 0; i < wspan; i++) {
          box(mid - 3 - i, mid - 3, mid + 2, mid + 3, mid - 1 + (i / 3 | 0), mid + 3, C.metal2);
          box(mid + 3, mid + 3 + i, mid + 2, mid + 3, mid - 1 + (i / 3 | 0), mid + 3, C.metal2);
        }
      } else if (wing === 'straight') {
        box(mid - wspan, mid - 4, mid + 2, mid + 3, mid - 1, mid + 3, C.metal2);
        box(mid + 4, mid + wspan, mid + 2, mid + 3, mid - 1, mid + 3, C.metal2);
      } else {
        box(mid - wspan, mid - 4, mid + 2, mid + 3, mid - 3, mid, C.metal2);
        box(mid + 4, mid + wspan, mid + 2, mid + 3, mid - 3, mid, C.metal2);
        box(mid - wspan + 2, mid - 4, mid + 2, mid + 3, mid + 2, mid + 5, C.metal2);
        box(mid + 4, mid + wspan - 2, mid + 2, mid + 3, mid + 2, mid + 5, C.metal2);
      }
      const engines = irand(rand, 2, 4);
      for (let e = 0; e < engines; e++) {
        const ex = mid - 3 + e * 2;
        cylZ(ex, mid + 2, z0, z0 + 2, 1.6, C.dark);
        put(ex, mid + 2, z0, C.glow);
      }
      if (rand() > 0.4) box(mid, mid, mid + 4, mid + irand(rand, 6, 9), mid - 1, mid + 1, C.metal2);
      sphere(mid, mid + 3, z1, 2 + rand(), C.glow);
    }

    function car() {
      const L = irand(rand, 6, 10), W = irand(rand, 3, 5), H = irand(rand, 2, 3);
      const body = pick(rand, [C.body, C.accent, C.metal, C.roof]);
      box(mid - L, mid + L, 3, 3 + H, mid - W, mid + W, body);
      box(mid - L + 3, mid + L - 2, 4 + H, 6 + H, mid - W + 1, mid + W - 1, C.white);
      box(mid - L + 4, mid + L - 3, 5 + H, 6 + H, mid - W + 1, mid - W + 1, C.window);
      box(mid - L + 4, mid + L - 3, 5 + H, 6 + H, mid + W - 1, mid + W - 1, C.window);
      box(mid + L - 1, mid + L, 4, 5, mid - W + 1, mid - W + 2, C.gold);
      box(mid + L - 1, mid + L, 4, 5, mid + W - 2, mid + W - 1, C.gold);
      [[-L + 2, -W], [L - 3, -W], [-L + 2, W], [L - 3, W]].forEach(function (w) {
        cylX(3, mid + w[1], mid + w[0] - 1, mid + w[0] + 1, 2 + rand(), C.tire);
      });
    }

    function tree() {
      box(mid - 8, mid + 8, 0, 0, mid - 8, mid + 8, pick(rand, [C.grass, C.sand]));
      const trunks = irand(rand, 1, 3);
      for (let i = 0; i < trunks; i++) {
        const tx = mid + irand(rand, -4, 4), tz = mid + irand(rand, -4, 4);
        const h = irand(rand, 7, 13);
        cylY(tx, tz, 1, h, 1.2 + rand(), C.wood);
        const blobs = irand(rand, 2, 5);
        for (let b = 0; b < blobs; b++) {
          sphere(tx + irand(rand, -3, 3), h + irand(rand, 1, 5), tz + irand(rand, -3, 3), 2.5 + rand() * 2.5, pick(rand, [C.leaf, C.leaf2]));
        }
      }
    }

    function mech() {
      const tall = irand(rand, 13, 18);
      box(mid - 3, mid + 3, tall - 7, tall - 1, mid - 2, mid + 2, C.metal);
      box(mid - 2, mid + 2, tall, tall + 3, mid - 2, mid + 2, C.metal2);
      put(mid - 1, tall + 2, mid + 2, C.glow); put(mid + 1, tall + 2, mid + 2, C.glow);
      box(mid - 2, mid - 1, 3, tall - 7, mid - 1, mid + 1, C.metal2);
      box(mid + 1, mid + 2, 3, tall - 7, mid - 1, mid + 1, C.metal2);
      box(mid - 4, mid - 1, 1, 3, mid - 2, mid + 2, C.dark);
      box(mid + 1, mid + 4, 1, 3, mid - 2, mid + 2, C.dark);
      const arm = irand(rand, 4, 8);
      box(mid - arm, mid - 4, tall - 6, tall - 3, mid - 1, mid + 1, C.metal);
      box(mid + 4, mid + arm, tall - 6, tall - 3, mid - 1, mid + 1, C.metal);
      box(mid - arm, mid - arm + 1, tall - 10, tall - 3, mid, mid + 1, C.body);
      box(mid + arm - 1, mid + arm, tall - 10, tall - 3, mid, mid + 1, C.body);
      if (rand() > 0.5) box(mid - 2, mid + 2, tall - 5, tall - 4, mid + 2, mid + 3, C.glow);
    }

    function city() {
      box(0, N - 1, 0, 0, 0, N - 1, C.dark);
      const street = irand(rand, 5, 7);
      for (let x = 0; x < N; x++) for (let z = 0; z < N; z++)
        if (x % street === 0 || z % street === 0) put(x, 1, z, '#374151');
      for (let bx = 2; bx < N - 3; bx += street)
        for (let bz = 2; bz < N - 3; bz += street) {
          if (rand() < 0.12) {
            box(bx, bx + 2, 1, 1, bz, bz + 2, C.grass);
            continue;
          }
          const h = irand(rand, 3, Math.max(6, (N * 0.45) | 0));
          const w = irand(rand, 2, Math.min(4, street - 2));
          const col = pick(rand, [C.stone2, C.metal2, '#4B5563', C.stone]);
          shell(bx, bx + w, 1, h, bz, bz + w, col);
          for (let y = 3; y < h - 1; y += 2)
            for (let x = bx + 1; x < bx + w; x++) if (rand() > 0.25) put(x, y, bz, C.window);
          if (h > 9 && rand() > 0.4) box(bx + 1, bx + w - 1, h + 1, h + 1, bz + 1, bz + w - 1, C.glow);
        }
    }

    function island() {
      const R = irand(rand, Math.floor(N * 0.26), Math.floor(N * 0.36));
      const stretch = 0.7 + rand() * 0.5;
      for (let x = mid - R - 2; x <= mid + R + 2; x++)
        for (let z = mid - R - 2; z <= mid + R + 2; z++) {
          const dx = x - mid, dz = (z - mid) / stretch;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R + 2) continue;
          const jag = Math.sin((x * 0.4) + rand()) * 1.2;
          const top = mid + 1 + Math.floor((1 - d / R) * 3 + jag);
          const bot = mid - 1 - Math.floor((1 - d / (R + 2)) * (5 + rand() * 4));
          for (let y = bot; y <= top; y++) {
            put(x, y, z, y >= top ? pick(rand, [C.grass, C.grass2]) : (y < mid - 3 ? C.stone2 : C.sand));
          }
        }
      if (rand() > 0.3) {
        const tx = mid + irand(rand, -4, 4), tz = mid + irand(rand, -4, 4);
        cylY(tx, tz, mid + 2, mid + irand(rand, 7, 11), 1.2, C.wood);
        sphere(tx, mid + 11, tz, 3 + rand() * 2, C.leaf);
      }
      if (rand() > 0.45) {
        const sx = mid + irand(rand, -5, 5);
        box(sx, sx + 3, mid + 2, mid + 6, mid - 2, mid + 1, C.stone);
        box(sx + 1, sx + 2, mid + 7, mid + 8, mid - 1, mid, C.roof);
      }
    }

    function crystal() {
      const cols = [C.glow, C.accent, C.window, C.gold];
      sphere(mid, mid, mid, 2 + rand(), C.white);
      const spikes = irand(rand, 6, 12);
      for (let i = 0; i < spikes; i++) {
        const a = i * (Math.PI * 2 / spikes) + rand() * 0.4;
        const tilt = (rand() - 0.5) * 1.2;
        const len = 6 + rand() * 9;
        const x2 = mid + Math.cos(a) * len;
        const z2 = mid + Math.sin(a) * len;
        const y2 = mid + tilt * len + rand() * 4;
        const steps = 12 + (rand() * 6 | 0);
        const col = cols[i % cols.length];
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          sphere(mid + (x2 - mid) * t, mid + (y2 - mid) * t, mid + (z2 - mid) * t, (2.4 - t * 1.8) * (0.7 + rand() * 0.3), col);
        }
      }
    }

    function knot() {
      const R = N * (0.18 + rand() * 0.12);
      const loops = irand(rand, 2, 4);
      for (let a = 0; a < Math.PI * 2; a += 0.05 + rand() * 0.02) {
        const x = mid + Math.cos(a) * R;
        const z = mid + Math.sin(a) * R;
        const y = mid + Math.sin(loops * a) * (N * (0.12 + rand() * 0.1));
        sphere(x, y, z, 1.8 + rand() * 0.6, a % 1 > 0.5 ? C.body : C.glow);
      }
    }

    function asteroid() {
      const R = irand(rand, Math.floor(N * 0.22), Math.floor(N * 0.32));
      const sx = 0.8 + rand() * 0.5, sy = 0.7 + rand() * 0.5, sz = 0.8 + rand() * 0.5;
      for (let x = mid - R; x <= mid + R; x++)
        for (let y = mid - R; y <= mid + R; y++)
          for (let z = mid - R; z <= mid + R; z++) {
            const dx = (x - mid) / (R * sx), dy = (y - mid) / (R * sy), dz = (z - mid) / (R * sz);
            const cr = 0.16 * Math.sin(x * 0.7 + z * 0.5 + rand());
            if (dx * dx + dy * dy + dz * dz < 1 - cr)
              put(x, y, z, (x + y + z) % 7 === 0 ? C.metal : C.stone2);
          }
    }

    function waterfall() {
      const w = irand(rand, 6, 10);
      box(mid - w - 2, mid + w + 2, 0, 1, mid - 8, mid + 10, C.stone2);
      box(mid - w, mid + w, 2, irand(rand, 9, 14), mid - 3, mid + 6, C.stone);
      const fallX = irand(rand, -2, 2);
      for (let y = 3; y <= 13; y++) box(mid + fallX - 1, mid + fallX + 1, y, y, mid + 6, mid + 8, C.water);
      box(mid - 4, mid + 4, 0, 2, mid + 7, mid + 12, C.water);
      if (rand() > 0.3) {
        box(mid - w, mid - w + 3, 2, 8, mid + 2, mid + 6, C.grass);
        cylY(mid - w + 1, mid + 4, 8, 12, 1.1, C.wood);
        sphere(mid - w + 1, 14, mid + 4, 2.6 + rand(), C.leaf);
      }
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
      metadata: { type: type, source: 'morph_v4', seed: meta.seed }
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
