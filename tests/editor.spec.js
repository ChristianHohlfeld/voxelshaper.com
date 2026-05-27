const { test, expect } = require('@playwright/test');

test.describe('VoxelShaper Editor', () => {
  test.beforeEach(async ({ page }) => {
    // Load the local index.html directly
    await page.goto('file://' + require('path').resolve(__dirname, '../index.html'));
    
    // Wait for the app to initialize (canvas should be present)
    await page.waitForSelector('#voxel-canvas');
    
    // Ensure we are in FREE mode for placing blocks
    await page.evaluate(() => {
        window.VoxelApp.setModeExplicit('FREE');
    });
  });

  test('Placing a voxel on the foundation', async ({ page }) => {
    // Get initial voxel count
    const initialVoxels = await page.evaluate(() => window.VoxelApp.voxels.size);
    
    // Click in the middle of the screen (on the foundation)
    await page.mouse.click(page.viewportSize().width / 2, page.viewportSize().height / 2);
    
    // Get new voxel count
    const newVoxels = await page.evaluate(() => window.VoxelApp.voxels.size);
    expect(newVoxels).toBe(initialVoxels + 1);
  });

  test('Dragging to place multiple voxels (InstancedMesh update test)', async ({ page }) => {
    // Simulate a drag across the screen
    const width = page.viewportSize().width;
    const height = page.viewportSize().height;
    
    await page.mouse.move(width / 2 - 100, height / 2);
    await page.mouse.down();
    
    // Drag slowly across to trigger drawVoxelLinePaced and InstancedMesh updates
    for (let i = 0; i <= 10; i++) {
        await page.mouse.move(width / 2 - 100 + (i * 20), height / 2, { steps: 2 });
        await page.waitForTimeout(20);
    }
    
    await page.mouse.up();
    
    // Verify that multiple voxels were placed and not skipped
    const voxelCount = await page.evaluate(() => window.VoxelApp.voxels.size);
    expect(voxelCount).toBeGreaterThan(5);
    
    // Verify that bounding sphere was updated
    const sphereUpdated = await page.evaluate(() => {
        return window.VoxelApp.solidInstancedMesh.boundingSphere.radius > 0;
    });
    expect(sphereUpdated).toBe(true);
  });

  test('Deleting a voxel updates the InstancedMesh', async ({ page }) => {
    const width = page.viewportSize().width;
    const height = page.viewportSize().height;
    
    // Place a voxel
    await page.mouse.click(width / 2, height / 2);
    const voxelCount = await page.evaluate(() => window.VoxelApp.voxels.size);
    expect(voxelCount).toBe(1);
    
    // Switch to DELETE mode
    await page.evaluate(() => {
        window.VoxelApp.setModeExplicit('DELETE');
    });
    
    // Click the same spot
    await page.mouse.click(width / 2, height / 2);
    
    // Verify it was deleted
    const finalCount = await page.evaluate(() => window.VoxelApp.voxels.size);
    expect(finalCount).toBe(0);
  });

  test('Bulk load and scene rebuild (ReferenceError test)', async ({ page }) => {
    const success = await page.evaluate(() => {
      try {
        // Mock data similar to Hub import
        const mockData = {
          format: "VOXELSHAPER_V1",
          voxels: {
            "20:10:20": { color: "#ff0000", glass: false },
            "21:10:20": { color: "#00ff00", glass: true }
          }
        };
        window.VoxelApp.loadFromData(mockData);
        // If rebuildSceneFromVoxels threw a ReferenceError (e.g., packedKey is not defined),
        // it would fail before this point.
        return window.VoxelApp.voxels.size === 2;
      } catch (e) {
        return false;
      }
    });
    
    expect(success).toBe(true);
  });
});
