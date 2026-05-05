import { OrbitControls, Text, useGLTF } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { ArrowLeft, Dices, Play, RefreshCcw, Sparkles, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Group, Mesh, MeshStandardMaterial, Vector3 } from "three";

type PlayerId = "p1" | "p2";

export type TugState = {
  player1Name: string;
  player2Name: string;
  setupComplete: boolean;
  currentPlayer: PlayerId;
  position: number;
  lastRoll?: number;
  message: string;
  status: "active" | "finished";
  winner?: PlayerId;
  moveSeq: number;
  rollCount: number;
  landPosition?: number;
  landSeq: number;
};

export type DiceTugRoom = {
  id: string;
  status: "waiting" | "active" | "finished";
  players: Partial<Record<PlayerId, { id: PlayerId; name: string; socketId?: string }>>;
  game: TugState;
};

const finishDistance = 7;

function createInitialTugState(): TugState {
  return {
    player1Name: "Player 1",
    player2Name: "Player 2",
    setupComplete: false,
    currentPlayer: "p1",
    position: 0,
    message: "Set up the tug match",
    status: "active",
    moveSeq: 0,
    rollCount: 0,
    landSeq: 0,
  };
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function applyTugRoll(state: TugState, roll: number): TugState {
  const direction = state.currentPlayer === "p1" ? -1 : 1;
  const targetFinish = direction * finishDistance;
  const playerName = state.currentPlayer === "p1" ? state.player1Name : state.player2Name;
  const nextPlayer = state.currentPlayer === "p1" ? "p2" : "p1";
  const rawPosition = state.position + direction * roll;
  const nextPosition =
    direction < 0 ? Math.max(targetFinish, rawPosition) : Math.min(targetFinish, rawPosition);
  const winner = nextPosition === targetFinish ? state.currentPlayer : undefined;

  return {
    ...state,
    lastRoll: roll,
    position: nextPosition,
    moveSeq: state.moveSeq + 1,
    landPosition: nextPosition,
    landSeq: state.landSeq + 1,
    currentPlayer: nextPlayer,
    status: winner ? "finished" : "active",
    winner,
    rollCount: state.rollCount + 1,
    message: winner ? `${playerName} pulled to finish` : `${playerName} pulled ${roll} spaces`,
  };
}

export function DiceTugGame({
  onBack,
  onlineRoom,
  onlinePlayerId,
  onlineError = "",
  initialRoomId = "",
  onlineIsRolling = false,
  onCreateOnline,
  onJoinOnline,
  onRollOnline,
  onRestartOnline,
}: {
  onBack: () => void;
  onlineRoom?: DiceTugRoom | null;
  onlinePlayerId?: PlayerId | null;
  onlineError?: string;
  initialRoomId?: string;
  onlineIsRolling?: boolean;
  onCreateOnline?: (playerName: string) => void;
  onJoinOnline?: (roomId: string, playerName: string) => void;
  onRollOnline?: () => void;
  onRestartOnline?: () => void;
}) {
  const isOnline = Boolean(onlineRoom && onlinePlayerId);
  const [localState, setLocalState] = useState<TugState>(createInitialTugState);
  const [isRolling, setIsRolling] = useState(false);
  const rollTimeoutRef = useRef<number>();
  const state = onlineRoom?.game ?? localState;
  const rolling = isOnline ? onlineIsRolling : isRolling;

  useEffect(() => {
    return () => {
      if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    };
  }, []);

  const startGame = (player1Name: string, player2Name: string) => {
    if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    setIsRolling(false);
    setLocalState({
      ...createInitialTugState(),
      player1Name: player1Name.trim() || "Player 1",
      player2Name: player2Name.trim() || "Player 2",
      setupComplete: true,
      message: `${player1Name.trim() || "Player 1"} starts the tug`,
    });
  };

  const resetGame = () => {
    if (isOnline) {
      onRestartOnline?.();
      return;
    }
    if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    setIsRolling(false);
    setLocalState((current) => ({
      ...createInitialTugState(),
      player1Name: current.player1Name,
      player2Name: current.player2Name,
      setupComplete: true,
      message: `${current.player1Name} starts the tug`,
    }));
  };

  const roll = () => {
    if (isOnline) {
      if (onlineIsRolling || state.status === "finished") return;
      onRollOnline?.();
      return;
    }
    if (isRolling || state.status === "finished") return;
    const rollValue = rollDie();
    const playerName = state.currentPlayer === "p1" ? state.player1Name : state.player2Name;

    setLocalState((current) => ({
      ...current,
      lastRoll: undefined,
      landPosition: undefined,
      message: `${playerName} is rolling`,
    }));
    setIsRolling(true);

    rollTimeoutRef.current = window.setTimeout(() => {
      setLocalState((current) => applyTugRoll(current, rollValue));
      setIsRolling(false);
      rollTimeoutRef.current = undefined;
    }, 920);
  };

  if (!state.setupComplete) {
    return (
      <DiceTugSetup
        onBack={onBack}
        onStart={startGame}
        onlineError={onlineError}
        initialRoomId={initialRoomId}
        onCreateOnline={onCreateOnline}
        onJoinOnline={onJoinOnline}
      />
    );
  }

  const currentPlayerName = state.currentPlayer === "p1" ? state.player1Name : state.player2Name;
  const winnerName = state.winner === "p1" ? state.player1Name : state.player2Name;
  const activeDirection = state.currentPlayer === "p1" ? -1 : 1;
  const spacesToFinish = Math.abs(activeDirection * finishDistance - state.position);
  const roomWaiting = onlineRoom?.status === "waiting";
  const canRollOnline =
    isOnline &&
    onlineRoom?.status === "active" &&
    state.status === "active" &&
    state.currentPlayer === onlinePlayerId &&
    !onlineIsRolling;
  const buttonText = isOnline
    ? roomWaiting
      ? "Waiting..."
      : state.status === "finished"
        ? "Tug finished"
        : onlineIsRolling
          ? "Rolling..."
          : state.currentPlayer === onlinePlayerId
            ? "Your roll"
            : "Opponent turn"
    : state.status === "finished"
      ? "Tug finished"
      : isRolling
        ? "Rolling..."
        : `${currentPlayerName} roll`;

  return (
    <main className="tug-shell">
      <section className="tug-panel">
        <div className="topbar">
          <div>
            <span className="eyebrow">Dicerra</span>
            <h1>Dice Tug</h1>
          </div>
          <div className="top-actions">
            {isOnline && (
              <div className="trail-room-chip" aria-label="Online room">
                <strong>{onlineRoom?.id}</strong>
                <span>{onlinePlayerId === "p1" ? "P1" : "P2"}</span>
              </div>
            )}
            <button className="icon-button" type="button" onClick={onBack} aria-label="Back to games">
              <ArrowLeft size={19} />
            </button>
            <button className="icon-button" type="button" onClick={resetGame} aria-label="Restart game">
              <RefreshCcw size={19} />
            </button>
          </div>
        </div>

        <div className="tug-scorebar">
          <TugPlayer name={state.player1Name} active={state.currentPlayer === "p1"} tone="warm" side="left" />
          <div className="trail-roll tug-roll">
            <TugDice value={state.lastRoll} rolling={rolling} />
            <div className="trail-stats" aria-label="Game stats">
              <span>{spacesToFinish}</span>
              <span>{state.rollCount} rolls</span>
            </div>
          </div>
          <TugPlayer name={state.player2Name} active={state.currentPlayer === "p2"} tone="cool" side="right" />
        </div>

        <div className="tug-board-wrap">
          <TugBoard3D
            position={state.position}
            moveSeq={state.moveSeq}
            activePlayer={state.status === "active" && !roomWaiting ? state.currentPlayer : undefined}
            landPosition={state.landPosition}
            landSeq={state.landSeq}
          />
        </div>

        <div className="trail-action-row">
          <p>{roomWaiting ? "Waiting for Player 2" : state.message}</p>
          <button
            className="roll-button"
            type="button"
            onClick={roll}
            disabled={isOnline ? !canRollOnline : isRolling || state.status === "finished"}
          >
            {buttonText}
          </button>
        </div>

        {state.status === "finished" && (
          <div
            className={`winner-overlay ${isOnline && state.winner !== onlinePlayerId ? "lose" : "win"}`}
            role="dialog"
            aria-label="Dice Tug winner"
          >
            {(!isOnline || state.winner === onlinePlayerId) && (
              <div className="confetti-strips" aria-hidden="true">
                {Array.from({ length: 22 }).map((_, index) => (
                  <span key={index} />
                ))}
              </div>
            )}
            <div className="winner-panel">
              <Sparkles size={28} />
              <span>{isOnline ? (onlinePlayerId === "p1" ? state.player1Name : state.player2Name) : winnerName}</span>
              <strong>{isOnline ? (state.winner === onlinePlayerId ? "You Win" : "You Lose") : "Win"}</strong>
              <button className="roll-button" type="button" onClick={resetGame}>
                Reset game
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function DiceTugSetup({
  onBack,
  onStart,
  onlineError,
  initialRoomId = "",
  onCreateOnline,
  onJoinOnline,
}: {
  onBack: () => void;
  onStart: (player1Name: string, player2Name: string) => void;
  onlineError?: string;
  initialRoomId?: string;
  onCreateOnline?: (playerName: string) => void;
  onJoinOnline?: (roomId: string, playerName: string) => void;
}) {
  const [player1Name, setPlayer1Name] = useState("Player 1");
  const [player2Name, setPlayer2Name] = useState("Player 2");
  const [roomCode, setRoomCode] = useState(initialRoomId);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStart(player1Name, player2Name);
  };

  return (
    <main className="setup-shell">
      <form className="setup-panel trail-setup" onSubmit={submit}>
        <div className="topbar">
          <div>
            <span className="eyebrow">Dicerra game setup</span>
            <h1>Dice Tug</h1>
          </div>
          <button className="icon-button" type="button" onClick={onBack} aria-label="Back to games">
            <ArrowLeft size={19} />
          </button>
        </div>
        <div className="setup-board">
          <label className="setup-field warm">
            <span>Left player</span>
            <input value={player1Name} maxLength={18} onChange={(event) => setPlayer1Name(event.target.value)} />
          </label>
          <label className="setup-field cool">
            <span>Right player</span>
            <input value={player2Name} maxLength={18} onChange={(event) => setPlayer2Name(event.target.value)} />
          </label>
        </div>
        <button className="start-button" type="submit">
          <Play size={18} fill="currentColor" />
          Start tug
        </button>
        {(onCreateOnline || onJoinOnline) && (
          <div className="online-panel">
            <div>
              <span className="eyebrow">online multiplayer</span>
              <h2>Play on two devices</h2>
            </div>
            {onlineError && <p className="setup-error">{onlineError}</p>}
            <div className="online-actions">
              <button className="start-button" type="button" onClick={() => onCreateOnline?.(player1Name)}>
                Create room
              </button>
              <label className="setup-field room-code-field">
                <span>Room code</span>
                <input
                  value={roomCode}
                  maxLength={8}
                  placeholder="ABC123"
                  onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
                />
              </label>
              <button className="ghost-button" type="button" onClick={() => onJoinOnline?.(roomCode, player2Name)}>
                Join room
              </button>
            </div>
          </div>
        )}
      </form>
    </main>
  );
}

function TugPlayer({
  name,
  active,
  tone,
  side,
}: {
  name: string;
  active: boolean;
  tone: "warm" | "cool";
  side: "left" | "right";
}) {
  return (
    <div className={`trail-player ${tone} ${active ? "active" : ""}`}>
      <div className="trail-player-name">
        {active && (
          <span className="trail-turn-icon" aria-label="Current turn">
            <UserRound size={15} />
          </span>
        )}
        <strong>{name}</strong>
      </div>
      <span>{side === "left" ? "Left finish" : "Right finish"}</span>
    </div>
  );
}

function TugDice({ value, rolling }: { value?: number; rolling: boolean }) {
  const [visibleRoll, setVisibleRoll] = useState(value ?? 1);

  useEffect(() => {
    if (!rolling) {
      setVisibleRoll(value ?? 1);
      return undefined;
    }

    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const speed = Math.max(58, 120 - elapsed / 16);
      const next = Math.floor(elapsed / speed) % 6;
      setVisibleRoll((next % 6) + 1);
    }, 45);

    return () => window.clearInterval(interval);
  }, [rolling, value]);

  return (
    <div className={`trail-dice-face value-${visibleRoll} ${value || rolling ? "" : "empty"} ${rolling ? "rolling" : ""}`}>
      {value || rolling ? Array.from({ length: visibleRoll }).map((_, index) => <i key={index} />) : <Dices size={26} />}
    </div>
  );
}

function tugPositionToVector(position: number): [number, number, number] {
  return [position * 0.82, 0.78, 0];
}

function TugBoard3D({
  position,
  moveSeq,
  activePlayer,
  landPosition,
  landSeq,
}: {
  position: number;
  moveSeq: number;
  activePlayer?: PlayerId;
  landPosition?: number;
  landSeq: number;
}) {
  const cells = useMemo(() => Array.from({ length: finishDistance * 2 + 1 }, (_, index) => index - finishDistance), []);

  return (
    <Canvas shadows camera={{ position: [0, 8.2, 8.8], fov: 42 }} dpr={[1, 2]}>
      <color attach="background" args={["#111318"]} />
      <ambientLight intensity={0.72} />
      <directionalLight position={[4, 8, 5]} intensity={2.2} castShadow />
      <spotLight position={[-5, 6, -3]} intensity={1.2} angle={0.55} penumbra={0.7} />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.12, 0]}>
        <boxGeometry args={[13.2, 4.2, 0.12]} />
        <meshStandardMaterial color="#171b22" roughness={0.78} metalness={0.08} />
      </mesh>

      <mesh position={[0, 0.07, 0]} receiveShadow>
        <boxGeometry args={[12.1, 0.16, 0.36]} />
        <meshStandardMaterial color="#594a27" roughness={0.64} metalness={0.1} />
      </mesh>

      {cells.map((cell) => (
        <TugCell
          key={cell}
          cell={cell}
          isLandTarget={cell === landPosition}
          landSeq={landSeq}
          activePlayer={activePlayer}
        />
      ))}

      {activePlayer && <TugDirectionArrow activeDirection={activePlayer === "p1" ? -1 : 1} />}
      <TugFinishFlag position={-finishDistance} tone="warm" />
      <TugFinishFlag position={finishDistance} tone="cool" />
      <TugToken position={position} moveSeq={moveSeq} shouldWiggle={activePlayer !== undefined} />

      <OrbitControls enablePan={false} minDistance={7.8} maxDistance={12.5} minPolarAngle={0.5} maxPolarAngle={1.1} />
    </Canvas>
  );
}

