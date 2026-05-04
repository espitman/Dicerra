import { OrbitControls, Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { ArrowLeft, Dices, Play, RefreshCcw, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Group, Vector3 } from "three";

type PlayerId = "p1" | "p2";

type TrailTile = {
  index: number;
  value: number;
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
  moveSeq: number;
};

const trailLength = 30;

function createTrailValues() {
  const values = Array.from({ length: trailLength }, (_, index) => (index % 6) + 1);

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

  while (points.length < trailValues.length) {
    for (let repeat = 0; repeat < 2 && points.length < trailValues.length; repeat += 1) {
      const [dx, dy] = directions[directionIndex % directions.length];
      for (let step = 0; step < segmentLength && points.length < trailValues.length; step += 1) {
        x += dx;
        y += dy;
        points.push([x, y]);
      }
      directionIndex += 1;
    }
    segmentLength += 1;
  }

  const spacing = 76;
  return trailValues.map((value, index) => ({
    index,
    value,
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
    moveSeq: 0,
  };
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

export function NumberTrailGame({ onBack }: { onBack: () => void }) {
  const [tiles, setTiles] = useState<TrailTile[]>(() => createTrail());
  const [state, setState] = useState<TrailState>(createInitialTrailState);
  const finishIndex = tiles.length - 1;

  const startGame = (player1Name: string, player2Name: string) => {
    setTiles(createTrail());
    setState({
      ...createInitialTrailState(),
      player1Name: player1Name.trim() || "Player 1",
      player2Name: player2Name.trim() || "Player 2",
      setupComplete: true,
      message: `${player1Name.trim() || "Player 1"} starts on the trail`,
    });
  };

  const resetGame = () => {
    setTiles(createTrail());
    setState((current) => ({
      ...createInitialTrailState(),
      player1Name: current.player1Name,
      player2Name: current.player2Name,
      setupComplete: true,
      message: `${current.player1Name} starts on the trail`,
    }));
  };

  const roll = () => {
    if (state.status === "finished") return;
    const player = state.currentPlayer;
    const rollValue = rollDie();
    const currentIndex = state.positions[player];
    const nextIndex = findNearestTile(tiles, currentIndex, rollValue);
    const winner = nextIndex >= finishIndex ? player : undefined;
    const playerName = player === "p1" ? state.player1Name : state.player2Name;
    const direction =
      nextIndex === currentIndex ? "stays put" : nextIndex > currentIndex ? "moves forward" : "moves back";

    setState((current) => ({
      ...current,
      lastRoll: rollValue,
      positions: { ...current.positions, [player]: nextIndex },
      moveSeq: current.moveSeq + 1,
      currentPlayer: player === "p1" ? "p2" : "p1",
      status: winner ? "finished" : "active",
      winner,
      message:
        currentIndex > 0 && tiles[currentIndex].value === rollValue
          ? `${playerName} rolled ${rollValue} and holds this tile`
          : `${playerName} rolled ${rollValue} and ${direction}`,
    }));
  };

  if (!state.setupComplete) {
    return <NumberTrailSetup onBack={onBack} onStart={startGame} />;
  }

  const currentPlayerName = state.currentPlayer === "p1" ? state.player1Name : state.player2Name;
  const winnerName = state.winner === "p1" ? state.player1Name : state.player2Name;

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
            <TrailDice value={state.lastRoll} />
          </div>
          <TrailPlayer name={state.player2Name} position={state.positions.p2} active={state.currentPlayer === "p2"} tone="cool" />
        </div>

        <div className="trail-board-wrap">
          <TrailBoard3D
            tiles={tiles}
            player1Index={state.positions.p1}
            player2Index={state.positions.p2}
            finishIndex={finishIndex}
            moveSeq={state.moveSeq}
          />
        </div>

        <div className="trail-action-row">
          <p>{state.message}</p>
          <button className="roll-button" type="button" onClick={roll} disabled={state.status === "finished"}>
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
      <strong>{name}</strong>
      <span>Tile {position}</span>
    </div>
  );
}

function TrailDice({ value }: { value?: number }) {
  return (
    <div className={`trail-dice-face value-${value ?? 1} ${value ? "" : "empty"}`}>
      {value ? Array.from({ length: value }).map((_, index) => <i key={index} />) : <Dices size={26} />}
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
}: {
  tiles: TrailTile[];
  player1Index: number;
  player2Index: number;
  finishIndex: number;
  moveSeq: number;
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
              position={[(x1 + x2) / 2, 0.1, (z1 + z2) / 2]}
              rotation={[Math.PI / 2, 0, -angle]}
            />
          </group>
        );
      })}
      {tiles.map((tile) => (
        <TrailTile3D key={tile.index} tile={tile} isFinish={tile.index === finishIndex} />
      ))}
      <TrailToken3D
        tiles={tiles}
        index={player1Index}
        tone="warm"
        offset={player1Index === player2Index ? -0.18 : 0}
        moveSeq={moveSeq}
      />
      <TrailToken3D
        tiles={tiles}
        index={player2Index}
        tone="cool"
        offset={player1Index === player2Index ? 0.18 : 0}
        moveSeq={moveSeq}
      />
      <OrbitControls enablePan={false} minDistance={8.2} maxDistance={14.5} minPolarAngle={0.5} maxPolarAngle={1.08} />
    </Canvas>
  );
}

