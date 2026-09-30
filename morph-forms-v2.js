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
    const rand = mulberry(Number.isFinite(meta.seed) ? meta.seed : 1);
    const shape = Number.isFinite(meta.shape) ? meta.shape : 70;
    const N = clamp(Math.round(22 + shape * 0.22), 22, app && app.GENERATOR_MAX_GRID ? app.GENERATOR_MAX_GRID : 40);
    const budget = (app && app.isMobile) ? 2800 : 5200;
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
    function sphere(cx, cy, cz, r, color) {
      const r2 = r * r;
      for (let x = Math.floor(cx - r); x <= cx + r; x++)
        for (let y = Math.floor(cy - r); y <= cy + r; y++)
          for (let z = Math.floor(cz - r); z <= cz + r; z++) {
            const dx = x - cx, dy = y - cy, dz = z - cz;
            if (dx * dx + dy * dy + dz * dz <= r2) put(x, y, z, color);
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
    function cylY(cx, cz, y0, y1, r, color) {
      const r2 = r * r;
      for (let y = y0; y <= y1; y++)
        for (let x = Math.floor(cx - r); x <= cx + r; x++)
          for (let z = Math.floor(cz - r); z <= cz + r; z++) {
            const dx = x - cx, dz = z - cz;
            if (dx * dx + dz * dz <= r2) put(x, y, z, color);
          }
    }

    const mid = (N / 2) | 0;
    const stone = '#8B939C', roof = '#B23A3A', dark = '#2D3436', grass = '#4CAF50';
    const metal = '#95A3B3', glow = '#58E1FF', accent = '#F4A261', tire = '#1A1A1A';
    const wood = '#8B5A2B', leaf = '#2E8B3A', water = '#00B4D8', sand = '#C2B280';

    function castle() {
      const base = Math.max(10, Math.floor(N * 0.42));
      const x0 = mid - base, x1 = mid + base, z0 = mid - base, z1 = mid + base;
      box(x0, x1, 0, 1, z0, z1, stone);
      box(x0 + 2, x1 - 2, 2, 6, z0 + 2, z1 - 2, stone);
      const tw = Math.max(3, Math.floor(N * 0.08));
      const th = 12 + (rand() * 5 | 0);
      const corners = [[x0, z0], [x1 - tw, z0], [x0, z1 - tw], [x1 - tw, z1 - tw]];
      corners.forEach(function (c) {
        box(c[0], c[0] + tw, 2, th, c[1], c[1] + tw, stone);
        box(c[0] - 1, c[0] + tw + 1, th + 1, th + 1, c[1] - 1, c[1] + tw + 1, roof);
        box(c[0], c[0] + tw, th + 2, th + 4, c[1], c[1] + tw, roof);
        put(((c[0] + c[0] + tw) / 2) | 0, th + 5, ((c[1] + c[1] + tw) / 2) | 0, '#F2C14E');
      });
      box(x0, x1, 7, 8, z0, z0 + 1, stone);
      box(x0, x1, 7, 8, z1 - 1, z1, stone);
      box(x0, x0 + 1, 7, 8, z0, z1, stone);
      box(x1 - 1, x1, 7, 8, z0, z1, stone);
      for (let x = x0; x <= x1; x += 2) { put(x, 9, z0, stone); put(x, 9, z1, stone); }
      for (let z = z0; z <= z1; z += 2) { put(x0, 9, z, stone); put(x1, 9, z, stone); }
      const gx = mid - 2;
      box(gx, gx + 4, 2, 5, z1 - 2, z1, dark);
      box(mid - 3, mid + 3, 2, 10, mid - 3, mid + 3, stone);
      box(mid - 2, mid + 2, 11, 13, mid - 2, mid + 2, roof);
    }

    function spaceship() {
      const len = Math.floor(N * 0.72);
      const z0 = mid - (len / 2 | 0);
      const z1 = z0 + len;
      cylZ(mid, mid + 2, z0 + 2, z1 - 2, 3, metal);
      sphere(mid, mid + 2, z1 - 1, 3, glow);
      sphere(mid, mid + 2, z0 + 2, 2, metal);
      box(mid - 8, mid + 8, mid + 1, mid + 2, mid - 1, mid + 3, metal);
      box(mid - 10, mid - 7, mid + 1, mid + 1, mid, mid + 2, glow);
      box(mid + 7, mid + 10, mid + 1, mid + 1, mid, mid + 2, glow);
      cylZ(mid - 3, mid + 1, z0, z0 + 3, 2, dark);
      cylZ(mid + 3, mid + 1, z0, z0 + 3, 2, dark);
      box(mid, mid, mid + 3, mid + 6, mid - 2, mid + 2, metal);
    }

    function car() {
      box(mid - 7, mid + 7, 2, 4, mid - 4, mid + 4, accent);
      box(mid - 4, mid + 3, 5, 8, mid - 3, mid + 3, '#E9ECEF');
      box(mid - 3, mid + 2, 6, 8, mid - 2, mid + 2, glow);
      [[-5, -4], [5, -4], [-5, 4], [5, 4]].forEach(function (w) {
        cylZ(mid + w[0], 2, mid + w[1] - 1, mid + w[1] + 1, 2, tire);
      });
      box(mid + 6, mid + 7, 3, 4, mid - 3, mid - 2, '#F9DC5C');
      box(mid + 6, mid + 7, 3, 4, mid + 2, mid + 3, '#F9DC5C');
    }

    function tree() {
      const h = 8 + (rand() * 6 | 0);
      cylY(mid, mid, 0, h, 1.6, wood);
      sphere(mid, h + 3, mid, 5, leaf);
      sphere(mid - 3, h + 2, mid + 2, 3.5, '#3CB371');
      sphere(mid + 3, h + 1, mid - 2, 3.2, '#228B22');
      box(mid - 6, mid + 6, 0, 0, mid - 6, mid + 6, grass);
    }

    function mech() {
      box(mid - 3, mid + 3, 8, 14, mid - 2, mid + 2, metal);
      box(mid - 2, mid + 2, 15, 18, mid - 2, mid + 2, metal);
      put(mid - 1, 17, mid + 2, glow); put(mid + 1, 17, mid + 2, glow);
      box(mid - 2, mid - 1, 2, 8, mid - 1, mid + 1, dark);
      box(mid + 1, mid + 2, 2, 8, mid - 1, mid + 1, dark);
      box(mid - 3, mid - 2, 0, 2, mid - 2, mid + 2, metal);
      box(mid + 2, mid + 3, 0, 2, mid - 2, mid + 2, metal);
      box(mid - 6, mid - 4, 10, 13, mid - 1, mid + 1, metal);
      box(mid + 4, mid + 6, 10, 13, mid - 1, mid + 1, metal);
      box(mid - 6, mid - 5, 6, 10, mid, mid, accent);
      box(mid + 5, mid + 6, 6, 10, mid, mid, accent);
    }

    function city() {
      box(0, N - 1, 0, 0, 0, N - 1, dark);
      const cell = 5;
      for (let bx = 1; bx < N - 2; bx += cell) {
        for (let bz = 1; bz < N - 2; bz += cell) {
          if ((bx / cell | 0) % 3 === 1 || (bz / cell | 0) % 3 === 1) continue;
          const h = 3 + (rand() * (N * 0.45) | 0);
          const w = 2 + (rand() * 2 | 0);
          box(bx, bx + w, 1, h, bz, bz + w, rand() > 0.5 ? '#4A5568' : '#718096');
          if (h > 8) box(bx + 1, bx + w - 1, h + 1, h + 2, bz + 1, bz + w - 1, glow);
        }
      }
    }

    function island() {
      const R = Math.floor(N * 0.32);
      for (let x = mid - R - 2; x <= mid + R + 2; x++)
        for (let z = mid - R - 2; z <= mid + R + 2; z++) {
          const dx = x - mid, dz = z - mid;
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d > R + 1) continue;
          const top = mid + Math.floor((1 - d / R) * 3);
          const bot = mid - 2 - Math.floor((1 - d / (R + 1)) * 5);
          for (let y = bot; y <= top; y++) put(x, y, z, y >= top - 1 ? grass : sand);
        }
      cylY(mid, mid, mid + 1, mid + 7, 1.2, wood);
      sphere(mid, mid + 9, mid, 3.5, leaf);
    }

    function crystal() {
      sphere(mid, mid, mid, 3, glow);
      for (let i = 0; i < 7; i++) {
        const ang = i * 0.9 + rand();
        const x2 = mid + Math.cos(ang) * 6;
        const z2 = mid + Math.sin(ang) * 6;
        const y2 = mid + 4 + rand() * 6;
        const steps = 10;
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          sphere(mid + (x2 - mid) * t, mid + (y2 - mid) * t, mid + (z2 - mid) * t, 2 - t, i % 2 ? glow : '#A78BFA');
        }
      }
    }

    function knot() {
      const R = N * 0.22, r = 2.2;
      for (let a = 0; a < Math.PI * 2; a += 0.08) {
        const x = mid + Math.cos(a) * R;
        const z = mid + Math.sin(a) * R;
        const y = mid + Math.sin(a * 2) * (N * 0.16);
        sphere(x, y, z, r, a < Math.PI ? accent : glow);
      }
    }

    function asteroid() {
      const R = Math.floor(N * 0.28);
      for (let x = mid - R; x <= mid + R; x++)
        for (let y = mid - R; y <= mid + R; y++)
          for (let z = mid - R; z <= mid + R; z++) {
            const dx = x - mid, dy = y - mid, dz = z - mid;
            const n = (rand() * 0.35);
            if (dx * dx + dy * dy + dz * dz < (R - n * R) * (R - n * R)) put(x, y, z, rand() > 0.85 ? '#A0AEC0' : '#4A5568');
          }
    }

    function waterfall() {
      box(mid - 8, mid + 8, 0, 2, mid - 8, mid + 8, stone);
      box(mid - 6, mid + 6, 3, 10, mid - 2, mid + 8, stone);
      box(mid - 2, mid + 2, 4, 12, mid + 6, mid + 8, water);
      box(mid - 3, mid + 3, 0, 3, mid + 7, mid + 10, water);
      box(mid - 8, mid - 5, 3, 8, mid + 2, mid + 6, grass);
      box(mid + 5, mid + 8, 3, 7, mid + 1, mid + 5, grass);
    }

    const fn = {
      castle: castle, spaceship: spaceship, car: car, tree: tree, ifs_tree: tree,
      mech: mech, city: city, floating_island: island, crystal: crystal,
      knot: knot, asteroid: asteroid, waterfall: waterfall, ruins: castle, sponge: crystal
    }[type] || island;
    fn();
    if (voxels.length > budget) {
      const keep = voxels.filter(function (_, i) { return i % Math.ceil(voxels.length / budget) === 0; });
      voxels.length = 0;
      Array.prototype.push.apply(voxels, keep.slice(0, budget));
    }
    return { gridSize: N, currentDrawingAxis: 'y', activeDrawingLevel: { x: 0, y: 0, z: 0 }, voxels: voxels, metadata: { type: type, source: 'morph_v2' } };
  }

  function install() {
    const app = window.VoxelApp;
    if (!app || typeof app.openHubGenerator !== 'function' || app._morphV2) return !!app && !!app._morphV2;
    app._morphV2 = true;
    app.generateDeterministicHubProject = function (meta) { return build(meta || {}, this); };
    app.fetchGeneratedHubProjectFromApi = async function (meta) { return build(meta || {}, this); };
    return true;
  }
  const t = setInterval(function () { if (install()) clearInterval(t); }, 150);
  setTimeout(function () { clearInterval(t); install(); }, 8000);
})();
