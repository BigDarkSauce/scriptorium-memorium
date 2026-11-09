#!/usr/bin/env python3
"""Turn a .glb into a self-contained glTF JSON (<name>.gltf.json, buffer embedded as base64).

The claude.ai artifact host serves only standard web types (.json yes, .glb no); three's GLTFLoader reads either.
usage: glb2json.py in.glb out.gltf.json"""
import base64, json, struct, sys
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
magic, ver, total = struct.unpack_from('<III', b, 0)
assert magic == 0x46546C67, 'not a GLB'
off, doc, binc = 12, None, b''
while off < total:
    n, kind = struct.unpack_from('<II', b, off); chunk = b[off + 8: off + 8 + n]; off += 8 + n
    if kind == 0x4E4F534A: doc = json.loads(chunk.decode('utf-8').rstrip(' \x00'))
    elif kind == 0x004E4942: binc = chunk
if binc:
    doc['buffers'][0]['uri'] = 'data:application/octet-stream;base64,' + base64.b64encode(binc).decode('ascii')
json.dump(doc, open(dst, 'w'), separators=(',', ':'))
print(dst, len(open(dst, 'rb').read()), 'bytes')
