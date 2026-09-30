from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

a = '''                const color = new THREE.Color(colorStr);
                mesh.setColorAt(index, color);'''
b = '''                const color = new THREE.Color(colorStr);
                if (typeof color.convertSRGBToLinear === 'function') color.convertSRGBToLinear();
                mesh.setColorAt(index, color);'''
if a in t:
    t = t.replace(a, b, 1)
    print('addInstancedVoxel')
elif 'convertSRGBToLinear' in t[t.find('addInstancedVoxel'):t.find('addInstancedVoxel')+500]:
    print('addInstancedVoxel already')
else:
    raise SystemExit('addInstancedVoxel missing')

a = '''                    const color = new THREE.Color(newColorStr);
                    mesh.setColorAt(info.index, color);'''
b = '''                    const color = new THREE.Color(newColorStr);
                    if (typeof color.convertSRGBToLinear === 'function') color.convertSRGBToLinear();
                    mesh.setColorAt(info.index, color);'''
if a in t:
    t = t.replace(a, b, 1)
    print('updateInstancedVoxelColor')
else:
    print('update color skip')

old = '''                    const mat = new THREE.MeshStandardMaterial({
                        color: color,
                        roughness: isGlass ? 0.14 : profile.roughness,
                        metalness: isGlass ? 0.18 : profile.metalness,
                        transparent: isGlass,
                        opacity: isGlass ? 0.48 : 1,
                        depthWrite: !isGlass,
                        envMapIntensity: isGlass ? 1.15 : profile.envMapIntensity
                    });'''
new = '''                    const mat = new THREE.MeshStandardMaterial({
                        color: color,
                        roughness: isGlass ? 0.14 : profile.roughness,
                        metalness: isGlass ? 0.18 : profile.metalness,
                        transparent: isGlass,
                        opacity: isGlass ? 0.48 : 1,
                        depthWrite: !isGlass,
                        envMapIntensity: isGlass ? 1.15 : profile.envMapIntensity
                    });
                    if (mat.color && typeof mat.color.convertSRGBToLinear === 'function') mat.color.convertSRGBToLinear();'''
if old in t:
    t = t.replace(old, new, 1)
    print('getMaterial')
elif 'mat.color.convertSRGBToLinear' in t:
    print('getMaterial already')
else:
    print('getMaterial skip')

p.write_text(t, encoding='utf-8')
print('editor srgb linear ok')