function TrailArrow({
  position,
  rotation,
}: {
  position: [number, number, number];
  rotation: [number, number, number];
}) {
  return (
    <mesh position={position} rotation={rotation}>
      <coneGeometry args={[0.12, 0.32, 3]} />
      <meshStandardMaterial color="#f7c948" roughness={0.5} metalness={0.08} />
    </mesh>
  );
}

function TrailTile3D({ tile, isFinish }: { tile: TrailTile; isFinish: boolean }) {
  const [x, y, z] = toBoardPosition(tile);
  const color = isFinish
    ? "#f7c948"
    : tile.value === 1 || tile.value === 4
      ? "#8a6f28"
      : tile.value === 2 || tile.value === 5
        ? "#326b86"
        : "#884f35";
  return (
    <group position={[x, y, z]}>
      <mesh castShadow receiveShadow position={[0, 0.1, 0]}>
        <boxGeometry args={[0.62, isFinish ? 0.32 : 0.24, 0.62]} />
        <meshStandardMaterial color={color} roughness={0.48} metalness={0.12} />
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
        {tile.index === 0 ? "S" : isFinish ? "F" : tile.value}
      </Text>
    </group>
  );
}

function TrailToken3D({
  tiles,
  index,
  tone,
  offset,
  moveSeq,
}: {
  tiles: TrailTile[];
  index: number;
  tone: "warm" | "cool";
  offset: number;
  moveSeq: number;
}) {
  const [x, , z] = toBoardPosition(tiles[index], offset);
  const target = new Vector3(x, 0.72, z);
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
    if (from === to) {
      path.current = [target.clone()];
      return;
    }

    const step = to > from ? 1 : -1;
    const nextPath: Vector3[] = [];
    for (let tileIndex = from + step; step > 0 ? tileIndex <= to : tileIndex >= to; tileIndex += step) {
      const [tileX, , tileZ] = toBoardPosition(tiles[tileIndex], offset);
      nextPath.push(new Vector3(tileX, 0.72, tileZ));
    }
    path.current = nextPath;
    currentIndex.current = to;
  }, [index, moveSeq, offset, target, tiles]);

  useFrame((_state, delta) => {
    const nextTarget = path.current[0] ?? target;
    currentPosition.current.lerp(nextTarget, Math.min(1, delta * 6.4));
    if (currentPosition.current.distanceTo(nextTarget) < 0.035) {
      currentPosition.current.copy(nextTarget);
      path.current.shift();
    }
    groupRef.current?.position.copy(currentPosition.current);
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
