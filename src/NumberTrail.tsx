import { OrbitControls, Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { ArrowLeft, Dices, Move3D, Play, RefreshCcw, Rotate3D, Sparkles, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Group, MOUSE, TOUCH, Vector3 } from "three";

type PlayerId = "p1" | "p2";
type CameraMode = "rotate" | "pan";

type TrailTile = {
  index: number;
  value?: number;
  x: number;
  y: number;
};

type TrailState = {
  player1Name: string;
  player2Name: string;
  setupComplete: boolean;
  currentPlayer: PlayerId;
  positions: Record<PlayerId, number>;
  lastRoll?: number;
  message: string;
  status: "active" | "finished";
  winner?: PlayerId;
  startedAt?: number;
  finishedAt?: number;
  rollCount: number;
  moveSeq: number;
  landTileIndex?: number;
  landSeq: number;
  burnTileIndex?: number;
  burnSeq: number;
};

const trailLength = 30;

function createTrailValues() {
  const values = Array.from({ length: trailLength - 1 }, (_, index) => (index % 6) + 1);

  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }

  return values;
}

function createTrail(): TrailTile[] {
  const trailValues = createTrailValues();
  const directions = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const points: Array<[number, number]> = [[0, 0]];
  let x = 0;
  let y = 0;
  let directionIndex = 0;
  let segmentLength = 1;

  while (points.length < trailLength) {
    for (let repeat = 0; repeat < 2 && points.length < trailLength; repeat += 1) {
      const [dx, dy] = directions[directionIndex % directions.length];
      for (let step = 0; step < segmentLength && points.length < trailLength; step += 1) {
        x += dx;
        y += dy;
        points.push([x, y]);
      }
      directionIndex += 1;
    }
    segmentLength += 1;
  }

  const spacing = 76;
  return Array.from({ length: trailLength }, (_, index) => ({
    index,
    value: index === 0 ? undefined : trailValues[index - 1],
    x: 360 + points[index][0] * spacing,
    y: 360 + points[index][1] * spacing,
  }));
}

function createInitialTrailState(): TrailState {
  return {
    player1Name: "Player 1",
    player2Name: "Player 2",
    setupComplete: false,
    currentPlayer: "p1",
    positions: { p1: 0, p2: 0 },
    message: "Set up the trail race",
    status: "active",
    rollCount: 0,
    moveSeq: 0,
    landSeq: 0,
    burnSeq: 0,
  };
}

function formatElapsedTime(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function findNearestTile(tiles: TrailTile[], fromIndex: number, roll: number) {
  if (fromIndex > 0 && tiles[fromIndex]?.value === roll) return fromIndex;

  let bestIndex = fromIndex;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDirection = -1;

  for (const tile of tiles) {
    if (tile.index === 0) continue;
    if (tile.value !== roll) continue;
    const distance = Math.abs(tile.index - fromIndex);
    const direction = tile.index >= fromIndex ? 1 : -1;
    if (distance < bestDistance || (distance === bestDistance && direction > bestDirection)) {
      bestIndex = tile.index;
      bestDistance = distance;
      bestDirection = direction;
    }
  }

  return bestIndex;
}

function findNearestForwardTile(tiles: TrailTile[], fromIndex: number, roll: number) {
  let bestIndex: number | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const tile of tiles) {
    if (tile.index === 0 || tile.index <= fromIndex || tile.value !== roll) continue;
    const distance = tile.index - fromIndex;
    if (distance < bestDistance) {
      bestIndex = tile.index;
      bestDistance = distance;
    }
  }

  return bestIndex;
}