function TugCell({
  cell,
  isLandTarget,
  landSeq,
  activePlayer,
}: {
  cell: number;
  isLandTarget: boolean;
  landSeq: number;
  activePlayer?: PlayerId;
}) {
  const isStart = cell === 0;
  const isFinish = Math.abs(cell) === finishDistance;
  const isActiveSide = activePlayer === "p1" ? cell < 0 : activePlayer === "p2" ? cell > 0 : false;
  const color = isStart ? "#f7c948" : isFinish ? "#2dff8a" : cell < 0 ? "#8a6f28" : "#326b86";

  return (
    <group position={[cell * 0.82, 0.22, 0]}>
      {isLandTarget && <TugTileGlow key={`land-${landSeq}`} />}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[0.66, isFinish ? 0.36 : isStart ? 0.32 : 0.24, 0.72]} />
        <meshStandardMaterial
          color={isLandTarget ? "#237a4a" : color}
          emissive={isLandTarget ? "#2dff8a" : isActiveSide ? color : "#000000"}
          emissiveIntensity={isLandTarget ? 0.62 : isActiveSide ? 0.18 : 0}
          roughness={0.48}
          metalness={0.12}
        />
      </mesh>
      {(isStart || isFinish) && (
        <Text
          position={[0, isFinish ? 0.4 : 0.32, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={isStart ? 0.18 : 0.14}
          color="#f4f2ea"
          anchorX="center"
          anchorY="middle"
          outlineColor="#111318"
          outlineWidth={0.018}
        >
          {isStart ? "START" : "FINISH"}
        </Text>
      )}
    </group>
  );
}

function TugTileGlow() {
  const groupRef = useRef<Group>(null);
  const startedAt = useRef<number>();

  useFrame(({ clock }) => {
    startedAt.current ??= clock.elapsedTime;
    const elapsed = clock.elapsedTime - startedAt.current;
    if (groupRef.current) {
      const pulse = 1 + Math.sin(elapsed * 7.5) * 0.08;
      groupRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group ref={groupRef} position={[0, 0.24, 0]}>
      <pointLight color="#2dff8a" intensity={1.15} distance={1.6} />
    </group>
  );
}

function TugDirectionArrow({ activeDirection }: { activeDirection: -1 | 1 }) {
  const { scene } = useGLTF("/models/arrow.glb");
  const arrowScene = useMemo(() => {
    const clone = scene.clone();

    clone.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const isLeftArrow = mesh.name.includes("left_real_extruded_arrow_geometry");
      const isRightArrow = mesh.name.includes("right_real_extruded_arrow_geometry");
      const isLeftPanel = mesh.name.includes("left_recessed_panel");
      const isRightPanel = mesh.name.includes("right_recessed_panel");
      const isLeftActive = activeDirection === -1;
      const isRightActive = activeDirection === 1;
      const isActiveArrow = (isLeftArrow && isLeftActive) || (isRightArrow && isRightActive);
      const isInactiveArrow = (isLeftArrow && !isLeftActive) || (isRightArrow && !isRightActive);
      const isActivePanel = (isLeftPanel && isLeftActive) || (isRightPanel && isRightActive);

      const materials = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((material) => {
        const next = material.clone();
        next.transparent = isInactiveArrow;
        next.opacity = isInactiveArrow ? 0.22 : 1;
        next.depthWrite = true;

        if (next instanceof MeshStandardMaterial) {
          if (isActiveArrow) {
            next.color.set("#2dff8a");
            next.emissive.set("#2dff8a");
            next.emissiveIntensity = 0.95;
          } else if (isInactiveArrow) {
            next.color.set("#3a2d2d");
            next.emissive.set("#000000");
            next.emissiveIntensity = 0;
          } else if (isActivePanel) {
            next.emissive.set("#45120f");
            next.emissiveIntensity = 0.42;
          } else {
            next.emissive.set("#000000");
            next.emissiveIntensity = 0;
          }
        }

        return next;
      });

      mesh.material = Array.isArray(mesh.material) ? materials : materials[0];
    });

    return clone;
  }, [activeDirection, scene]);

  return (
    <group position={[0, -0.055, -0.92]} scale={0.68}>
      <primitive object={arrowScene} />
      <pointLight position={[activeDirection * 0.5, 1.0, 0.12]} color="#2dff8a" intensity={0.42} distance={1.25} />
    </group>
  );
}

useGLTF.preload("/models/arrow.glb");

function TugFinishFlag({ position, tone }: { position: number; tone: "warm" | "cool" }) {
  const color = tone === "warm" ? "#f7c948" : "#9bd7ff";

  return (
    <group position={[position * 0.82, 0.62, -0.44]}>
      <mesh castShadow position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.8, 12]} />
        <meshStandardMaterial color="#f4f2ea" roughness={0.42} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0.14, 0.6, 0]}>
        <boxGeometry args={[0.28, 0.2, 0.025]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.18} roughness={0.5} />
      </mesh>
      <pointLight color={color} intensity={0.42} distance={1.4} />
    </group>
  );
}

