from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

# Mode toggle currently lower (4.9) — put it where brush is (8.9 / 10.2)
repls = [
    ('bottom: calc(var(--safe-bottom) + 4.9rem) !important;', 'bottom: calc(var(--safe-bottom) + 8.9rem) !important;'),
    ('bottom: calc(var(--safe-bottom) + 4.9rem);', 'bottom: calc(var(--safe-bottom) + 8.9rem);'),
]
# only first mode-toggle block, not all 4.9
mode_start = t.find('#mobile-canvas-mode-toggle {')
mode_end = t.find('#mobile-canvas-mode-toggle.is-edit', mode_start)
block = t[mode_start:mode_end]
if mode_start < 0 or mode_end < 0:
    raise SystemExit('mode block missing')
block2 = block.replace(
    'bottom: calc(var(--safe-bottom) + 4.9rem) !important;',
    'bottom: calc(var(--safe-bottom) + 8.9rem) !important;',
    1,
)
block2 = block2.replace(
    'bottom: calc(var(--safe-bottom) + 4.9rem);',
    'bottom: calc(var(--safe-bottom) + 8.9rem);',
    1,
)
if block2 == block:
    print('mode already high or unexpected')
else:
    t = t[:mode_start] + block2 + t[mode_end:]
    print('mode moved up')

color_start = t.find('#mobile-canvas-color-picker-wrap {')
color_end = t.find('#mobile-canvas-color-picker {', color_start)
cblock = t[color_start:color_end]
if color_start < 0 or color_end < 0:
    raise SystemExit('color block missing')
c2 = cblock
for a,b in [
    ('bottom: calc(var(--safe-bottom) + 10.2rem) !important;', 'bottom: calc(var(--safe-bottom) + 4.9rem) !important;'),
    ('bottom: calc(var(--safe-bottom) + 8.9rem) !important;', 'bottom: calc(var(--safe-bottom) + 4.9rem) !important;'),
    ('bottom: calc(var(--safe-bottom) + 8.9rem);', 'bottom: calc(var(--safe-bottom) + 4.9rem);'),
]:
    if a in c2:
        c2 = c2.replace(a, b, 1)
        print('color', a, '-> 4.9')
        break
else:
    print('color bottom unexpected', cblock[0:220])
if c2 != cblock:
    t = t[:color_start] + c2 + t[color_end:]

p.write_text(t, encoding='utf-8')
print('done')