export function NumberTrailGame({ onBack }: { onBack: () => void }) {
  const [tiles, setTiles] = useState<TrailTile[]>(() => createTrail());
  const [state, setState] = useState<TrailState>(createInitialTrailState);
  const [isRolling, setIsRolling] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>("rotate");
  const [timerNow, setTimerNow] = useState(() => Date.now());
  const rollTimeoutRef = useRef<number>();
  const finishIndex = tiles.length - 1;

  useEffect(() => {
    return () => {
      if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!state.setupComplete || state.status === "finished") return undefined;
    const interval = window.setInterval(() => setTimerNow(Date.now()), 500);
    return () => window.clearInterval(interval);
  }, [state.setupComplete, state.status]);

  const startGame = (player1Name: string, player2Name: string) => {
    if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    setIsRolling(false);
    setTiles(createTrail());
    setState({
      ...createInitialTrailState(),
      player1Name: player1Name.trim() || "Player 1",
      player2Name: player2Name.trim() || "Player 2",
      setupComplete: true,
      startedAt: Date.now(),
      message: `${player1Name.trim() || "Player 1"} starts on the trail`,
    });
    setTimerNow(Date.now());
  };

  const resetGame = () => {
    if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    setIsRolling(false);
    setTiles(createTrail());
    setState((current) => ({
      ...createInitialTrailState(),
      player1Name: current.player1Name,
      player2Name: current.player2Name,
      setupComplete: true,
      startedAt: Date.now(),
      message: `${current.player1Name} starts on the trail`,
    }));
    setTimerNow(Date.now());
  };

  const roll = () => {
    if (isRolling || state.status === "finished") return;
    const player = state.currentPlayer;
    const rollValue = rollDie();
    const playerName = player === "p1" ? state.player1Name : state.player2Name;

    setState((current) => ({
      ...current,
      lastRoll: undefined,
      landTileIndex: undefined,
      burnTileIndex: undefined,
      message: `${playerName} is rolling`,
    }));
    setIsRolling(true);

    rollTimeoutRef.current = window.setTimeout(() => {
      setState((current) => {
        const currentIndex = current.positions[player];
        const nextIndex = findNearestTile(tiles, currentIndex, rollValue);
        const completedAt = Date.now();
        const winner = nextIndex >= finishIndex ? player : undefined;
        const burnTileIndex = nextIndex < currentIndex ? findNearestForwardTile(tiles, currentIndex, rollValue) : undefined;
        const burnSeq = burnTileIndex === undefined ? current.burnSeq : current.burnSeq + 1;
        const direction =
          nextIndex === currentIndex ? "stays put" : nextIndex > currentIndex ? "moves forward" : "moves back";

        return {
          ...current,
          lastRoll: rollValue,
          rollCount: current.rollCount + 1,
          positions: { ...current.positions, [player]: nextIndex },
          moveSeq: current.moveSeq + 1,
          landTileIndex: nextIndex,
          landSeq: current.landSeq + 1,
          currentPlayer: player === "p1" ? "p2" : "p1",
          status: winner ? "finished" : "active",
          winner,
          finishedAt: winner ? completedAt : undefined,
          burnTileIndex,
          burnSeq,
          message:
            currentIndex > 0 && tiles[currentIndex].value === rollValue
              ? `${playerName} rolled ${rollValue} and holds this tile`
              : `${playerName} rolled ${rollValue} and ${direction}`,
        };
      });
      setIsRolling(false);
      rollTimeoutRef.current = undefined;
    }, 920);
  };

  if (!state.setupComplete) {
    return <NumberTrailSetup onBack={onBack} onStart={startGame} />;
  }

  const currentPlayerName = state.currentPlayer === "p1" ? state.player1Name : state.player2Name;
  const winnerName = state.winner === "p1" ? state.player1Name : state.player2Name;
  const elapsedTime = formatElapsedTime((state.finishedAt ?? timerNow) - (state.startedAt ?? timerNow));

  return (
    <main className="trail-shell">
      <section className="trail-panel">
        <div className="topbar">
          <div>
            <span className="eyebrow">Dicerra</span>
            <h1>Number Trail</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" type="button" onClick={onBack} aria-label="Back to games">
              <ArrowLeft size={19} />
            </button>
            <button className="icon-button" type="button" onClick={resetGame} aria-label="Restart game">
              <RefreshCcw size={19} />
            </button>
          </div>
        </div>

        <div className="trail-scorebar">
          <TrailPlayer name={state.player1Name} position={state.positions.p1} active={state.currentPlayer === "p1"} tone="warm" />
          <div className="trail-roll">
            <TrailDice value={state.lastRoll} rolling={isRolling} />
            <TrailStats elapsedTime={elapsedTime} rollCount={state.rollCount} />
          </div>
          <TrailPlayer name={state.player2Name} position={state.positions.p2} active={state.currentPlayer === "p2"} tone="cool" />
        </div>

        <div className="trail-board-wrap">
          <div className="trail-camera-controls" aria-label="Camera controls">
            <button
              className={cameraMode === "rotate" ? "active" : ""}
              type="button"
              onClick={() => setCameraMode("rotate")}
              aria-label="Rotate camera"
              title="Rotate camera"
            >
              <Rotate3D size={17} />
            </button>
            <button
              className={cameraMode === "pan" ? "active" : ""}
              type="button"
              onClick={() => setCameraMode("pan")}
              aria-label="Pan camera"
              title="Pan camera"
            >
              <Move3D size={17} />
            </button>
          </div>
          <TrailBoard3D
            tiles={tiles}
            player1Index={state.positions.p1}
            player2Index={state.positions.p2}
            finishIndex={finishIndex}
            moveSeq={state.moveSeq}
            activePlayer={state.status === "active" ? state.currentPlayer : undefined}
            landTileIndex={state.landTileIndex}
            landSeq={state.landSeq}
            burnTileIndex={state.burnTileIndex}
            burnSeq={state.burnSeq}
            cameraMode={cameraMode}
          />
        </div>

        <div className="trail-action-row">
          <p>{state.message}</p>
          <button className="roll-button" type="button" onClick={roll} disabled={isRolling || state.status === "finished"}>
            {state.status === "finished" ? "Trail finished" : `${currentPlayerName} roll`}
          </button>
        </div>

        {state.status === "finished" && (
          <div className="winner-overlay win" role="dialog" aria-label="Number Trail winner">
            <div className="confetti-strips" aria-hidden="true">
              {Array.from({ length: 22 }).map((_, index) => (
                <span key={index} />
              ))}
            </div>
            <div className="winner-panel">
              <Sparkles size={28} />
              <span>{winnerName}</span>
              <strong>Win</strong>
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

function NumberTrailSetup({
  onBack,
  onStart,
}: {
  onBack: () => void;
  onStart: (player1Name: string, player2Name: string) => void;
}) {
  const [player1Name, setPlayer1Name] = useState("Player 1");
  const [player2Name, setPlayer2Name] = useState("Player 2");

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
            <h1>Number Trail</h1>
          </div>
          <button className="icon-button" type="button" onClick={onBack} aria-label="Back to games">
            <ArrowLeft size={19} />
          </button>
        </div>
        <div className="setup-board">
          <label className="setup-field warm">
            <span>Player 1</span>
            <input value={player1Name} maxLength={18} onChange={(event) => setPlayer1Name(event.target.value)} />
          </label>
          <label className="setup-field cool">
            <span>Player 2</span>
            <input value={player2Name} maxLength={18} onChange={(event) => setPlayer2Name(event.target.value)} />
          </label>
        </div>
        <button className="start-button" type="submit">
          <Play size={18} fill="currentColor" />
          Start trail
        </button>
      </form>
    </main>
  );
}

function TrailPlayer({
  name,
  position,
  active,
  tone,
}: {
  name: string;
  position: number;
  active: boolean;
  tone: "warm" | "cool";
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
      <span>Tile {position}</span>
    </div>
  );
}

function TrailDice({ value, rolling }: { value?: number; rolling: boolean }) {
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

function TrailStats({ elapsedTime, rollCount }: { elapsedTime: string; rollCount: number }) {
  return (
    <div className="trail-stats" aria-label="Game stats">
      <span>{elapsedTime}</span>
      <span>{rollCount} rolls</span>
    </div>
  );
}

function toBoardPosition(tile: TrailTile, offset = 0): [number, number, number] {
  return [(tile.x - 360) / 48 + offset, 0, (tile.y - 360) / 48];
}

function TrailBoard3D({
  tiles,
  player1Index,
  player2Index,
  finishIndex,
  moveSeq,
  activePlayer,
  landTileIndex,
  landSeq,
  burnTileIndex,
  burnSeq,
  cameraMode,
}: {
  tiles: TrailTile[];
  player1Index: number;
  player2Index: number;
  finishIndex: number;
  moveSeq: number;
  activePlayer?: PlayerId;
  landTileIndex?: number;
  landSeq: number;
  burnTileIndex?: number;
  burnSeq: number;
  cameraMode: CameraMode;
}) {
  return (
    <Canvas shadows camera={{ position: [0, 10.6, 10.8], fov: 43 }} dpr={[1, 2]}>
      <color attach="background" args={["#111318"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 8, 5]} intensity={2.4} castShadow />
      <spotLight position={[-5, 8, -2]} intensity={1.4} angle={0.5} penumbra={0.6} />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 0]}>
        <circleGeometry args={[9.6, 96]} />
        <meshStandardMaterial color="#171b22" roughness={0.78} metalness={0.08} />
      </mesh>
      {tiles.slice(0, -1).map((tile, index) => {
        const next = tiles[index + 1];
        const [x1, , z1] = toBoardPosition(tile);
        const [x2, , z2] = toBoardPosition(next);
        const dx = x2 - x1;
        const dz = z2 - z1;
        const length = Math.hypot(dx, dz);
        const angle = Math.atan2(dx, dz);
        return (
          <group key={`link-${tile.index}`}>
            <mesh
              position={[(x1 + x2) / 2, -0.04, (z1 + z2) / 2]}
              rotation={[0, angle, 0]}
              receiveShadow
            >
              <boxGeometry args={[0.16, 0.08, length]} />
              <meshStandardMaterial color="#594a27" roughness={0.62} metalness={0.12} />
            </mesh>
            <TrailArrow
              position={[(x1 + x2) / 2, 0.025, (z1 + z2) / 2]}
              rotationY={angle}
              sequenceIndex={index}
              sequenceTotal={tiles.length - 1}
            />
          </group>
        );
      })}
      {tiles.map((tile) => (
        <TrailTile3D
          key={tile.index}
          tile={tile}
          isFinish={tile.index === finishIndex}
          isLandTarget={tile.index === landTileIndex}
          landSeq={landSeq}
          isBurnTarget={tile.index === burnTileIndex}
          burnSeq={burnSeq}
        />
      ))}
      <TrailToken3D
        tiles={tiles}
        index={player1Index}
        tone="warm"
        offset={player1Index === player2Index ? -0.18 : 0}
        moveSeq={moveSeq}
        shouldWiggle={activePlayer === "p1"}
      />
      <TrailToken3D
        tiles={tiles}
        index={player2Index}
        tone="cool"
        offset={player1Index === player2Index ? 0.18 : 0}
        moveSeq={moveSeq}
        shouldWiggle={activePlayer === "p2"}
      />
      <OrbitControls
        enablePan
        enableRotate
        screenSpacePanning
        panSpeed={0.9}
        rotateSpeed={0.65}
        mouseButtons={{
          LEFT: cameraMode === "rotate" ? MOUSE.ROTATE : MOUSE.PAN,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: cameraMode === "rotate" ? MOUSE.PAN : MOUSE.ROTATE,
        }}
        touches={{
          ONE: cameraMode === "rotate" ? TOUCH.ROTATE : TOUCH.PAN,
          TWO: cameraMode === "rotate" ? TOUCH.DOLLY_PAN : TOUCH.DOLLY_ROTATE,
        }}
        minDistance={8.2}
        maxDistance={14.5}
        minPolarAngle={0.5}
        maxPolarAngle={1.08}
      />
    </Canvas>
  );
}

function TrailArrow({
  position,
  rotationY,
  sequenceIndex,
  sequenceTotal,
}: {
  position: [number, number, number];
  rotationY: number;
  sequenceIndex: number;
  sequenceTotal: number;
}) {
  const groupRef = useRef<Group>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const arrowPosition = sequenceIndex / Math.max(1, sequenceTotal);
    const wavePosition = (clock.elapsedTime * 0.08) % 1;
    const forwardDistance = (arrowPosition - wavePosition + 1) % 1;
    const pulse = forwardDistance < 0.08 ? 0.96 - forwardDistance * 4.2 : 0.18;
    groupRef.current.children.forEach((child) => {
      const mesh = child as { material?: { opacity?: number } };
      if (mesh.material) mesh.material.opacity = pulse;
    });
  });

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[-0.035, 0, 0.026]} rotation={[0, 0.64, 0]}>
        <boxGeometry args={[0.024, 0.012, 0.14]} />
        <meshBasicMaterial color="#ff3b30" transparent opacity={0.78} />
      </mesh>
      <mesh position={[0.035, 0, 0.026]} rotation={[0, -0.64, 0]}>
        <boxGeometry args={[0.024, 0.012, 0.14]} />
        <meshBasicMaterial color="#ff3b30" transparent opacity={0.78} />
      </mesh>
    </group>
  );
}

