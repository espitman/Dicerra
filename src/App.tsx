import { ArrowLeft, Crown, Dices, Hand, History, Map, Play, RefreshCcw, Sparkles, Swords, Trophy } from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { DiceScene } from "./DiceScene";
import { DiceTugGame, type DiceTugRoom } from "./DiceTug";
import { NumberKnockoutGame, type NumberKnockoutRoom } from "./NumberKnockout";
import { NumberTrailGame, type NumberTrailRoom } from "./NumberTrail";
import {
  GameState,
  PlayerId,
  applyTurnRoll,
  createInitialGame,
  updatePlayerName,
} from "./game";

const storageKey = "dicerra.game.v1";
const socketUrl =
  import.meta.env.VITE_SOCKET_URL ??
  window.location.origin;
const onlineResultHoldMs = 2000;
type Route =
  | "games"
  | "dice-duel"
  | "online-room"
  | "number-trail"
  | "number-trail-room"
  | "dice-tug"
  | "dice-tug-room"
  | "number-knockout"
  | "number-knockout-room";

type PublicRoom = {
  id: string;
  status: "waiting" | "active" | "finished";
  players: Partial<Record<PlayerId, { id: PlayerId; name: string; socketId?: string }>>;
  game: GameState;
};

function readRoute(): Route {
  if (window.location.pathname.startsWith("/dice-duel/room/")) return "online-room";
  if (window.location.pathname.startsWith("/number-trail/room/")) return "number-trail-room";
  if (window.location.pathname.startsWith("/dice-tug/room/")) return "dice-tug-room";
  if (window.location.pathname.startsWith("/number-knockout/room/")) return "number-knockout-room";
  if (window.location.pathname === "/number-trail") return "number-trail";
  if (window.location.pathname === "/dice-tug") return "dice-tug";
  if (window.location.pathname === "/number-knockout") return "number-knockout";
  return window.location.pathname === "/dice-duel" ? "dice-duel" : "games";
}

function readRouteRoomId() {
  return (
    window.location.pathname.match(/^\/dice-duel\/room\/([^/]+)/)?.[1]?.toUpperCase() ??
    window.location.pathname.match(/^\/number-trail\/room\/([^/]+)/)?.[1]?.toUpperCase() ??
    window.location.pathname.match(/^\/dice-tug\/room\/([^/]+)/)?.[1]?.toUpperCase() ??
    window.location.pathname.match(/^\/number-knockout\/room\/([^/]+)/)?.[1]?.toUpperCase() ??
    ""
  );
}

