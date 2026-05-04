import { Quaternion, Vector3 } from "three";

type Face = {
  value: number;
  normal: Vector3;
};

const faces: Face[] = [
  { value: 1, normal: new Vector3(0, 1, 0) },
  { value: 6, normal: new Vector3(0, -1, 0) },
  { value: 2, normal: new Vector3(0, 0, 1) },
  { value: 5, normal: new Vector3(0, 0, -1) },
  { value: 3, normal: new Vector3(1, 0, 0) },
  { value: 4, normal: new Vector3(-1, 0, 0) },
];

export function getTopFace(rotation: Quaternion): number {
  let bestFace = faces[0];
  let bestY = -Infinity;

  for (const face of faces) {
    const worldNormal = face.normal.clone().applyQuaternion(rotation);
    if (worldNormal.y > bestY) {
      bestY = worldNormal.y;
      bestFace = face;
    }
  }

  return bestFace.value;
}
