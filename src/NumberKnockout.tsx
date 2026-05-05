import { ArrowLeft, Dices, Play, RefreshCcw, Sparkles, UserRound } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { PlayerId } from "./game";

export type KnockoutState = {
  player1Name: string;
  player2Name: string;
  setupComplete: boolean;
  currentPlayer: PlayerId;
  player1Cleared: number[];
  player2Cleared: number[];
  lastRoll?: number;
  lastHit?: boolean;
  message: string;
  status: "active" | "finished";
  winner?: PlayerId;
  rollCount: number;
  combo: number;
};

export type NumberKnockoutRoom = {
  id: string;
  status: "waiting" | "active" | "finished";
  players: Partial<Record<PlayerId, { id: PlayerId; name: string; socketId?: string }>>;
  game: KnockoutState;
};

const cardNumbers = [1, 2, 3, 4, 5, 6];

function createInitialKnockoutState(): KnockoutState {
  return {
    player1Name: "Player 1",
    player2Name: "Player 2",
    setupComplete: false,
    currentPlayer: "p1",
    player1Cleared: [],
    player2Cleared: [],
    message: "Set up the knockout match",
    status: "active",
    rollCount: 0,
    combo: 0,
  };
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1;
}

function applyKnockoutRoll(state: KnockoutState, roll: number): KnockoutState {
  const currentCleared = state.currentPlayer === "p1" ? state.player1Cleared : state.player2Cleared;
  const playerName = state.currentPlayer === "p1" ? state.player1Name : state.player2Name;
  const hit = !currentCleared.includes(roll);
  const nextCleared = hit ? [...currentCleared, roll].sort((a, b) => a - b) : currentCleared;
  const winner = hit && nextCleared.length === cardNumbers.length ? state.currentPlayer : undefined;
  const nextPlayer = hit ? state.currentPlayer : state.currentPlayer === "p1" ? "p2" : "p1";

  return {
    ...state,
    player1Cleared: state.currentPlayer === "p1" ? nextCleared : state.player1Cleared,
    player2Cleared: state.currentPlayer === "p2" ? nextCleared : state.player2Cleared,
    currentPlayer: winner ? state.currentPlayer : nextPlayer,
    lastRoll: roll,
    lastHit: hit,
    rollCount: state.rollCount + 1,
    combo: hit ? state.combo + 1 : 0,
    status: winner ? "finished" : "active",
    winner,
    message: winner
      ? `${playerName} cleared the last card`
      : hit
        ? `${playerName} knocked out ${roll}. Roll again`
        : `${playerName} already cleared ${roll}. Turn changed`,
  };
}

