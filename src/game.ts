export type PlayerId = "p1" | "p2";

export type Round = {
  id: string;
  player1Roll: number;
  player2Roll: number;
  winner: PlayerId | "tie";
  createdAt: string;
};

export type GameState = {
  player1Name: string;
  player2Name: string;
  player1Score: number;
  player2Score: number;
  status: "active" | "finished";
  winner?: PlayerId;
  rounds: Round[];
};

export const WINNING_SCORE = 7;

export function createInitialGame(): GameState {
  return {
    player1Name: "Player 1",
    player2Name: "Player 2",
    player1Score: 0,
    player2Score: 0,
    status: "active",
    rounds: [],
  };
}

export function compareDice(player1Roll: number, player2Roll: number): PlayerId | "tie" {
  if (player1Roll > player2Roll) return "p1";
  if (player2Roll > player1Roll) return "p2";
  return "tie";
}

export function applyRound(
  state: GameState,
  player1Roll: number,
  player2Roll: number,
): GameState {
  if (state.status === "finished") return state;

  const winner = compareDice(player1Roll, player2Roll);
  const player1Score = state.player1Score + (winner === "p1" ? 1 : 0);
  const player2Score = state.player2Score + (winner === "p2" ? 1 : 0);
  const gameWinner =
    player1Score >= WINNING_SCORE ? "p1" : player2Score >= WINNING_SCORE ? "p2" : undefined;

  return {
    ...state,
    player1Score,
    player2Score,
    status: gameWinner ? "finished" : "active",
    winner: gameWinner,
    rounds: [
      {
        id: crypto.randomUUID(),
        player1Roll,
        player2Roll,
        winner,
        createdAt: new Date().toISOString(),
      },
      ...state.rounds,
    ].slice(0, 8),
  };
}

export function updatePlayerName(
  state: GameState,
  player: PlayerId,
  name: string,
): GameState {
  const cleanName = name.trim().slice(0, 18) || (player === "p1" ? "Player 1" : "Player 2");
  return player === "p1"
    ? { ...state, player1Name: cleanName }
    : { ...state, player2Name: cleanName };
}
