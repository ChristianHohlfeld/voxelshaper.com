from pathlib import Path
p = Path('index.html')
t = p.read_text(encoding='utf-8')
needle = 'pushVoxel(x, y, z, srcVoxels[key]);'
i = t.find(needle)
if i < 0:
    raise SystemExit('needle missing')
j = t.find('const shiftX', i)
if j < 0:
    raise SystemExit('shiftX missing')
between = t[i:j]
if between.rstrip().endswith('}') and t[j-80:j].count('}\n                    }\n') == 0:
    # insert extra closer before shiftX if else-block is still open
    pass
marker = '''                            }
                        }
                    }

                    const shiftX'''
if marker in t[i:i+800] and '                    }\n                    }\n\n                    const shiftX' not in t[i:i+900]:
    t = t[:i] + t[i:].replace(
        marker,
        '''                            }
                        }
                    }
                    }

                    const shiftX''',
        1,
    )
    p.write_text(t, encoding='utf-8')
    print('inserted closer')
else:
    print('already closed or unexpected shape')
    print(repr(t[j-120:j+20]))