function TrailTile3D({
  tile,
  isFinish,
  isLandTarget,
  landSeq,
  isBurnTarget,
  burnSeq,
}: {
  tile: TrailTile;
  isFinish: boolean;
  isLandTarget: boolean;
  landSeq: number;
  isBurnTarget: boolean;
  burnSeq: number;
}) {
  const [x, y, z] = toBoardPosition(tile);
  const color = isFinish
    ? "#f7c948"
    : tile.index === 0
      ? "#6f7480"
      : tile.value === 1 || tile.value === 4
      ? "#8a6f28"
      : tile.value === 2 || tile.value === 5
        ? "#326b86"
        : "#884f35";
  return (
    <group position={[x, y, z]}>
      {isLandTarget && <TrailTileGlow key={`land-${landSeq}`} tone="land" />}
      {isBurnTarget && <TrailTileGlow key={`burn-${burnSeq}`} tone="burn" />}
      {tile.index === 0 && <TrailFlag tone="start" />}
      {isFinish && <TrailFlag tone="finish" />}
      <mesh castShadow receiveShadow position={[0, 0.1, 0]}>
        <boxGeometry args={[0.62, isFinish ? 0.32 : 0.24, 0.62]} />
        <meshStandardMaterial
          color={isBurnTarget ? "#8f2d2a" : isLandTarget ? "#237a4a" : color}
          emissive={isBurnTarget ? "#ff3b30" : isLandTarget ? "#2dff8a" : "#000000"}
          emissiveIntensity={isBurnTarget || isLandTarget ? 0.62 : 0}
          roughness={0.48}
          metalness={0.12}
        />
      </mesh>
      <Text
        position={[0, isFinish ? 0.33 : 0.28, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.27}
        color="#f4f2ea"
        anchorX="center"
        anchorY="middle"
        outlineColor="#111318"
        outlineWidth={0.025}
      >
        {tile.index === 0 ? "S" : tile.value}
      </Text>
    </group>
  );
}

function TrailFlag({ tone }: { tone: "start" | "finish" }) {
  const flagColor = tone === "start" ? "#f7c948" : "#2dff8a";
  const flagGlow = tone === "start" ? "#d29b22" : "#1ccf6d";

  return (
    <group position={[0.28, 0.42, -0.18]}>
      <mesh castShadow position={[0, 0.34, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.68, 12]} />
        <meshStandardMaterial color="#f4f2ea" roughness={0.42} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0.13, 0.52, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.26, 0.18, 0.025]} />
        <meshStandardMaterial color={flagColor} emissive={flagGlow} emissiveIntensity={0.22} roughness={0.5} />
      </mesh>
      <pointLight color={flagColor} intensity={0.48} distance={1.2} />
    </group>
  );
}

