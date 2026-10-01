from pathlib import Path

p = Path('index.html')
t = p.read_text(encoding='utf-8')
orbit = '<script src="orbit-zoom.js"></script>'
morph = '<script src="morph-forms-v2.js"></script>'
physics = '<script src="physics-controls.js"></script>'

changed = False
if morph not in t:
    t = t.replace(orbit, f'{orbit}\n{morph}', 1)
    changed = True

if physics not in t:
    anchor = morph if morph in t else orbit
    t = t.replace(anchor, f'{anchor}\n{physics}', 1)
    changed = True

print('editor extension scripts injected' if changed else 'editor extension scripts already present')
p.write_text(t, encoding='utf-8')
