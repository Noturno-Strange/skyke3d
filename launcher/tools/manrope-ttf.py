# Skyke3D — gera as fontes do launcher (launcher/res/manrope-*.ttf) a partir da Manrope que o jogo já usa (assets/manrope-latin.woff2).
# O Java não lê woff2 nem escolhe peso de fonte variável: aqui saem instâncias fixas em TTF.
# Copyright (C) 2026 Noturno-Strange · SPDX-License-Identifier: GPL-3.0-only (a fonte é OFL: assets/manrope-OFL.txt)
#
# Uso: python3 -m venv /tmp/v && /tmp/v/bin/pip install fonttools brotli && /tmp/v/bin/python -I launcher/tools/manrope-ttf.py
import os
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
src = os.path.join(root, 'assets', 'manrope-latin.woff2')
for name, w in (('medium', 500), ('bold', 700), ('extrabold', 800)):
    f = TTFont(src)
    f.flavor = None
    inst = instantiateVariableFont(f, {'wght': w}, updateFontNames=False)
    out = os.path.join(root, 'launcher', 'res', 'manrope-' + name + '.ttf')
    inst.save(out)
    print(out, os.path.getsize(out), file=sys.stderr)
