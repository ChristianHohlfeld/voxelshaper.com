from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
old = """                    } else {
                    for (const key in srcVoxels) {
                        if (Object.prototype.hasOwnProperty.call(srcVoxels, key)) {
                            const coords = String(key).split(',').map(Number);
                            if (coords.length === 3) {
                                const [x, y, z] = coords;
                                pushVoxel(x, y, z, srcVoxels[key]);
                                if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
                                if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
                            }
                        }
                    }

                    const shiftX"""
new = """                    } else {
                    for (const key in srcVoxels) {
                        if (Object.prototype.hasOwnProperty.call(srcVoxels, key)) {
                            const coords = String(key).split(',').map(Number);
                            if (coords.length === 3) {
                                const [x, y, z] = coords;
                                pushVoxel(x, y, z, srcVoxels[key]);
                                if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
                                if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
                            }
                        }
                    }
                    }

                    const shiftX"""
if old not in t:
    raise SystemExit('block not found')
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('brace closed')
