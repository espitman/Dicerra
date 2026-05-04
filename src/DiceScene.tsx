import { Environment, OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { CuboidCollider, Physics, RapierRigidBody, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { Euler, Quaternion } from "three";
import { getTopFace } from "./dicePhysics";

type DiceSceneProps = {
  rollToken: number;
  onRollStart: () => void;
  onRollComplete: (player1Roll: number, player2Roll: number) => void;
};

type DiceProps = {
  bodyRef: React.RefObject<RapierRigidBody>;
  color: string;
  accent: string;
  position: [number, number, number];
};

const pipLayouts: Record<number, Array<[number, number]>> = {
  1: [[0, 0]],
  2: [
    [-0.23, -0.23],
    [0.23, 0.23],
  ],
  3: [
    [-0.25, -0.25],
    [0, 0],
    [0.25, 0.25],
  ],
  4: [
    [-0.24, -0.24],
    [-0.24, 0.24],
    [0.24, -0.24],
    [0.24, 0.24],
  ],
  5: [
    [-0.26, -0.26],
    [-0.26, 0.26],
    [0, 0],
    [0.26, -0.26],
    [0.26, 0.26],
  ],
  6: [
    [-0.26, -0.3],
    [-0.26, 0],
    [-0.26, 0.3],
    [0.26, -0.3],
    [0.26, 0],
    [0.26, 0.3],
  ],
};

const faces = [
  { value: 1, position: [0, 0.505, 0], rotation: [-Math.PI / 2, 0, 0] },
  { value: 6, position: [0, -0.505, 0], rotation: [Math.PI / 2, 0, 0] },
  { value: 2, position: [0, 0, 0.505], rotation: [0, 0, 0] },
  { value: 5, position: [0, 0, -0.505], rotation: [0, Math.PI, 0] },
  { value: 3, position: [0.505, 0, 0], rotation: [0, Math.PI / 2, 0] },
  { value: 4, position: [-0.505, 0, 0], rotation: [0, -Math.PI / 2, 0] },
] as const;

function Pip({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <mesh position={[x, y, 0.006]}>
      <circleGeometry args={[0.055, 28]} />
      <meshStandardMaterial color={color} roughness={0.62} metalness={0.08} />
    </mesh>
  );
}

function Dice({ bodyRef, color, accent, position }: DiceProps) {
  return (
    <RigidBody
      ref={bodyRef}
      colliders="cuboid"
      restitution={0.42}
      friction={0.82}
      linearDamping={0.34}
      angularDamping={0.42}
      position={position}
    >
      <group castShadow>
        <RoundedBox args={[1, 1, 1]} radius={0.12} smoothness={8}>
          <meshStandardMaterial color={color} roughness={0.38} metalness={0.08} />
        </RoundedBox>
        {faces.map((face) => (
          <group
            key={face.value}
            position={face.position}
            rotation={face.rotation as unknown as Euler}
          >
            {pipLayouts[face.value].map(([x, y], index) => (
              <Pip key={`${face.value}-${index}`} x={x} y={y} color={accent} />
            ))}
          </group>
        ))}
      </group>
    </RigidBody>
  );
}

function Arena({ rollToken, onRollStart, onRollComplete }: DiceSceneProps) {
  const player1Dice = useRef<RapierRigidBody>(null);
  const player2Dice = useRef<RapierRigidBody>(null);
  const rollId = useRef(0);

  const rollDice = useMemo(
    () => (body: RapierRigidBody | null, x: number) => {
      if (!body) return;
      body.setTranslation({ x, y: 2.1, z: -0.45 + Math.random() * 0.9 }, true);
      body.setRotation(
        {
          x: Math.random(),
          y: Math.random(),
          z: Math.random(),
          w: Math.random() + 0.4,
        },
        true,
      );
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      body.applyImpulse(
        {
          x: -x * (1.15 + Math.random() * 0.9),
          y: 3.7 + Math.random() * 1.2,
          z: -1.8 + Math.random() * 3.6,
        },
        true,
      );
      body.applyTorqueImpulse(
        {
          x: -9 + Math.random() * 18,
          y: -8 + Math.random() * 16,
          z: -9 + Math.random() * 18,
        },
        true,
      );
    },
    [],
  );

  useEffect(() => {
    if (rollToken === 0) return;
    rollId.current += 1;
    const activeRoll = rollId.current;
    onRollStart();
    rollDice(player1Dice.current, -1.25);
    rollDice(player2Dice.current, 1.25);

    const resultTimer = window.setTimeout(() => {
      if (activeRoll !== rollId.current || !player1Dice.current || !player2Dice.current) return;
      const p1 = player1Dice.current.rotation();
      const p2 = player2Dice.current.rotation();
      onRollComplete(
        getTopFace(new Quaternion(p1.x, p1.y, p1.z, p1.w)),
        getTopFace(new Quaternion(p2.x, p2.y, p2.z, p2.w)),
      );
    }, 3200);

    return () => window.clearTimeout(resultTimer);
  }, [onRollComplete, onRollStart, rollDice, rollToken]);

  return (
    <>
      <CameraRig />
      <color attach="background" args={["#111318"]} />
      <fog attach="fog" args={["#111318", 7, 18]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[2.5, 5, 4]} intensity={2.6} castShadow />
      <spotLight position={[-3.5, 6, 1.5]} intensity={1.8} angle={0.45} penumbra={0.55} />
      <Physics gravity={[0, -9.81, 0]}>
        <RigidBody type="fixed" colliders={false}>
          <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]}>
            <boxGeometry args={[6.2, 4.2, 0.14]} />
            <meshStandardMaterial color="#272a2f" roughness={0.72} metalness={0.1} />
          </mesh>
          <CuboidCollider args={[3.1, 0.07, 2.1]} position={[0, -0.03, 0]} />
          <CuboidCollider args={[3.1, 0.7, 0.1]} position={[0, 0.6, -2.1]} />
          <CuboidCollider args={[3.1, 0.7, 0.1]} position={[0, 0.6, 2.1]} />
          <CuboidCollider args={[0.1, 0.7, 2.1]} position={[-3.1, 0.6, 0]} />
          <CuboidCollider args={[0.1, 0.7, 2.1]} position={[3.1, 0.6, 0]} />
        </RigidBody>
        <Dice bodyRef={player1Dice} color="#f5f0df" accent="#16181d" position={[-1.2, 1.3, 0]} />
        <Dice bodyRef={player2Dice} color="#9bd7ff" accent="#111827" position={[1.2, 1.3, 0]} />
      </Physics>
      <mesh position={[0, -0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2.15, 2.2, 96]} />
        <meshBasicMaterial color="#f7c948" transparent opacity={0.22} />
      </mesh>
      <Environment preset="city" />
      <OrbitControls
        enablePan={false}
        minDistance={5.5}
        maxDistance={8}
        minPolarAngle={0.68}
        maxPolarAngle={1.2}
      />
    </>
  );
}

export function DiceScene(props: DiceSceneProps) {
  return (
    <Canvas shadows camera={{ position: [0, 4.2, 6.2], fov: 42 }} dpr={[1, 2]}>
      <Arena {...props} />
    </Canvas>
  );
}

function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 4.2, 6.2);
    camera.lookAt(0, 0.45, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}
