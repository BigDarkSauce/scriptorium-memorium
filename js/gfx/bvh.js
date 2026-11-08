// Accelerated raycasting with three-mesh-bvh (docs/research/tooling-decision.md, item A1).
//
// three.js tests a ray against every triangle of every mesh it reaches. The director's zoom-shot search
// (director.clearAxis: ~45 candidate axes × ~19 rays against all opaque meshes) therefore froze the main thread for
// 1.3 s on the water-cycle valley and 5.6 s on the weather glass (SwiftShader, measured). With a bounding-volume
// hierarchy per geometry the same search takes 21 ms and 0.74 s; the nearest hit of every ray is unchanged.
//
// How it is wired, so nothing else has to change:
//  • Mesh.prototype.raycast is replaced once by a wrapper. Every caller (hub, rooms, edit pick, POV clear view, the
//    director) gets the speed-up without edits.
//  • Trees are built lazily, on the first ray that reaches a geometry, and only for geometries of ≥ 256 triangles
//    (smaller ones are as fast brute-force). `indirect: true` keeps the geometry's index buffer untouched (no triangle
//    reordering, no new index on non-indexed geometry), so rendering and faceIndex stay exactly as before.
//  • Geometry whose positions change after the tree was built (a water surface, a trail) is detected by the position
//    attribute's version: its tree is dropped and that geometry stays brute-force from then on. Morph-target, skinned,
//    batched and drawRange-limited geometries are never given a tree. geometry.dispose() frees the tree.
//  • Feature flag: on by default; `?bvh=0` in the URL or localStorage['scriptorium.bvh'] = '0' turns it off. If the
//    library cannot be loaded (offline, CDN blocked) three's own raycast stays in place.
//  • The library comes through the import map entry "three-mesh-bvh" (index.html; pinned to 0.9.16, which imports
//    only from 'three', so it shares the page's three r170 instance).
import * as THREE from 'three';

const MIN_TRIS = 256;
export const BVH = { on: false, failed: null, built: 0, skipped: 0, bytes: 0, ms: 0 };

function wanted() {
  try { if (/[?&]bvh=0\b/.test(location.search)) return false; } catch (e) { }
  try { if (localStorage.getItem('scriptorium.bvh') === '0') return false; } catch (e) { }
  return true;
}

function eligible(mesh, g) {
  if (g._bvhSkip || !g.attributes.position || mesh.isSkinnedMesh || mesh.isBatchedMesh) return false;
  if (g.morphAttributes && g.morphAttributes.position && g.morphAttributes.position.length) return false;
  const n = (g.index ? g.index.count : g.attributes.position.count);
  if (g.drawRange.start !== 0 || (g.drawRange.count !== Infinity && g.drawRange.count < n)) return false;
  return n / 3 >= MIN_TRIS;
}

function treeBytes(t) { let b = 0; try { (t._roots || []).forEach(r => b += r.byteLength || 0); if (t._indirectBuffer) b += t._indirectBuffer.byteLength; } catch (e) { } return b; }

function drop(g) {
  const t = g.boundsTree; if (!t) return;
  BVH.bytes -= g._bvhBytes || 0; g._bvhBytes = 0; g.boundsTree = undefined;
}

let installing = null;
export function installBVH() {
  if (installing) return installing;
  if (!wanted()) return (installing = Promise.resolve(false));
  installing = import('three-mesh-bvh').then(lib => {
    const brute = THREE.Mesh.prototype.raycast, fast = lib.acceleratedRaycast, MeshBVH = lib.MeshBVH;
    const onDispose = e => { const g = e.target; g.removeEventListener('dispose', onDispose); drop(g); };
    THREE.Mesh.prototype.raycast = function (raycaster, hits) {
      const g = this.geometry;
      if (!g || !g.isBufferGeometry) return brute.call(this, raycaster, hits);
      if (g.boundsTree) {
        if (g.attributes.position.version !== g._bvhVer || (g.index && g.index.version !== g._bvhIdx)) { drop(g); g._bvhSkip = true; BVH.skipped++; }   // deforming geometry: brute-force from now on
        else return fast.call(this, raycaster, hits);
      }
      if (!eligible(this, g)) return brute.call(this, raycaster, hits);
      try {
        const t0 = performance.now();
        g.boundsTree = new MeshBVH(g, { indirect: true, targetLeafSize: 10, verbose: false });
        g._bvhVer = g.attributes.position.version; g._bvhIdx = g.index ? g.index.version : 0;
        g._bvhBytes = treeBytes(g.boundsTree); BVH.bytes += g._bvhBytes; BVH.built++; BVH.ms += performance.now() - t0;
        g.addEventListener('dispose', onDispose);
      } catch (e) { g._bvhSkip = true; BVH.skipped++; return brute.call(this, raycaster, hits); }
      return fast.call(this, raycaster, hits);
    };
    THREE.Mesh.prototype.raycast._brute = brute;
    BVH.on = true; return true;
  }).catch(e => { BVH.failed = String(e && e.message || e); return false; });
  return installing;
}
