import { Crown, History, RefreshCcw, Swords } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DiceScene } from "./DiceScene";
import {
  GameState,
  WINNING_SCORE,
  applyRound,
  createInitialGame,
  updatePlayerName,
} from "./game";

const storageKey = "dicerra.game.v1";

function readStoredGame(): GameState {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? { ...createInitialGame(), ...JSON.parse(raw) } : createInitialGame();
  } catch {
    return createInitialGame();
  }
}

export function App() {
  const [game, setGame] = useState<GameState>(readStoredGame);
  const [rollToken, setRollToken] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [lastRoll, setLastRoll] = useState<{ p1: number; p2: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(game));
  }, [game]);

  const leader = useMemo(() => {
    if (game.player1Score === game.player2Score) return "tie";
    return game.player1Score > game.player2Score ? "p1" : "p2";
  }, [game.player1Score, game.player2Score]);

  const resultText = useMemo(() => {
    if (game.status === "finished") {
      return `${game.winner === "p1" ? game.player1Name : game.player2Name} wins the duel`;
    }
    if (!lastRoll) return "Roll the dice to open the match";
    if (lastRoll.p1 === lastRoll.p2) return `Tie at ${lastRoll.p1}. No point awarded`;
    return lastRoll.p1 > lastRoll.p2
      ? `${game.player1Name} wins the round`
      : `${game.player2Name} wins the round`;
  }, [game, lastRoll]);

  const roll = () => {
    if (isRolling || game.status === "finished") return;
    setRollToken((value) => value + 1);
  };

  const reset = () => {
    setGame(createInitialGame());
    setLastRoll(null);
    setIsRolling(false);
    setRollToken(0);
  };

  const completeRoll = useCallback((p1: number, p2: number) => {
    setLastRoll({ p1, p2 });
    setGame((current) => applyRound(current, p1, p2));
    setIsRolling(false);
  }, []);

  const progress =
    (Math.max(game.player1Score, game.player2Score) / WINNING_SCORE) * 100;

  return (
    <main className="app-shell">
      <section className="game-surface" aria-label="Dicerra game table">
        <div className="topbar">
          <div>
            <span className="eyebrow">Dicerra</span>
            <h1>Dice Duel</h1>
          </div>
          <button className="icon-button" type="button" onClick={reset} aria-label="Restart game">
            <RefreshCcw size={19} />
          </button>
        </div>

        <div className="score-grid">
          <PlayerPanel
            name={game.player1Name}
            score={game.player1Score}
            isLeader={leader === "p1"}
            isWinner={game.winner === "p1"}
            color="warm"
            onNameChange={(name) => setGame((current) => updatePlayerName(current, "p1", name))}
          />
          <div className="versus">
            <Swords size={18} />
            <span>{WINNING_SCORE}</span>
          </div>
          <PlayerPanel
            name={game.player2Name}
            score={game.player2Score}
            isLeader={leader === "p2"}
            isWinner={game.winner === "p2"}
            color="cool"
            onNameChange={(name) => setGame((current) => updatePlayerName(current, "p2", name))}
          />
        </div>

        <div className="scene-wrap">
          <DiceScene
            rollToken={rollToken}
            onRollStart={() => setIsRolling(true)}
            onRollComplete={completeRoll}
          />
          <div className="scene-hud">
            <span>{isRolling ? "Physics rolling" : resultText}</span>
            <div className="last-rolls">
              <strong>{lastRoll?.p1 ?? "-"}</strong>
              <strong>{lastRoll?.p2 ?? "-"}</strong>
            </div>
          </div>
        </div>

        <div className="action-row">
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: `${progress}%` }} />
          </div>
          <button
            className="roll-button"
            type="button"
            onClick={roll}
            disabled={isRolling || game.status === "finished"}
          >
            {game.status === "finished" ? "Duel finished" : isRolling ? "Rolling..." : "Roll dice"}
          </button>
        </div>
      </section>

      <aside className="side-panel" aria-label="Round history">
        <div className="history-title">
          <History size={18} />
          <h2>Rounds</h2>
        </div>
        <div className="round-list">
          {game.rounds.length === 0 ? (
            <p className="empty">No rounds yet</p>
          ) : (
            game.rounds.map((round, index) => (
              <div className="round-item" key={round.id}>
                <span>#{game.rounds.length - index}</span>
                <strong>
                  {round.player1Roll} : {round.player2Roll}
                </strong>
                <em>
                  {round.winner === "tie"
                    ? "Tie"
                    : round.winner === "p1"
                      ? game.player1Name
                      : game.player2Name}
                </em>
              </div>
            ))
          )}
        </div>
      </aside>
    </main>
  );
}

function PlayerPanel({
  name,
  score,
  isLeader,
  isWinner,
  color,
  onNameChange,
}: {
  name: string;
  score: number;
  isLeader: boolean;
  isWinner: boolean;
  color: "warm" | "cool";
  onNameChange: (name: string) => void;
}) {
  return (
    <div className={`player-panel ${color} ${isLeader || isWinner ? "active" : ""}`}>
      <input
        aria-label={`${name} name`}
        value={name}
        maxLength={18}
        onChange={(event) => onNameChange(event.target.value)}
      />
      <div className="score-line">
        <strong>{score}</strong>
        {isWinner && <Crown size={20} />}
      </div>
    </div>
  );
}