export function NumberKnockoutGame({
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
  onlineRoom?: NumberKnockoutRoom | null;
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
  const [state, setState] = useState<KnockoutState>(createInitialKnockoutState);
  const [isRolling, setIsRolling] = useState(false);
  const rollTimeoutRef = useRef<number>();
  const gameState = onlineRoom?.game ?? state;
  const rolling = isOnline ? onlineIsRolling : isRolling;

  useEffect(() => {
    return () => {
      if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    };
  }, []);

  const startGame = (player1Name: string, player2Name: string) => {
    if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    setIsRolling(false);
    setState({
      ...createInitialKnockoutState(),
      player1Name: player1Name.trim() || "Player 1",
      player2Name: player2Name.trim() || "Player 2",
      setupComplete: true,
      message: `${player1Name.trim() || "Player 1"} starts`,
    });
  };

  const resetGame = () => {
    if (isOnline) {
      onRestartOnline?.();
      return;
    }
    if (rollTimeoutRef.current) window.clearTimeout(rollTimeoutRef.current);
    setIsRolling(false);
    setState((current) => ({
      ...createInitialKnockoutState(),
      player1Name: current.player1Name,
      player2Name: current.player2Name,
      setupComplete: true,
      message: `${current.player1Name} starts`,
    }));
  };

  const roll = () => {
    if (isOnline) {
      if (onlineIsRolling || gameState.status === "finished") return;
      onRollOnline?.();
      return;
    }
    if (isRolling || gameState.status === "finished") return;
    const rollValue = rollDie();
    const playerName = gameState.currentPlayer === "p1" ? gameState.player1Name : gameState.player2Name;

    setState((current) => ({
      ...current,
      lastRoll: undefined,
      lastHit: undefined,
      message: `${playerName} is rolling`,
    }));
    setIsRolling(true);

    rollTimeoutRef.current = window.setTimeout(() => {
      setState((current) => applyKnockoutRoll(current, rollValue));
      setIsRolling(false);
      rollTimeoutRef.current = undefined;
    }, 920);
  };

  if (!gameState.setupComplete) {
    return (
      <NumberKnockoutSetup
        onBack={onBack}
        onStart={startGame}
        onlineError={onlineError}
        initialRoomId={initialRoomId}
        onCreateOnline={onCreateOnline}
        onJoinOnline={onJoinOnline}
      />
    );
  }

  const currentPlayerName = gameState.currentPlayer === "p1" ? gameState.player1Name : gameState.player2Name;
  const winnerName = gameState.winner === "p1" ? gameState.player1Name : gameState.player2Name;
  const player1Left = cardNumbers.length - gameState.player1Cleared.length;
  const player2Left = cardNumbers.length - gameState.player2Cleared.length;
  const roomWaiting = onlineRoom?.status === "waiting";
  const canRollOnline =
    isOnline &&
    onlineRoom?.status === "active" &&
    gameState.status === "active" &&
    gameState.currentPlayer === onlinePlayerId &&
    !onlineIsRolling;
  const buttonText = isOnline
    ? roomWaiting
      ? "Waiting..."
      : gameState.status === "finished"
        ? "Finished"
        : onlineIsRolling
          ? "Rolling..."
          : gameState.currentPlayer === onlinePlayerId
            ? "Your roll"
            : "Opponent turn"
    : gameState.status === "finished"
      ? "Finished"
      : isRolling
        ? "Rolling..."
        : `${currentPlayerName} roll`;

  return (
    <main className="knockout-shell">
      <section className="knockout-panel">
        <div className="topbar">
          <div>
            <span className="eyebrow">Dicerra</span>
            <h1>Number Knockout</h1>
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

        <div className="knockout-scorebar">
          <KnockoutPlayer
            name={gameState.player1Name}
            active={gameState.currentPlayer === "p1"}
            tone="warm"
            left={player1Left}
          />
          <div className="trail-roll knockout-roll">
            <KnockoutDice value={gameState.lastRoll} rolling={rolling} />
            <div className="trail-stats" aria-label="Game stats">
              <span>{gameState.combo} combo</span>
              <span>{gameState.rollCount} rolls</span>
            </div>
          </div>
          <KnockoutPlayer
            name={gameState.player2Name}
            active={gameState.currentPlayer === "p2"}
            tone="cool"
            left={player2Left}
          />
        </div>

        <div className="knockout-table">
          <KnockoutHand
            name={gameState.player1Name}
            tone="warm"
            active={gameState.currentPlayer === "p1"}
            cleared={gameState.player1Cleared}
            lastRoll={gameState.lastRoll}
            lastHit={gameState.lastHit}
            isCurrent={gameState.currentPlayer === "p1"}
          />
          <div className="knockout-center">
            <div className={`knockout-cup ${rolling ? "rolling" : ""}`}>
              <span />
              <Dices size={34} />
            </div>
            <strong>{gameState.lastRoll ?? "-"}</strong>
            <span>{gameState.lastHit === undefined ? "Roll" : gameState.lastHit ? "Hit" : "Miss"}</span>
          </div>
          <KnockoutHand
            name={gameState.player2Name}
            tone="cool"
            active={gameState.currentPlayer === "p2"}
            cleared={gameState.player2Cleared}
            lastRoll={gameState.lastRoll}
            lastHit={gameState.lastHit}
            isCurrent={gameState.currentPlayer === "p2"}
          />
        </div>

        <div className="trail-action-row">
          <p>{roomWaiting ? "Waiting for Player 2" : gameState.message}</p>
          <button
            className="roll-button"
            type="button"
            onClick={roll}
            disabled={isOnline ? !canRollOnline : isRolling || gameState.status === "finished"}
          >
            {buttonText}
          </button>
        </div>

        {gameState.status === "finished" && (
          <div
            className={`winner-overlay ${isOnline && gameState.winner !== onlinePlayerId ? "lose" : "win"}`}
            role="dialog"
            aria-label="Number Knockout winner"
          >
            {(!isOnline || gameState.winner === onlinePlayerId) && (
              <div className="confetti-strips" aria-hidden="true">
                {Array.from({ length: 22 }).map((_, index) => (
                  <span key={index} />
                ))}
              </div>
            )}
            <div className="winner-panel">
              <Sparkles size={28} />
              <span>{isOnline ? (onlinePlayerId === "p1" ? gameState.player1Name : gameState.player2Name) : winnerName}</span>
              <strong>{isOnline ? (gameState.winner === onlinePlayerId ? "You Win" : "You Lose") : "Win"}</strong>
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

function NumberKnockoutSetup({
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
      <form className="setup-panel knockout-setup" onSubmit={submit}>
        <div className="topbar">
          <div>
            <span className="eyebrow">Dicerra game setup</span>
            <h1>Number Knockout</h1>
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
          Start knockout
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

function KnockoutPlayer({
  name,
  active,
  tone,
  left,
}: {
  name: string;
  active: boolean;
  tone: "warm" | "cool";
  left: number;
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
      <span>{left} cards</span>
    </div>
  );
}

function KnockoutHand({
  name,
  tone,
  active,
  cleared,
  lastRoll,
  lastHit,
  isCurrent,
}: {
  name: string;
  tone: "warm" | "cool";
  active: boolean;
  cleared: number[];
  lastRoll?: number;
  lastHit?: boolean;
  isCurrent: boolean;
}) {
  return (
    <div className={`knockout-hand ${tone} ${active ? "active" : ""}`}>
      <div className="knockout-hand-title">
        <strong>{name}</strong>
        <span>{cleared.length}/6 cleared</span>
      </div>
      <div className="knockout-cards">
        {cardNumbers.map((number) => {
          const isCleared = cleared.includes(number);
          const isLast = isCurrent && lastRoll === number;
          return (
            <div
              key={number}
              className={`knockout-card ${isCleared ? "cleared" : ""} ${isLast ? (lastHit ? "hit" : "miss") : ""}`}
            >
              <span>{number}</span>
              <small>{isCleared ? "OUT" : number}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KnockoutDice({ value, rolling }: { value?: number; rolling: boolean }) {
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
