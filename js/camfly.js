// Camera flights that turn smoothly. A flight used to blend the point being looked at (from the old aim to the new
// one); when that path runs close to the camera the view swings sideways in a few frames, then settles. Here the
// position is blended and the orientation is turned along the shortest arc (a quaternion slerp) from where the camera
// looks now to where it will look at the end, so the turn is even from the first frame to the last.
import * as THREE from 'three';
const M = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
// the orientation of a camera standing at `pos` and looking at `aim` (Object3D.lookAt, for a camera)
export function lookQ(pos, aim, out = new THREE.Quaternion()) { M.lookAt(pos, aim, UP); return out.setFromRotationMatrix(M); }
// one frame of a flight F = { p0, p1, q0, q1 } at eased progress e (0..1)
export function flyPose(cam, F, e) { cam.position.lerpVectors(F.p0, F.p1, e); cam.quaternion.slerpQuaternions(F.q0, F.q1, e); cam.updateMatrixWorld(); }
