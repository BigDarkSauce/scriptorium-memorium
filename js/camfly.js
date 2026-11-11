// Camera flights that turn smoothly. A flight used to blend the point being looked at (from the old aim to the new
// one); when that path runs close to the camera the view swings sideways in a few frames, then settles. Here the
// position is blended and the orientation is turned along the shortest arc (a quaternion slerp) from where the camera
// looks now to where it will look at the end, so the turn is even from the first frame to the last.
import * as THREE from 'three';
const M = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
// the orientation of a camera standing at `pos` and looking at `aim` (Object3D.lookAt, for a camera)
export function lookQ(pos, aim, out = new THREE.Quaternion()) { M.lookAt(pos, aim, UP); return out.setFromRotationMatrix(M); }
// one frame of a flight F = { p0, p1, q0, q1, lift? } at eased progress e (0..1); lift raises the middle of the path (an arc)
export function flyPose(cam, F, e) { cam.position.lerpVectors(F.p0, F.p1, e); if (F.lift) cam.position.y += F.lift * Math.sin(Math.PI * e); cam.quaternion.slerpQuaternions(F.q0, F.q1, e); cam.updateMatrixWorld(); }
// the gentle ease of a long reposition: its peak speed is pi/2 times the mean (a quintic ease peaks near 2.5 times it)
export const easeSine = t => .5 - .5 * Math.cos(Math.PI * t);
// how long a flight takes, from how far it goes and how far it turns: a camera that turns 180 degrees needs time for it,
// or the view whips round (keeps the turn under ~120 degrees per second at its fastest)
export function flightDur(p0, q0, p1, q1, min = .9, max = 2.7) { const turn = q0.angleTo(q1) * 180 / Math.PI; return Math.min(max, Math.max(min, .75 + p0.distanceTo(p1) * .06 + turn / 180 * 1.35)); }