function readStoredGame(): GameState {
  try {
    const raw = localStorage.getItem(storageKey);
    const stored = raw ? JSON.parse(raw) : {};
    return { ...createInitialGame(), ...stored, setupComplete: false };
  } catch {
    return createInitialGame();
  }
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [routeRoomId, setRouteRoomId] = useState(readRouteRoomId);
  const [game, setGame] = useState<GameState>(readStoredGame);
  const [rollToken, setRollToken] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [displayRolls, setDisplayRolls] = useState<{ p1?: number; p2?: number }>({});
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineRoom, setOnlineRoom] = useState<PublicRoom | null>(null);
  const [onlinePlayerId, setOnlinePlayerId] = useState<PlayerId | null>(null);
  const [onlineRollToken, setOnlineRollToken] = useState(0);
  const [onlineRollingPlayerId, setOnlineRollingPlayerId] = useState<PlayerId | null>(null);
  const [onlineResultRoll, setOnlineResultRoll] = useState<number | undefined>();
  const [onlineDisplayRolls, setOnlineDisplayRolls] = useState<{ p1?: number; p2?: number }>({});
  const [onlineIsRolling, setOnlineIsRolling] = useState(false);
  const [onlineError, setOnlineError] = useState("");
  const [trailOnlineRoom, setTrailOnlineRoom] = useState<NumberTrailRoom | null>(null);
  const [trailOnlinePlayerId, setTrailOnlinePlayerId] = useState<PlayerId | null>(null);
  const [trailOnlineIsRolling, setTrailOnlineIsRolling] = useState(false);
  const [trailOnlineError, setTrailOnlineError] = useState("");
  const [tugOnlineRoom, setTugOnlineRoom] = useState<DiceTugRoom | null>(null);
  const [tugOnlinePlayerId, setTugOnlinePlayerId] = useState<PlayerId | null>(null);
  const [tugOnlineIsRolling, setTugOnlineIsRolling] = useState(false);
  const [tugOnlineError, setTugOnlineError] = useState("");
  const [knockoutOnlineRoom, setKnockoutOnlineRoom] = useState<NumberKnockoutRoom | null>(null);
  const [knockoutOnlinePlayerId, setKnockoutOnlinePlayerId] = useState<PlayerId | null>(null);
  const [knockoutOnlineIsRolling, setKnockoutOnlineIsRolling] = useState(false);
  const [knockoutOnlineError, setKnockoutOnlineError] = useState("");
  const onlineRollingRef = useRef(false);
  const onlineResultTimer = useRef<number | undefined>();
  const trailOnlineRollingRef = useRef(false);
  const tugOnlineRollingRef = useRef(false);
  const knockoutOnlineRollingRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(game));
  }, [game]);

  useEffect(() => {
    const syncRoute = () => {
      setRoute(readRoute());
      setRouteRoomId(readRouteRoomId());
    };
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  useEffect(() => {
    const nextSocket = io(socketUrl, { autoConnect: true });
    setSocket(nextSocket);

    nextSocket.on("room-state", (room: PublicRoom) => {
      if (!onlineRollingRef.current) setOnlineRoom(room);
    });
    nextSocket.on("roll-start", ({ playerId }: { playerId: PlayerId }) => {
      window.clearTimeout(onlineResultTimer.current);
      onlineRollingRef.current = true;
      setOnlineRollingPlayerId(playerId);
      setOnlineResultRoll(undefined);
      if (playerId === "p1") {
        setOnlineDisplayRolls({});
      }
      setOnlineIsRolling(true);
      setOnlineRollToken((value) => value + 1);
    });
    nextSocket.on("roll-result", ({ playerId, roll, room }: { playerId: PlayerId; roll: number; room: PublicRoom }) => {
      setOnlineResultRoll(roll);
      setOnlineDisplayRolls((rolls) =>
        playerId === "p1" ? { p1: roll } : { ...rolls, p2: roll },
      );
      window.clearTimeout(onlineResultTimer.current);
      onlineResultTimer.current = window.setTimeout(() => {
        setOnlineRoom(room);
        setOnlineIsRolling(false);
        setOnlineRollingPlayerId(null);
        setOnlineResultRoll(undefined);
        onlineRollingRef.current = false;
      }, onlineResultHoldMs);
    });
    nextSocket.on("number-trail-room-state", (room: NumberTrailRoom) => {
      if (!trailOnlineRollingRef.current) setTrailOnlineRoom(room);
    });
    nextSocket.on("number-trail-roll-start", () => {
      trailOnlineRollingRef.current = true;
      setTrailOnlineIsRolling(true);
    });
    nextSocket.on("number-trail-roll-result", ({ room }: { playerId: PlayerId; roll: number; room: NumberTrailRoom }) => {
      setTrailOnlineRoom(room);
      setTrailOnlineIsRolling(false);
      trailOnlineRollingRef.current = false;
    });
    nextSocket.on("dice-tug-room-state", (room: DiceTugRoom) => {
      if (!tugOnlineRollingRef.current) setTugOnlineRoom(room);
    });
    nextSocket.on("dice-tug-roll-start", () => {
      tugOnlineRollingRef.current = true;
      setTugOnlineIsRolling(true);
    });
    nextSocket.on("dice-tug-roll-result", ({ room }: { playerId: PlayerId; roll: number; room: DiceTugRoom }) => {
      setTugOnlineRoom(room);
      setTugOnlineIsRolling(false);
      tugOnlineRollingRef.current = false;
    });
    nextSocket.on("number-knockout-room-state", (room: NumberKnockoutRoom) => {
      if (!knockoutOnlineRollingRef.current) setKnockoutOnlineRoom(room);
    });
    nextSocket.on("number-knockout-roll-start", () => {
      knockoutOnlineRollingRef.current = true;
      setKnockoutOnlineIsRolling(true);
    });
    nextSocket.on("number-knockout-roll-result", ({ room }: { playerId: PlayerId; roll: number; room: NumberKnockoutRoom }) => {
      setKnockoutOnlineRoom(room);
      setKnockoutOnlineIsRolling(false);
      knockoutOnlineRollingRef.current = false;
    });

    return () => {
      window.clearTimeout(onlineResultTimer.current);
      nextSocket.disconnect();
    };
  }, []);

  const navigate = useCallback((nextRoute: Route, roomId?: string) => {
    const path =
      nextRoute === "dice-duel"
        ? "/dice-duel"
        : nextRoute === "number-trail"
          ? "/number-trail"
        : nextRoute === "dice-tug"
          ? "/dice-tug"
        : nextRoute === "number-knockout"
          ? "/number-knockout"
        : nextRoute === "number-knockout-room"
          ? `/number-knockout/room/${roomId ?? ""}`
        : nextRoute === "dice-tug-room"
          ? `/dice-tug/room/${roomId ?? ""}`
        : nextRoute === "number-trail-room"
          ? `/number-trail/room/${roomId ?? ""}`
        : nextRoute === "online-room"
          ? `/dice-duel/room/${roomId ?? ""}`
          : "/";
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
    setRoute(nextRoute);
    setRouteRoomId(roomId ?? "");
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
  const visibleRolls = displayRolls;

  const roll = () => {
    if (isRolling || game.status === "finished") return;
    if (game.currentPlayer === "p1") {
      setDisplayRolls({});
    }
    setRollToken((value) => value + 1);
  };

  const reset = () => {
    setGame(
      createInitialGame({
        player1Name: game.player1Name,
        player2Name: game.player2Name,
        targetScore: game.targetScore,
        setupComplete: game.setupComplete,
      }),
    );
    setDisplayRolls({});
    setIsRolling(false);
    setRollToken(0);
  };

  const configureMatch = (player1Name: string, player2Name: string, targetScore: number) => {
    setGame(
      createInitialGame({
        player1Name,
        player2Name,
        targetScore,
        setupComplete: true,
      }),
    );
    setDisplayRolls({});
    setIsRolling(false);
    setRollToken(0);
  };

  const createOnlineRoom = (playerName: string, targetScore: number) => {
    if (!socket) {
      setOnlineError("Online server is not connected");
      return;
    }
    socket.emit(
      "create-room",
      { playerName, targetScore },
      (response: { ok: boolean; error?: string; room?: PublicRoom; playerId?: PlayerId }) => {
        if (!response.ok || !response.room || !response.playerId) {
          setOnlineError(response.error ?? "Could not create room");
          return;
        }
        setOnlineError("");
        setOnlineRoom(response.room);
        setOnlinePlayerId(response.playerId);
        navigate("online-room", response.room.id);
      },
    );
  };

  const joinOnlineRoom = (roomId: string, playerName: string) => {
    if (!socket) {
      setOnlineError("Online server is not connected");
      return;
    }
    socket.emit(
      "join-room",
      { roomId, playerName },
      (response: { ok: boolean; error?: string; room?: PublicRoom; playerId?: PlayerId }) => {
        if (!response.ok || !response.room || !response.playerId) {
          setOnlineError(response.error ?? "Could not join room");
          return;
        }
        setOnlineError("");
        setOnlineRoom(response.room);
        setOnlinePlayerId(response.playerId);
        navigate("online-room", response.room.id);
      },
    );
  };

  const createNumberTrailOnlineRoom = (playerName: string) => {
    if (!socket) {
      setTrailOnlineError("Online server is not connected");
      return;
    }
    socket.emit(
      "create-number-trail-room",
      { playerName },
      (response: { ok: boolean; error?: string; room?: NumberTrailRoom; playerId?: PlayerId }) => {
        if (!response.ok || !response.room || !response.playerId) {
          setTrailOnlineError(response.error ?? "Could not create room");
          return;
        }
        setTrailOnlineError("");
        setTrailOnlineRoom(response.room);
        setTrailOnlinePlayerId(response.playerId);
        setTrailOnlineIsRolling(false);
        trailOnlineRollingRef.current = false;
        navigate("number-trail-room", response.room.id);
      },
    );
  };

  const joinNumberTrailOnlineRoom = (roomId: string, playerName: string) => {
    if (!socket) {
      setTrailOnlineError("Online server is not connected");
      return;
    }
    socket.emit(
      "join-number-trail-room",
      { roomId, playerName },
      (response: { ok: boolean; error?: string; room?: NumberTrailRoom; playerId?: PlayerId }) => {
        if (!response.ok || !response.room || !response.playerId) {
          setTrailOnlineError(response.error ?? "Could not join room");
          return;
        }
        setTrailOnlineError("");
        setTrailOnlineRoom(response.room);
        setTrailOnlinePlayerId(response.playerId);
        setTrailOnlineIsRolling(false);
        trailOnlineRollingRef.current = false;
        navigate("number-trail-room", response.room.id);
      },
    );
  };

  const createDiceTugOnlineRoom = (playerName: string) => {
    if (!socket) {
      setTugOnlineError("Online server is not connected");
      return;
    }
    socket.emit(
      "create-dice-tug-room",
      { playerName },
      (response: { ok: boolean; error?: string; room?: DiceTugRoom; playerId?: PlayerId }) => {
        if (!response.ok || !response.room || !response.playerId) {
          setTugOnlineError(response.error ?? "Could not create room");
          return;
        }
        setTugOnlineError("");
        setTugOnlineRoom(response.room);
        setTugOnlinePlayerId(response.playerId);
        setTugOnlineIsRolling(false);
        tugOnlineRollingRef.current = false;
        navigate("dice-tug-room", response.room.id);
      },
    );
  };

  const joinDiceTugOnlineRoom = (roomId: string, playerName: string) => {
    if (!socket) {
      setTugOnlineError("Online server is not connected");
      return;
    }
    socket.emit(
      "join-dice-tug-room",
      { roomId, playerName },
      (response: { ok: boolean; error?: string; room?: DiceTugRoom; playerId?: PlayerId }) => {
        if (!response.ok || !response.room || !response.playerId) {
          setTugOnlineError(response.error ?? "Could not join room");
          return;
        }
        setTugOnlineError("");
        setTugOnlineRoom(response.room);
        setTugOnlinePlayerId(response.playerId);
        setTugOnlineIsRolling(false);
        tugOnlineRollingRef.current = false;
        navigate("dice-tug-room", response.room.id);
      },
    );
  };

  const createNumberKnockoutOnlineRoom = (playerName: string) => {
    if (!socket) {
      setKnockoutOnlineError("Online server is not connected");
      return;
    }
    socket.emit(
      "create-number-knockout-room",
      { playerName },
      (response: { ok: boolean; error?: string; room?: NumberKnockoutRoom; playerId?: PlayerId }) => {
        if (!response.ok || !response.room || !response.playerId) {
          setKnockoutOnlineError(response.error ?? "Could not create room");
          return;
        }
        setKnockoutOnlineError("");
        setKnockoutOnlineRoom(response.room);
        setKnockoutOnlinePlayerId(response.playerId);
        setKnockoutOnlineIsRolling(false);
        knockoutOnlineRollingRef.current = false;
        navigate("number-knockout-room", response.room.id);
      },
    );
  };

  const joinNumberKnockoutOnlineRoom = (roomId: string, playerName: string) => {
    if (!socket) {
      setKnockoutOnlineError("Online server is not connected");
      return;
    }
    socket.emit(
      "join-number-knockout-room",
      { roomId, playerName },
      (response: { ok: boolean; error?: string; room?: NumberKnockoutRoom; playerId?: PlayerId }) => {
        if (!response.ok || !response.room || !response.playerId) {
          setKnockoutOnlineError(response.error ?? "Could not join room");
          return;
        }
        setKnockoutOnlineError("");
        setKnockoutOnlineRoom(response.room);
        setKnockoutOnlinePlayerId(response.playerId);
        setKnockoutOnlineIsRolling(false);
        knockoutOnlineRollingRef.current = false;
        navigate("number-knockout-room", response.room.id);
      },
    );
  };

  const changeMatchSettings = () => {
    setGame((current) => ({ ...current, setupComplete: false }));
    setDisplayRolls({});
    setIsRolling(false);
    setRollToken(0);
  };

  const completeRoll = useCallback((roll: number) => {
    setGame((current) => {
      setDisplayRolls((rolls) =>
        current.currentPlayer === "p1" ? { p1: roll } : { ...rolls, p2: roll },
      );
      return applyTurnRoll(current, roll);
    });
    setIsRolling(false);
  }, []);

  const startRoll = useCallback(() => {
    setIsRolling(true);
  }, []);

  const progress =
    (Math.max(game.player1Score, game.player2Score) / game.targetScore) * 100;

  if (route === "games") {
    return (
      <GameCatalog
        onSelectDiceDuel={() => {
          setGame((current) => ({ ...current, setupComplete: false }));
          navigate("dice-duel");
        }}
        onSelectNumberTrail={() => navigate("number-trail")}
        onSelectDiceTug={() => navigate("dice-tug")}
        onSelectNumberKnockout={() => navigate("number-knockout")}
      />
    );
  }

  if (route === "number-trail") {
    return (
      <NumberTrailGame
        onBack={() => navigate("games")}
        onlineError={trailOnlineError}
        initialRoomId={routeRoomId}
        onCreateOnline={createNumberTrailOnlineRoom}
        onJoinOnline={joinNumberTrailOnlineRoom}
      />
    );
  }

  if (route === "number-trail-room" && trailOnlineRoom && trailOnlinePlayerId) {
    return (
      <NumberTrailGame
        onBack={() => navigate("games")}
        onlineRoom={trailOnlineRoom}
        onlinePlayerId={trailOnlinePlayerId}
        onlineIsRolling={trailOnlineIsRolling}
        onRollOnline={() => {
          if (!socket || trailOnlineIsRolling) return;
          socket.emit(
            "number-trail-roll-request",
            { roomId: trailOnlineRoom.id },
            (response: { ok: boolean; error?: string }) => {
              if (!response.ok) setTrailOnlineError(response.error ?? "Could not roll");
            },
          );
        }}
        onRestartOnline={() => {
          socket?.emit("restart-number-trail-room", { roomId: trailOnlineRoom.id });
        }}
      />
    );
  }

  if (route === "online-room" && onlineRoom && onlinePlayerId) {
    return (
      <OnlineGame
        room={onlineRoom}
        playerId={onlinePlayerId}
        rollToken={onlineRollToken}
        rollingPlayerId={onlineRollingPlayerId}
        resultRoll={onlineResultRoll}
        displayRolls={onlineDisplayRolls}
        isRolling={onlineIsRolling}
        onBack={() => navigate("games")}
        onRoll={() => {
          if (!socket || onlineIsRolling) return;
          socket.emit("roll-request", { roomId: onlineRoom.id }, (response: { ok: boolean; error?: string }) => {
            if (!response.ok) setOnlineError(response.error ?? "Could not roll");
          });
        }}
        onRestart={() => {
          socket?.emit("restart-room", { roomId: onlineRoom.id });
        }}
        onRollAnimationStart={() => setOnlineIsRolling(true)}
        onRollAnimationComplete={(roll) => {
          socket?.emit("submit-roll", { roomId: onlineRoom.id, roll });
        }}
      />
    );
  }

  if (route === "number-trail-room") {
    return (
      <NumberTrailGame
        onBack={() => navigate("games")}
        onlineError={trailOnlineError}
        initialRoomId={routeRoomId}
        onCreateOnline={createNumberTrailOnlineRoom}
        onJoinOnline={joinNumberTrailOnlineRoom}
      />
    );
  }

  if (route === "dice-tug") {
    return (
      <DiceTugGame
        onBack={() => navigate("games")}
        onlineError={tugOnlineError}
        initialRoomId={routeRoomId}
        onCreateOnline={createDiceTugOnlineRoom}
        onJoinOnline={joinDiceTugOnlineRoom}
      />
    );
  }

  if (route === "dice-tug-room" && tugOnlineRoom && tugOnlinePlayerId) {
    return (
      <DiceTugGame
        onBack={() => navigate("games")}
        onlineRoom={tugOnlineRoom}
        onlinePlayerId={tugOnlinePlayerId}
        onlineIsRolling={tugOnlineIsRolling}
        onRollOnline={() => {
          if (!socket || tugOnlineIsRolling) return;
          socket.emit(
            "dice-tug-roll-request",
            { roomId: tugOnlineRoom.id },
            (response: { ok: boolean; error?: string }) => {
              if (!response.ok) setTugOnlineError(response.error ?? "Could not roll");
            },
          );
        }}
        onRestartOnline={() => {
          socket?.emit("restart-dice-tug-room", { roomId: tugOnlineRoom.id });
        }}
      />
    );
  }

  if (route === "dice-tug-room") {
    return (
      <DiceTugGame
        onBack={() => navigate("games")}
        onlineError={tugOnlineError}
        initialRoomId={routeRoomId}
        onCreateOnline={createDiceTugOnlineRoom}
        onJoinOnline={joinDiceTugOnlineRoom}
      />
    );
  }

  if (route === "number-knockout") {
    return (
      <NumberKnockoutGame
        onBack={() => navigate("games")}
        onlineError={knockoutOnlineError}
        initialRoomId={routeRoomId}
        onCreateOnline={createNumberKnockoutOnlineRoom}
        onJoinOnline={joinNumberKnockoutOnlineRoom}
      />
    );
  }

  if (route === "number-knockout-room" && knockoutOnlineRoom && knockoutOnlinePlayerId) {
    return (
      <NumberKnockoutGame
        onBack={() => navigate("games")}
        onlineRoom={knockoutOnlineRoom}
        onlinePlayerId={knockoutOnlinePlayerId}
        onlineIsRolling={knockoutOnlineIsRolling}
        onRollOnline={() => {
          if (!socket || knockoutOnlineIsRolling) return;
          socket.emit(
            "number-knockout-roll-request",
            { roomId: knockoutOnlineRoom.id },
            (response: { ok: boolean; error?: string }) => {
              if (!response.ok) setKnockoutOnlineError(response.error ?? "Could not roll");
            },
          );
        }}
        onRestartOnline={() => {
          socket?.emit("restart-number-knockout-room", { roomId: knockoutOnlineRoom.id });
        }}
      />
    );
  }

  if (route === "number-knockout-room") {
    return (
      <NumberKnockoutGame
        onBack={() => navigate("games")}
        onlineError={knockoutOnlineError}
        initialRoomId={routeRoomId}
        onCreateOnline={createNumberKnockoutOnlineRoom}
        onJoinOnline={joinNumberKnockoutOnlineRoom}
      />
    );
  }

  if (!game.setupComplete) {
    return (
      <MatchSetup
        initialPlayer1Name={game.player1Name}
        initialPlayer2Name={game.player2Name}
        initialTargetScore={game.targetScore}
        initialRoomId={routeRoomId}
        onlineError={onlineError}
        onBack={() => navigate("games")}
        onStartLocal={configureMatch}
        onCreateOnline={createOnlineRoom}
        onJoinOnline={joinOnlineRoom}
      />
    );
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
            <span>{game.targetScore}</span>
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

        {game.status === "finished" && (
          <WinnerOverlay
            playerName={game.winner === "p1" ? game.player1Name : game.player2Name}
            resultLabel="Win"
            tone="win"
            onReset={reset}
            onNewSetup={changeMatchSettings}
          />
        )}
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

function MatchSetup({
  initialPlayer1Name,
  initialPlayer2Name,
  initialTargetScore,
  initialRoomId,
  onlineError,
  onBack,
  onStartLocal,
  onCreateOnline,
  onJoinOnline,
}: {
  initialPlayer1Name: string;
  initialPlayer2Name: string;
  initialTargetScore: number;
  initialRoomId: string;
  onlineError: string;
  onBack: () => void;
  onStartLocal: (player1Name: string, player2Name: string, targetScore: number) => void;
  onCreateOnline: (playerName: string, targetScore: number) => void;
  onJoinOnline: (roomId: string, playerName: string) => void;
}) {
  const [player1Name, setPlayer1Name] = useState(initialPlayer1Name);
  const [player2Name, setPlayer2Name] = useState(initialPlayer2Name);
  const [roomCode, setRoomCode] = useState(initialRoomId);
  const [targetScore, setTargetScore] = useState([3, 5, 7, 11].includes(initialTargetScore) ? initialTargetScore : 7);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onStartLocal(player1Name, player2Name, targetScore);
  };

  return (
    <main className="setup-shell">
      <form className="setup-panel" onSubmit={submit}>
        <div className="topbar">
          <div>
            <span className="eyebrow">Dicerra match setup</span>
            <h1>Dice Duel</h1>
          </div>
          <button className="icon-button" type="button" onClick={onBack} aria-label="Back to games">
            <ArrowLeft size={19} />
          </button>
        </div>

        <div className="setup-board">
          <label className="setup-field warm">
            <span>Player 1</span>
            <input
              value={player1Name}
              maxLength={18}
              onChange={(event) => setPlayer1Name(event.target.value)}
            />
          </label>
          <label className="setup-field cool">
            <span>Player 2</span>
            <input
              value={player2Name}
              maxLength={18}
              onChange={(event) => setPlayer2Name(event.target.value)}
            />
          </label>
        </div>

        <div className="round-picker" aria-label="Target score">
          {[3, 5, 7, 11].map((rounds) => (
            <button
              key={rounds}
              className={targetScore === rounds ? "selected" : ""}
              type="button"
              onClick={() => setTargetScore(rounds)}
            >
              <strong>{rounds}</strong>
              <span>rounds</span>
            </button>
          ))}
        </div>

        <button className="start-button" type="submit">
          <Play size={18} fill="currentColor" />
          Start local match
        </button>

        <div className="online-panel">
          <div>
            <span className="eyebrow">online multiplayer</span>
            <h2>Play on two devices</h2>
          </div>
          {onlineError && <p className="setup-error">{onlineError}</p>}
          <div className="online-actions">
            <button className="start-button" type="button" onClick={() => onCreateOnline(player1Name, targetScore)}>
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
            <button className="ghost-button" type="button" onClick={() => onJoinOnline(roomCode, player2Name)}>
              Join room
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

function GameCatalog({
  onSelectDiceDuel,
  onSelectNumberTrail,
  onSelectDiceTug,
  onSelectNumberKnockout,
}: {
  onSelectDiceDuel: () => void;
  onSelectNumberTrail: () => void;
  onSelectDiceTug: () => void;
  onSelectNumberKnockout: () => void;
}) {
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
        <button className="game-card" type="button" onClick={onSelectNumberTrail}>
          <span className="game-card-icon">
            <Map size={34} />
          </span>
          <span className="game-card-copy">
            <strong>Number Trail</strong>
            <em>Race through a spiral by matching dice numbers.</em>
          </span>
          <span className="game-card-preview trail-preview" aria-hidden="true">
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
        <button className="game-card" type="button" onClick={onSelectDiceTug}>
          <span className="game-card-icon">
            <Hand size={34} />
          </span>
          <span className="game-card-copy">
            <strong>Dice Tug</strong>
            <em>Pull one shared token to your exact finish.</em>
          </span>
          <span className="game-card-preview tug-preview" aria-hidden="true">
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
        <button className="game-card" type="button" onClick={onSelectNumberKnockout}>
          <span className="game-card-icon">
            <Trophy size={34} />
          </span>
          <span className="game-card-copy">
            <strong>Number Knockout</strong>
            <em>Clear cards while your lucky streak keeps the turn.</em>
          </span>
          <span className="game-card-preview knockout-preview" aria-hidden="true">
            <i />
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

function OnlineGame({
  room,
  playerId,
  rollToken,
  rollingPlayerId,
  resultRoll,
  displayRolls,
  isRolling,
  onBack,
  onRoll,
  onRestart,
  onRollAnimationStart,
  onRollAnimationComplete,
}: {
  room: PublicRoom;
  playerId: PlayerId;
  rollToken: number;
  rollingPlayerId: PlayerId | null;
  resultRoll?: number;
  displayRolls: { p1?: number; p2?: number };
  isRolling: boolean;
  onBack: () => void;
  onRoll: () => void;
  onRestart: () => void;
  onRollAnimationStart: () => void;
  onRollAnimationComplete: (roll: number) => void;
}) {
  const game = room.game;
  const leader =
    game.player1Score === game.player2Score
      ? "tie"
      : game.player1Score > game.player2Score
        ? "p1"
        : "p2";
  const currentPlayerName = game.currentPlayer === "p1" ? game.player1Name : game.player2Name;
  const visibleRolls = displayRolls;
  const resultText =
    room.status === "waiting"
      ? "Waiting for Player 2"
      : game.status === "finished"
        ? `${game.winner === "p1" ? game.player1Name : game.player2Name} wins the duel`
        : isRolling
          ? `${currentPlayerName} is rolling`
          : game.currentPlayer === "p2" && game.pendingPlayer1Roll !== undefined
            ? `${game.player1Name} rolled ${game.pendingPlayer1Roll}. ${game.player2Name} rolls next`
            : game.currentPlayer === playerId
              ? "Your turn"
              : `${currentPlayerName}'s turn`;
  const progress = (Math.max(game.player1Score, game.player2Score) / game.targetScore) * 100;
  const canRoll =
    room.status === "active" &&
    game.status === "active" &&
    game.currentPlayer === playerId &&
    !isRolling;
  const isWatchingOpponentRoll = isRolling && rollingPlayerId !== null && rollingPlayerId !== playerId;
  const isOwnPhysicalRoll = isRolling && rollingPlayerId === playerId;

  return (
    <main className="app-shell">
      <section className="game-surface" aria-label="Dicerra online game table">
        <div className="topbar">
          <div>
            <span className="eyebrow">Dicerra</span>
            <h1>Dice Duel</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" type="button" onClick={onBack} aria-label="Back to games">
              <ArrowLeft size={19} />
            </button>
            <button className="icon-button" type="button" onClick={onRestart} aria-label="Restart room">
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
            readOnly
          />
          <div className="versus">
            <Swords size={18} />
            <span>{game.targetScore}</span>
          </div>
          <PlayerPanel
            name={game.player2Name}
            score={game.player2Score}
            isActive={game.currentPlayer === "p2" || leader === "p2"}
            isWinner={game.winner === "p2"}
            color="cool"
            readOnly
          />
        </div>

        <div className="scene-wrap">
          {isWatchingOpponentRoll ? (
            <WaitingDice finalRoll={resultRoll} />
          ) : (
            <DiceScene
              rollToken={isOwnPhysicalRoll ? rollToken : 0}
              onRollStart={onRollAnimationStart}
              onRollComplete={onRollAnimationComplete}
            />
          )}
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
          <button className="roll-button" type="button" onClick={onRoll} disabled={!canRoll}>
            {room.status === "waiting"
              ? "Waiting..."
              : game.status === "finished"
                ? "Duel finished"
                : isRolling
                  ? "Rolling..."
                  : game.currentPlayer === playerId
                    ? "Your roll"
                    : "Opponent turn"}
          </button>
        </div>

        {game.status === "finished" && (
          <WinnerOverlay
            playerName={playerId === "p1" ? game.player1Name : game.player2Name}
            resultLabel={game.winner === playerId ? "You Win" : "You Lose"}
            tone={game.winner === playerId ? "win" : "lose"}
            onReset={onRestart}
          />
        )}
      </section>

      <aside className="side-panel" aria-label="Round history">
        <div className="room-banner">
          <strong>Room code</strong>
          <span>{room.id}</span>
          <em>{playerId === "p1" ? "You are Player 1" : "You are Player 2"}</em>
        </div>
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

function WinnerOverlay({
  playerName,
  resultLabel,
  tone,
  onReset,
  onNewSetup,
}: {
  playerName: string;
  resultLabel: string;
  tone: "win" | "lose";
  onReset: () => void;
  onNewSetup?: () => void;
}) {
  return (
    <div className={`winner-overlay ${tone}`} role="dialog" aria-label="Match result">
      {tone === "win" && (
        <div className="confetti-strips" aria-hidden="true">
          {Array.from({ length: 22 }).map((_, index) => (
            <span key={index} />
          ))}
        </div>
      )}
      <div className="winner-panel">
        <Sparkles size={28} />
        <span>{playerName}</span>
        <strong>{resultLabel}</strong>
        <button className="roll-button" type="button" onClick={onReset}>
          Reset game
        </button>
        {onNewSetup && (
          <button className="ghost-button" type="button" onClick={onNewSetup}>
            New setup
          </button>
        )}
      </div>
    </div>
  );
}

function WaitingDice({ finalRoll }: { finalRoll?: number }) {
  const [visibleRoll, setVisibleRoll] = useState(1);

  useEffect(() => {
    const startedAt = performance.now();
    const duration = finalRoll === undefined ? Number.POSITIVE_INFINITY : 720;
    const interval = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      if (elapsed >= duration) {
        setVisibleRoll(finalRoll ?? 1);
        window.clearInterval(interval);
        return;
      }

      const speed = finalRoll === undefined ? 74 : Math.max(88, 190 - elapsed / 8);
      const next = Math.floor(elapsed / speed) % 6;
      setVisibleRoll((next % 6) + 1);
    }, 55);

    return () => window.clearInterval(interval);
  }, [finalRoll]);

  return (
    <div className="waiting-dice-stage" aria-label="Opponent is rolling">
      <div className={`waiting-dice value-${visibleRoll}`}>
        {Array.from({ length: visibleRoll }).map((_, index) => (
          <i key={index} />
        ))}
      </div>
      <span>Opponent rolling</span>
    </div>
  );
}

function PlayerPanel({
  name,
  score,
  isActive,
  isWinner,
  color,
  onNameChange,
  readOnly = false,
}: {
  name: string;
  score: number;
  isActive: boolean;
  isWinner: boolean;
  color: "warm" | "cool";
  onNameChange?: (name: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className={`player-panel ${color} ${isActive || isWinner ? "active" : ""}`}>
      <input
        aria-label={`${name} name`}
        value={name}
        maxLength={18}
        readOnly={readOnly}
        onChange={(event) => onNameChange?.(event.target.value)}
      />
      <div className="score-line">
        <strong>{score}</strong>
        {isWinner && <Crown size={20} />}
      </div>
    </div>
  );
}
