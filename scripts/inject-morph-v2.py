from pathlib import Path

p = Path('index.html')
t = p.read_text(encoding='utf-8')
orbit = '<script src="orbit-zoom.js"></script>'
morph = '<script src="morph-forms-v2.js"></script>'
physics = '<script src="physics-controls.js"></script>'
box3d = '<script src="lib/box3d/box3d.js"></script>'
box3d_runtime = '<script src="physics-box3d-runtime.js"></script>'
history = '<script src="history-hardening.js"></script>'
box3d_hardening = '<script src="physics-runtime-hardening.js"></script>'
physics_visuals = '<script src="physics-visuals.js"></script>'
physics_cycle = '<script src="physics-mobile-cycle.js"></script>'

ordered = [morph, physics, box3d, box3d_runtime, history, box3d_hardening, physics_visuals, physics_cycle]
changed = False

for tag in ordered:
    if tag in t:
        t = t.replace(tag, '', 1)
        changed = True

block = '\n'.join([orbit, *ordered])
if block not in t:
    if orbit not in t:
        raise SystemExit('orbit-zoom.js anchor not found')
    t = t.replace(orbit, block, 1)
    changed = True

while '\n\n\n' in t:
    t = t.replace('\n\n\n', '\n\n')

print('editor extension scripts injected' if changed else 'editor extension scripts already present')
p.write_text(t, encoding='utf-8')
