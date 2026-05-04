import { Environment, OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CuboidCollider, Physics, RapierRigidBody, RigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import { Euler, Quaternion, Vector3 } from "three";
import { getRotationForTopFace, getTopFace } from "./dicePhysics";

type DiceSceneProps = {
  rollToken: number;
  forcedRoll?: number;
  scriptedAnimation?: DiceRollAnimation;
  onRollStart: () => void;
  onRollComplete: (roll: number) => void;
};

export type DiceRollAnimation = {
  id: string;
  roll: number;
  duration: number;
  start: [number, number, number];
  drift: [number, number, number];
  axis: [number, number, number];
  axis2: [number, number, number];
  turns: number;
  turns2: number;
  wobble: number;
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

const arena = {
  halfWidth: 7,
  halfDepth: 5,
  visibleHalfWidth: 2.85,
  visibleHalfDepth: 1.95,
  wallHeight: 2.6,
  wallThickness: 0.16,
};

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

function Arena({ rollToken, forcedRoll, scriptedAnimation, onRollStart, onRollComplete }: DiceSceneProps) {
  const dice = useRef<RapierRigidBody>(null);
  const rollId = useRef(0);
  const handledRollToken = useRef(0);
  const resultRotation = useRef<{
    startedAt: number;
    duration: number;
    from: Quaternion;
    to: Quaternion;
  } | null>(null);
  const scriptedRoll = useRef<{
    startedAt: number;
    animation: DiceRollAnimation;
    finalRotation: Quaternion;
    spinAxis: Vector3;
    spinAxis2: Vector3;
  } | null>(null);

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
          x: -x * (0.8 + Math.random() * 0.55),
          y: 3.7 + Math.random() * 1.2,
          z: -1.15 + Math.random() * 2.3,
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

  useFrame(() => {
    const scripted = scriptedRoll.current;
    if (scripted && dice.current) {
      const { animation, finalRotation, spinAxis, spinAxis2 } = scripted;
      const progress = Math.min((performance.now() - scripted.startedAt) / animation.duration, 1);
      const motionEase = 1 - Math.pow(1 - progress, 2.2);
      const groundY = 0.56;
      const firstImpact = 0.42;
      const secondImpact = 0.68;
      const finalSettle = 0.86;
      let y = groundY;

      if (progress < firstImpact) {
        const t = progress / firstImpact;
        y = animation.start[1] * (1 - t) + groundY * t + Math.sin(Math.PI * t) * 1.22;
      } else if (progress < secondImpact) {
        const t = (progress - firstImpact) / (secondImpact - firstImpact);
        y = groundY + Math.sin(Math.PI * t) * 0.42;
      } else if (progress < finalSettle) {
        const t = (progress - secondImpact) / (finalSettle - secondImpact);
        y = groundY + Math.sin(Math.PI * t) * 0.15;
      } else {
        const t = (progress - finalSettle) / (1 - finalSettle);
        y = groundY + Math.sin(Math.PI * 8 * t) * 0.012 * (1 - t);
      }

      const wobble = Math.sin(progress * Math.PI * 6) * animation.wobble * (1 - progress);
      const remaining = Math.pow(1 - progress, 1.18);
      const spin = new Quaternion().setFromAxisAngle(
        spinAxis,
        Math.PI * 2 * animation.turns * remaining,
      );
      const crossSpin = new Quaternion().setFromAxisAngle(
        spinAxis2,
        Math.PI * 2 * animation.turns2 * remaining,
      );
      const impactTumble = new Quaternion().setFromEuler(
        new Euler(
          Math.sin(progress * Math.PI * 5) * 0.18 * (1 - progress),
          Math.cos(progress * Math.PI * 4) * 0.12 * (1 - progress),
          Math.sin(progress * Math.PI * 6) * 0.16 * (1 - progress),
        ),
      );
      const rotation = finalRotation.clone().multiply(spin).multiply(crossSpin).multiply(impactTumble);

      dice.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      dice.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      dice.current.setTranslation(
        {
          x: animation.start[0] + animation.drift[0] * motionEase + wobble,
          y,
          z: animation.start[2] + animation.drift[2] * motionEase - wobble * 0.45,
        },
        true,
      );
      dice.current.setRotation(
        { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
        true,
      );

      if (progress === 1) {
        scriptedRoll.current = null;
      }
      return;
    }

    const animation = resultRotation.current;
    if (!animation || !dice.current) return;

    const progress = Math.min((performance.now() - animation.startedAt) / animation.duration, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const rotation = animation.from.clone().slerp(animation.to, eased);
    dice.current.setRotation(
      { x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w },
      true,
    );

    if (progress === 1) {
      resultRotation.current = null;
    }
  });

  useEffect(() => {
    if (rollToken === 0 || handledRollToken.current === rollToken) return;
    handledRollToken.current = rollToken;
    rollId.current += 1;
    const activeRoll = rollId.current;
    onRollStart();

    if (scriptedAnimation) {
      const axis = new Vector3(...scriptedAnimation.axis).normalize();
      const axis2 = new Vector3(...scriptedAnimation.axis2).normalize();
      scriptedRoll.current = {
        startedAt: performance.now(),
        animation: scriptedAnimation,
        finalRotation: getRotationForTopFace(scriptedAnimation.roll),
        spinAxis: axis,
        spinAxis2: axis2,
      };

      const scriptedTimer = window.setTimeout(() => {
        if (activeRoll !== rollId.current) return;
        onRollComplete(scriptedAnimation.roll);
      }, scriptedAnimation.duration);

      return () => window.clearTimeout(scriptedTimer);
    }

    rollDice(dice.current, 0);

    const snapTimer = window.setTimeout(() => {
      if (activeRoll !== rollId.current || !dice.current || forcedRoll === undefined) return;
      const currentRotation = dice.current.rotation();
      dice.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      dice.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
      resultRotation.current = {
        startedAt: performance.now(),
        duration: 520,
        from: new Quaternion(currentRotation.x, currentRotation.y, currentRotation.z, currentRotation.w),
        to: getRotationForTopFace(forcedRoll),
      };
    }, 2450);

    const resultTimer = window.setTimeout(() => {
      if (activeRoll !== rollId.current || !dice.current) return;
      const rotation = dice.current.rotation();
      const physicalRoll = getTopFace(new Quaternion(rotation.x, rotation.y, rotation.z, rotation.w));
      onRollComplete(forcedRoll ?? physicalRoll);
    }, 3200);

    return () => {
      window.clearTimeout(snapTimer);
      window.clearTimeout(resultTimer);
    };
  }, [forcedRoll, onRollComplete, onRollStart, rollDice, rollToken, scriptedAnimation]);

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
            <boxGeometry args={[arena.halfWidth * 2, arena.halfDepth * 2, 0.16]} />
            <meshStandardMaterial color="#272a2f" roughness={0.72} metalness={0.1} />
          </mesh>
          <CuboidCollider args={[arena.halfWidth, 0.08, arena.halfDepth]} position={[0, -0.03, 0]} />
          <CuboidCollider
            args={[arena.visibleHalfWidth, arena.wallHeight, arena.wallThickness]}
            position={[0, arena.wallHeight - 0.02, -arena.visibleHalfDepth]}
          />
          <CuboidCollider
            args={[arena.visibleHalfWidth, arena.wallHeight, arena.wallThickness]}
            position={[0, arena.wallHeight - 0.02, arena.visibleHalfDepth]}
          />
          <CuboidCollider
            args={[arena.wallThickness, arena.wallHeight, arena.visibleHalfDepth]}
            position={[-arena.visibleHalfWidth, arena.wallHeight - 0.02, 0]}
          />
          <CuboidCollider
            args={[arena.wallThickness, arena.wallHeight, arena.visibleHalfDepth]}
            position={[arena.visibleHalfWidth, arena.wallHeight - 0.02, 0]}
          />
          <CuboidCollider args={[18, 0.18, 18]} position={[0, -2.2, 0]} />
        </RigidBody>
        <Dice bodyRef={dice} color="#f5f0df" accent="#16181d" position={[0, 1.3, 0]} />
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
    <Canvas shadows camera={{ position: [0, 4.5, 6.6], fov: 46 }} dpr={[1, 2]}>
      <Arena {...props} />
    </Canvas>
  );
}

function CameraRig() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 4.5, 6.6);
    camera.lookAt(0, 0.45, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  return null;
}
