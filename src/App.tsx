import { ArrowLeft, Crown, Dices, History, Play, RefreshCcw, Swords } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DiceScene } from "./DiceScene";
import {
  GameState,
  WINNING_SCORE,
  applyTurnRoll,
  createInitialGame,
  updatePlayerName,
} from "./game";

const storageKey = "dicerra.game.v1";
type Route = "games" | "dice-duel";

function readRoute(): Route {
  return window.location.pathname === "/dice-duel" ? "dice-duel" : "games";
}

function readStoredGame(): GameState {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? { ...createInitialGame(), ...JSON.parse(raw) } : createInitialGame();
  } catch {
    return createInitialGame();
  }
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [game, setGame] = useState<GameState>(readStoredGame);
  const [rollToken, setRollToken] = useState(0);
  const [isRolling, setIsRolling] = useState(false);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(game));
  }, [game]);

  useEffect(() => {
    const syncRoute = () => setRoute(readRoute());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  const navigate = useCallback((nextRoute: Route) => {
    const path = nextRoute === "dice-duel" ? "/dice-duel" : "/";
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setRoute(nextRoute);
  }, []);

  const leader = useMemo(() => {
    if (game.player1Score === game.player2Score) return "tie";
    return game.player1Score > game.player2Score ? "p1" : "p2";
  }, [game.player1Score, game.player2Score]);

  const resultText = useMemo(() => {
    if (game.status === "finished") {
      return `${game.winner === "p1" ? game.player1Name : game.player2Name} wins the duel`;
    }
    if (isRolling) {
      return `${game.currentPlayer === "p1" ? game.player1Name : game.player2Name} is rolling`;
    }
    if (game.currentPlayer === "p2" && game.pendingPlayer1Roll !== undefined) {
      return `${game.player1Name} rolled ${game.pendingPlayer1Roll}. ${game.player2Name} rolls next`;
    }
    const lastRound = game.rounds[0];
    if (!lastRound) return `${game.player1Name} opens the match`;
    if (lastRound.winner === "tie") return `Tie at ${lastRound.player1Roll}. No point awarded`;
    return lastRound.winner === "p1"
      ? `${game.player1Name} won the last round`
      : `${game.player2Name} won the last round`;
  }, [game, isRolling]);

  const currentPlayerName = game.currentPlayer === "p1" ? game.player1Name : game.player2Name;
  const lastRound = game.rounds[0];
  const visibleRolls =
    game.pendingPlayer1Roll !== undefined
      ? { p1: game.pendingPlayer1Roll, p2: undefined }
      : { p1: lastRound?.player1Roll, p2: lastRound?.player2Roll };

  const roll = () => {
    if (isRolling || game.status === "finished") return;
    setRollToken((value) => value + 1);
  };

  const reset = () => {
    setGame(createInitialGame());
    setIsRolling(false);
    setRollToken(0);
  };

  const completeRoll = useCallback((roll: number) => {
    setGame((current) => applyTurnRoll(current, roll));
    setIsRolling(false);
  }, []);

  const startRoll = useCallback(() => {
    setIsRolling(true);
  }, []);

  const progress =
    (Math.max(game.player1Score, game.player2Score) / WINNING_SCORE) * 100;

  if (route === "games") {
    return <GameCatalog onSelectDiceDuel={() => navigate("dice-duel")} />;
  }

  return (
    <main className="app-shell">
      <section className="game-surface" aria-label="Dicerra game table">
        <div className="topbar">
          <div>
            <span className="eyebrow">Dicerra</span>
            <h1>Dice Duel</h1>
          </div>
          <div className="top-actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => navigate("games")}
              aria-label="Back to games"
            >
              <ArrowLeft size={19} />
            </button>
            <button className="icon-button" type="button" onClick={reset} aria-label="Restart game">
              <RefreshCcw size={19} />
            </button>
          </div>
        </div>

        <div className="score-grid">
          <PlayerPanel
            name={game.player1Name}
            score={game.player1Score}
            isActive={game.currentPlayer === "p1" || leader === "p1"}
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
            isActive={game.currentPlayer === "p2" || leader === "p2"}
            isWinner={game.winner === "p2"}
            color="cool"
            onNameChange={(name) => setGame((current) => updatePlayerName(current, "p2", name))}
          />
        </div>

        <div className="scene-wrap">
          <DiceScene
            rollToken={rollToken}
            onRollStart={startRoll}
            onRollComplete={completeRoll}
          />
          <div className="scene-hud">
            <span>{resultText}</span>
            <div className="last-rolls">
              <strong>{visibleRolls.p1 ?? "-"}</strong>
              <strong>{visibleRolls.p2 ?? "-"}</strong>
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
            {game.status === "finished"
              ? "Duel finished"
              : isRolling
                ? "Rolling..."
                : `${currentPlayerName} roll`}
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

function GameCatalog({ onSelectDiceDuel }: { onSelectDiceDuel: () => void }) {
  return (
    <main className="catalog-shell">
      <section className="catalog-header" aria-label="Dicerra games">
        <div>
          <span className="eyebrow">dice game collection</span>
          <h1>Dicerra</h1>
        </div>
        <div className="catalog-rig" aria-hidden="true">
          <span>1</span>
          <span>6</span>
          <span>3</span>
        </div>
      </section>

      <section className="games-grid" aria-label="Game list">
        <button className="game-card" type="button" onClick={onSelectDiceDuel}>
          <span className="game-card-icon">
            <Dices size={34} />
          </span>
          <span className="game-card-copy">
            <strong>Dice Duel</strong>
            <em>Turn-based duel with one physical die.</em>
          </span>
          <span className="game-card-preview" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="game-card-action">
            <Play size={18} fill="currentColor" />
          </span>
        </button>
      </section>
    </main>
  );
}

function PlayerPanel({
  name,
  score,
  isActive,
  isWinner,
  color,
  onNameChange,
}: {
  name: string;
  score: number;
  isActive: boolean;
  isWinner: boolean;
  color: "warm" | "cool";
  onNameChange: (name: string) => void;
}) {
  return (
    <div className={`player-panel ${color} ${isActive || isWinner ? "active" : ""}`}>
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
