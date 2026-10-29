#!/usr/bin/env python3
"""Shrinks the bundled Noto fonts (APK size): pins width to 100, limits weight to 400-700 (the weights the app
uses) and keeps only the scripts each font serves. (Nastaliq Urdu is left as is: subsetting it makes it larger.) Run: python3 tools/subset-fonts.py (needs `pip install fonttools`).
Idempotent: re-running on already-subset files keeps them valid."""
import os, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools import subset

D = os.path.join(os.path.dirname(__file__), '..', 'app', 'assets', 'fonts')
COMMON = '0020-007E,00A0-00FF,2000-206F,20A0-20CF,2100-2122,2190-2193,2212,25CF,2713,FEFF,FFFD'
FONTS = {
    'NotoSans-VF.ttf': COMMON + ',0100-024F,0259,02B0-02FF,0300-036F,1E00-1EFF',
    'NotoSansBengali-VF.ttf': COMMON + ',0980-09FF,200C-200D,25CC,0964-0965',
    'NotoSansArabic-VF.ttf': COMMON + ',0600-06FF,0750-077F,08A0-08FF,FB50-FDFF,FE70-FEFF,200C-200F,25CC',
    'NotoSansDevanagari-VF.ttf': COMMON + ',0900-097F,A8E0-A8FF,1CD0-1CFF,200C-200D,25CC',
}

def ranges(spec):
    out = []
    for part in spec.split(','):
        a, _, b = part.partition('-')
        out.extend(range(int(a, 16), int(b or a, 16) + 1))
    return out

only = sys.argv[1:]
for name, spec in FONTS.items():
    if only and name not in only:
        continue
    p = os.path.join(D, name)
    before = os.path.getsize(p)
    f = TTFont(p)
    opts = subset.Options()
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.glyph_names = False
    opts.hinting = False
    opts.drop_tables += ['DSIG']
    s = subset.Subsetter(opts)
    s.populate(unicodes=ranges(spec))
    s.subset(f)
    if 'fvar' in f:
        limits = {}
        for ax in f['fvar'].axes:
            if ax.axisTag == 'wdth':
                limits['wdth'] = 100
            elif ax.axisTag == 'wght':
                limits['wght'] = (max(ax.minValue, 400), min(ax.maxValue, 700))
        full = all(limits.get(ax.axisTag) == (ax.minValue, ax.maxValue) for ax in f['fvar'].axes)
        if not full:
            f = instancer.instantiateVariableFont(f, limits)
    f.save(p)
    print(f'{name}: {before // 1024} KB -> {os.path.getsize(p) // 1024} KB')
sys.exit(0)
