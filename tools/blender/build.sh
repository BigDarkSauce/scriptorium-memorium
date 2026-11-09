#!/bin/sh
# Compress the raw Blender exports into assets/kit/<name>.glb:
#   weld + quantize + meshopt geometry (decoded by three/addons/libs/meshopt_decoder.module.js, no WASM fetch),
#   occlusion texture to WebP (EXT_texture_webp; three's GLTFLoader reads it), no texture over 1024 px.
#   usage: tools/blender/build.sh <dir-with-*.raw.glb>        (needs: npm install --prefix tools)
set -e
ROOT=$(cd "$(dirname "$0")/../.." && pwd); IN=${1:-$ROOT/tools/blender/out}; GT="$ROOT/tools/node_modules/.bin/gltf-transform"
mkdir -p "$ROOT/assets/kit"
for f in "$IN"/*.raw.glb; do
  n=$(basename "$f" .raw.glb)
  "$GT" optimize "$f" "$ROOT/assets/kit/$n.glb" --compress meshopt --texture-compress webp --texture-size 1024 --simplify false --instance false --join false --palette false --flatten false
  printf '%s\t%s bytes\n' "$n" "$(wc -c < "$ROOT/assets/kit/$n.glb")"
done
