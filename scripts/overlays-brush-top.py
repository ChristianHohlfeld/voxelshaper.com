from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')

# Mode toggle → lower (4.9rem)
ms = t.find('#mobile-canvas-mode-toggle {')
me = t.find('#mobile-canvas-mode-toggle.is-edit', ms)
block = t[ms:me]
b2 = block.replace(
    'bottom: calc(var(--safe-bottom) + 8.9rem) !important;',
    'bottom: calc(var(--safe-bottom) + 4.9rem) !important;',
    1,
)
b2 = b2.replace(
    'bottom: calc(var(--safe-bottom) + 8.9rem);',
    'bottom: calc(var(--safe-bottom) + 4.9rem);',
    1,
)
if b2 == block:
    print('mode unexpected', block[:240])
else:
    t = t[:ms] + b2 + t[me:]
    print('mode -> 4.9 lower')

cs = t.find('#mobile-canvas-color-picker-wrap {\n            --active-picker-color')
if cs < 0:
    cs = t.find('#mobile-canvas-color-picker-wrap {')
    # skip the display-only rule
    if 'display: block' in t[cs:cs+80]:
        cs = t.find('#mobile-canvas-color-picker-wrap {', cs+10)
ce = t.find('#mobile-canvas-color-picker {', cs)
cblock = t[cs:ce]
c2 = cblock.replace(
    'bottom: calc(var(--safe-bottom) + 4.9rem) !important;',
    'bottom: calc(var(--safe-bottom) + 8.9rem) !important;',
    1,
)
c2 = c2.replace(
    'bottom: calc(var(--safe-bottom) + 4.9rem);',
    'bottom: calc(var(--safe-bottom) + 8.9rem);',
    1,
)
if c2 == cblock:
    print('color unexpected', cblock[:240])
else:
    t = t[:cs] + c2 + t[ce:]
    print('color -> 8.9 upper')

p.write_text(t, encoding='utf-8')
print('brush top, mode bottom')
