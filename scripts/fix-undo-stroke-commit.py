from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
old = '''                this.drawVoxelLine(start, end, normal);
                this.commitCurrentStroke();
            },'''
new = '''                this.drawVoxelLine(start, end, normal);
            },'''
if old not in t:
    if 'drawVoxelLinePaced' in t and t.count('this.commitCurrentStroke();') <= 2:
        print('already patched or unexpected')
        raise SystemExit(0)
    raise SystemExit('paced commit not found')
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('stroke commits only on pointer up')