function TrailTileGlow({ tone }: { tone: "burn" | "land" }) {
  const groupRef = useRef<Group>(null);
  const startedAt = useRef<number>();
  const color = tone === "burn" ? "#ff3b30" : "#2dff8a";

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
      <pointLight color={color} intensity={1.15} distance={1.6} />
    </group>
  );
}

function TrailToken3D({
  tiles,
  index,
  tone,
  offset,
  moveSeq,
  shouldWiggle,
}: {
  tiles: TrailTile[];
  index: number;
  tone: "warm" | "cool";
  offset: number;
  moveSeq: number;
  shouldWiggle: boolean;
}) {
  const target = useMemo(() => {
    const [x, , z] = toBoardPosition(tiles[index], offset);
    return new Vector3(x, 0.72, z);
  }, [index, offset, tiles]);
  const groupRef = useRef<Group>(null);
  const currentPosition = useRef(target.clone());
  const currentIndex = useRef(index);
  const path = useRef<Vector3[]>([]);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.copy(currentPosition.current);
    }
  }, []);

  useEffect(() => {
    const from = currentIndex.current;
    const to = index;
    let nextPath: Vector3[] = [];

    if (from === to) {
      nextPath = [target.clone()];
    } else {
      const step = to > from ? 1 : -1;
      for (let tileIndex = from + step; step > 0 ? tileIndex <= to : tileIndex >= to; tileIndex += step) {
        const [tileX, , tileZ] = toBoardPosition(tiles[tileIndex], offset);
        nextPath.push(new Vector3(tileX, 0.72, tileZ));
      }
    }

    path.current = nextPath;
    currentIndex.current = to;
  }, [index, moveSeq, offset, target, tiles]);

  useFrame(({ clock }, delta) => {
    const nextTarget = path.current[0] ?? target;
    currentPosition.current.lerp(nextTarget, Math.min(1, delta * 6.4));
    if (currentPosition.current.distanceTo(nextTarget) < 0.035) {
      currentPosition.current.copy(nextTarget);
      path.current.shift();
    }
    if (!groupRef.current) return;

    if (shouldWiggle && path.current.length === 0) {
      const wave = clock.elapsedTime * 3.2;
      groupRef.current.position.set(
        currentPosition.current.x + Math.sin(wave) * 0.012,
        currentPosition.current.y + Math.sin(wave * 1.15) * 0.018,
        currentPosition.current.z + Math.cos(wave * 0.9) * 0.009,
      );
      groupRef.current.rotation.set(0, 0, Math.sin(wave * 0.8) * 0.025);
      return;
    }

    groupRef.current.position.copy(currentPosition.current);
    groupRef.current.rotation.set(0, 0, 0);
  });

  return (
    <group ref={groupRef}>
      <mesh castShadow>
        <sphereGeometry args={[0.22, 32, 32]} />
        <meshStandardMaterial color={tone === "warm" ? "#f7c948" : "#9bd7ff"} roughness={0.38} metalness={0.18} />
      </mesh>
      <mesh castShadow position={[0, -0.28, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.18, 0.5, 32]} />
        <meshStandardMaterial color={tone === "warm" ? "#e7a928" : "#65b9ef"} roughness={0.42} metalness={0.12} />
      </mesh>
    </group>
  );
}