function TugToken({
  position,
  moveSeq,
  shouldWiggle,
}: {
  position: number;
  moveSeq: number;
  shouldWiggle: boolean;
}) {
  const target = useMemo(() => new Vector3(...tugPositionToVector(position)), [position]);
  const groupRef = useRef<Group>(null);
  const currentPosition = useRef(target.clone());

  useEffect(() => {
    currentPosition.current.copy(target);
    if (groupRef.current) groupRef.current.position.copy(target);
  }, []);

  useEffect(() => {
    // moveSeq intentionally marks real moves, including jumps across the center.
  }, [moveSeq]);

  useFrame(({ clock }, delta) => {
    currentPosition.current.lerp(target, Math.min(1, delta * 5.2));
    if (!groupRef.current) return;

    if (shouldWiggle && currentPosition.current.distanceTo(target) < 0.04) {
      const wave = clock.elapsedTime * 3.8;
      groupRef.current.position.set(
        currentPosition.current.x + Math.sin(wave) * 0.018,
        currentPosition.current.y + Math.sin(wave * 1.15) * 0.026,
        currentPosition.current.z + Math.cos(wave * 0.9) * 0.014,
      );
      groupRef.current.rotation.set(0, 0, Math.sin(wave * 0.8) * 0.038);
      return;
    }

    groupRef.current.position.copy(currentPosition.current);
    groupRef.current.rotation.set(0, 0, 0);
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <sphereGeometry args={[0.26, 32, 32]} />
        <meshStandardMaterial color="#f4f2ea" roughness={0.34} metalness={0.16} />
      </mesh>
      <mesh castShadow position={[0, -0.32, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.2, 0.56, 32]} />
        <meshStandardMaterial color="#cfd3d8" roughness={0.42} metalness={0.12} />
      </mesh>
    </group>
  );
}
