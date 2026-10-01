import { test, expect } from '@playwright/test';

const BASE = process.env.VS_TEST_BASE_URL || 'http://127.0.0.1:4173';

async function ready(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.VoxelApp &&
    window.VoxelHistory?.installed === true &&
    window.VoxelApp?._morphProceduralV5 === true,
    null,
    { timeout: 20000 }
  );
}

function stableProject(project) {
  return JSON.stringify({
    gridSize: project.gridSize,
    metadata: project.metadata,
    voxels: project.voxels
  });
}

test.describe('deterministic history + procedural morph', () => {
  test('same seed and parameters produce exactly the same procedural model', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      const app = window.VoxelApp;
      const meta = { type:'spaceship', seed:424242, shape:58, color:71, palette:'void', gridSize:48, detail:76, mutation:0 };
      const a = app.generateDeterministicHubProject(meta);
      const b = app.generateDeterministicHubProject(meta);
      return {
        a,
        b,
        same: JSON.stringify(a) === JSON.stringify(b)
      };
    });
    expect(result.same).toBe(true);
    expect(result.a.voxels.length).toBeGreaterThan(100);
    expect(result.a.metadata.engineVersion).toBe('5.0.0-procedural');
    expect(result.a.metadata.deterministic).toBe(true);
  });

  test('shape morph changes form while preserving seed identity', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      const app = window.VoxelApp;
      const base = { type:'spaceship', seed:987654, color:62, palette:'atlas', gridSize:50, detail:70, mutation:0 };
      const a = app.generateDeterministicHubProject({ ...base, shape:35 });
      const b = app.generateDeterministicHubProject({ ...base, shape:68 });
      const A = new Set(a.voxels.map(v => `${v.x},${v.y},${v.z}`));
      const B = new Set(b.voxels.map(v => `${v.x},${v.y},${v.z}`));
      let overlap = 0;
      for (const k of A) if (B.has(k)) overlap++;
      return {
        same: JSON.stringify(a.voxels) === JSON.stringify(b.voxels),
        overlapRatio: overlap / Math.max(1, Math.min(A.size, B.size)),
        aMeta: a.metadata,
        bMeta: b.metadata
      };
    });
    expect(result.same).toBe(false);
    expect(result.overlapRatio).toBeGreaterThan(0.15);
    expect(result.overlapRatio).toBeLessThan(0.98);
    expect(result.aMeta.seed).toBe(result.bMeta.seed);
    expect(result.aMeta.type).toBe(result.bMeta.type);
    expect(result.aMeta.palette).toBe(result.bMeta.palette);
  });

  test('different seeds produce different DNA deterministically', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      const app = window.VoxelApp;
      const base = { type:'mech', shape:60, color:55, palette:'auto', gridSize:48, detail:72, mutation:0 };
      const a = app.generateDeterministicHubProject({ ...base, seed:1111 });
      const b = app.generateDeterministicHubProject({ ...base, seed:2222 });
      return {
        same: JSON.stringify(a.voxels) === JSON.stringify(b.voxels),
        aCount: a.voxels.length,
        bCount: b.voxels.length
      };
    });
    expect(result.same).toBe(false);
    expect(result.aCount).toBeGreaterThan(50);
    expect(result.bCount).toBeGreaterThan(50);
  });

  test('MODIFY undo redo is exact and edit-after-undo truncates redo branch', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      const app = window.VoxelApp;
      app.history = [];
      app.historyPointer = -1;
      app.voxels.clear();
      app.updateInstancedVoxels?.();

      const k1 = app.key(2,2,2);
      const k2 = app.key(3,2,2);
      const k3 = app.key(4,2,2);

      app.voxels.set(k1, { color:'#ff0000', glass:false });
      app.addInstancedVoxel?.(k1,2,2,2,'#ff0000',false);
      app.addHistoryStep({ type:'MODIFY', changes:new Map([[k1,{before:null,after:{color:'#ff0000',glass:false}}]]) });

      app.voxels.set(k2, { color:'#00ff00', glass:true });
      app.addInstancedVoxel?.(k2,3,2,2,'#00ff00',true);
      app.addHistoryStep({ type:'MODIFY', changes:new Map([[k2,{before:null,after:{color:'#00ff00',glass:true}}]]) });

      const state0 = { p:app.historyPointer, n:app.history.length, k1:app.voxels.get(k1), k2:app.voxels.get(k2) };
      app.undo();
      const state1 = { p:app.historyPointer, n:app.history.length, has2:app.voxels.has(k2) };
      app.redo();
      const state2 = { p:app.historyPointer, n:app.history.length, k2:app.voxels.get(k2) };
      app.undo();

      app.voxels.set(k3, { color:'#0000ff', glass:false });
      app.addInstancedVoxel?.(k3,4,2,2,'#0000ff',false);
      app.addHistoryStep({ type:'MODIFY', changes:new Map([[k3,{before:null,after:{color:'#0000ff',glass:false}}]]) });
      const beforeRedo = { p:app.historyPointer, n:app.history.length, canRedo:window.VoxelHistory.state.canRedo };
      const redoResult = app.redo();
      const final = {
        p:app.historyPointer,
        n:app.history.length,
        redoResult,
        has1:app.voxels.has(k1),
        has2:app.voxels.has(k2),
        has3:app.voxels.has(k3),
        k3:app.voxels.get(k3)
      };
      return { state0,state1,state2,beforeRedo,final };
    });

    expect(result.state0.p).toBe(1);
    expect(result.state0.n).toBe(2);
    expect(result.state1.p).toBe(0);
    expect(result.state1.has2).toBe(false);
    expect(result.state2.p).toBe(1);
    expect(result.state2.k2.glass).toBe(true);
    expect(result.beforeRedo.n).toBe(2);
    expect(result.beforeRedo.canRedo).toBe(false);
    expect(result.final.redoResult).toBe(false);
    expect(result.final.has1).toBe(true);
    expect(result.final.has2).toBe(false);
    expect(result.final.has3).toBe(true);
    expect(result.final.k3.color.toLowerCase()).toBe('#0000ff');
  });

  test('MORPH is one atomic undo redo transaction', async ({ page }) => {
    await ready(page);
    const result = await page.evaluate(() => {
      const app = window.VoxelApp;
      app.history = [];
      app.historyPointer = -1;
      const before = app.generateDeterministicHubProject({ type:'crystal', seed:71, shape:35, color:40, gridSize:40, detail:55 });
      const after = app.generateDeterministicHubProject({ type:'crystal', seed:71, shape:78, color:40, gridSize:40, detail:80 });
      app.loadFromData(before, { preserveHistory:true });
      app.loadFromData(after, { preserveHistory:true });
      app.addHistoryStep({ type:'MORPH', before, after, meta:after.metadata });
      const afterCount = app.voxels.size;
      app.undo();
      const undoCount = app.voxels.size;
      const undoPointer = app.historyPointer;
      app.redo();
      const redoCount = app.voxels.size;
      return {
        beforeCount: before.voxels.length,
        afterCount,
        undoCount,
        redoCount,
        undoPointer,
        finalPointer: app.historyPointer,
        historyLength: app.history.length
      };
    });
    expect(result.historyLength).toBe(1);
    expect(result.undoPointer).toBe(-1);
    expect(result.finalPointer).toBe(0);
    expect(result.undoCount).toBe(result.beforeCount);
    expect(result.redoCount).toBe(result.afterCount);
    expect(result.afterCount).not.toBe(result.beforeCount);
  });
});
