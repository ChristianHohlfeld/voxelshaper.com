from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

# Official Three r128: MeshStandardMaterial.color and InstancedMesh instanceColor are linear.
# renderer.outputEncoding = sRGBEncoding converts linear -> sRGB on output.
# CSS/hex pickers are sRGB, so convertSRGBToLinear() is required (same as hub landing).

a = '                const color = new THREE.Color(colorStr);\n                mesh.setColorAt(index, color);'
b = '                const color = new THREE.Color(colorStr);\n                if (color.convertSRGBToLinear) color.convertSRGBToLinear();\n                mesh.setColorAt(index, color);'
if a in t:
    t = t.replace(a, b, 1)
    print('addInstancedVoxel linear')
else:
    print('addInstancedVoxel already or missing')

a = '                    const color = new THREE.Color(newColorStr);\n                    mesh.setColorAt(info.index, color);'
b = '                    const color = new THREE.Color(newColorStr);\n                    if (color.convertSRGBToLinear) color.convertSRGBToLinear();\n                    mesh.setColorAt(info.index, color);'
if a in t:
    t = t.replace(a, b, 1)
    print('updateInstancedVoxelColor linear')
else:
    print('update color already or missing')

a = '''                    const mat = new THREE.MeshStandardMaterial({
                        color: color,
                        roughness: isGlass ? 0.14 : profile.roughness,'''
b = '''                    const mat = new THREE.MeshStandardMaterial({
                        color: color,
                        roughness: isGlass ? 0.14 : profile.roughness,'''
# convert after construct, unique next lines
marker = '''                    const mat = new THREE.MeshStandardMaterial({
                        color: color,
                        roughness: isGlass ? 0.14 : profile.roughness,
                        metalness: isGlass ? 0.18 : profile.metalness,'''
inject = '''                    const mat = new THREE.MeshStandardMaterial({
                        color: color,
                        roughness: isGlass ? 0.14 : profile.roughness,
                        metalness: isGlass ? 0.18 : profile.metalness,'''
if 'mat.color.convertSRGBToLinear' not in t and marker in t:
    t = t.replace(
        marker,
        marker + '\n                    });\n                    if (mat.color && mat.color.convertSRGBToLinear) mat.color.convertSRGBToLinear();\n                    if (false) { const _unused = ({',
        1
    )
    # that would break syntax - do a cleaner insert after the material object instead
    print('abort bad plan')
    raise SystemExit('use closing-brace insert')

p.write_text(t, encoding='utf-8')
print('partial')
