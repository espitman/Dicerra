import { Euler, Quaternion, Vector3 } from "three";

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

export function getRotationForTopFace(value: number): Quaternion {
  const rotationByValue: Record<number, Euler> = {
    1: new Euler(0, 0, 0),
    2: new Euler(-Math.PI / 2, 0, 0),
    3: new Euler(0, 0, Math.PI / 2),
    4: new Euler(0, 0, -Math.PI / 2),
    5: new Euler(Math.PI / 2, 0, 0),
    6: new Euler(Math.PI, 0, 0),
  };

  return new Quaternion().setFromEuler(rotationByValue[value] ?? rotationByValue[1]);
}
