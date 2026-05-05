import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { applyTurnRoll, createInitialGame, type GameState, type PlayerId } from "../src/game";

type RoomStatus = "waiting" | "active" | "finished";

type PlayerSlot = {
  id: PlayerId;
  name: string;
  socketId?: string;
};

type Room = {
  id: string;
  status: RoomStatus;
  players: Partial<Record<PlayerId, PlayerSlot>>;
  game: GameState;
  createdAt: number;
  pendingRollPlayer?: PlayerId;
};

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

type TrailRoom = {
  id: string;
  status: RoomStatus;
  players: Partial<Record<PlayerId, PlayerSlot>>;
  tiles: TrailTile[];
  game: TrailState;
  createdAt: number;
  pendingRollPlayer?: PlayerId;
  pendingRollTimer?: NodeJS.Timeout;
};

type TugState = {
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

type TugRoom = {
  id: string;
  status: RoomStatus;
  players: Partial<Record<PlayerId, PlayerSlot>>;
  game: TugState;
  createdAt: number;
  pendingRollPlayer?: PlayerId;
  pendingRollTimer?: NodeJS.Timeout;
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: true,
    methods: ["GET", "POST"],
  },
});

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, { roomId: string; playerId: PlayerId }>();
const trailRooms = new Map<string, TrailRoom>();
const socketToTrailRoom = new Map<string, { roomId: string; playerId: PlayerId }>();
const tugRooms = new Map<string, TugRoom>();
const socketToTugRoom = new Map<string, { roomId: string; playerId: PlayerId }>();
const trailLength = 30;
const tugFinishDistance = 7;

function createRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function publicRoom(room: Room) {
  return {
    id: room.id,
    status: room.status,
    players: room.players,
    game: room.game,
  };
}

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

function createInitialTrailState(player1Name = "Player 1", player2Name = "Waiting..."): TrailState {
  return {
    player1Name,
    player2Name,
    setupComplete: true,
    currentPlayer: "p1",
    positions: { p1: 0, p2: 0 },
    message: `${player1Name} starts on the trail`,
    status: "active",
    startedAt: Date.now(),
    rollCount: 0,
    moveSeq: 0,
    landSeq: 0,
    burnSeq: 0,
  };
}

function findNearestTrailTile(tiles: TrailTile[], fromIndex: number, roll: number) {
  if (fromIndex > 0 && tiles[fromIndex]?.value === roll) return fromIndex;

  let bestIndex = fromIndex;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDirection = -1;

  for (const tile of tiles) {
    if (tile.index === 0 || tile.value !== roll) continue;
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

function findNearestForwardTrailTile(tiles: TrailTile[], fromIndex: number, roll: number) {
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

function applyTrailRoll(room: TrailRoom, player: PlayerId, roll: number) {
  const current = room.game;
  const currentIndex = current.positions[player];
  const nextIndex = findNearestTrailTile(room.tiles, currentIndex, roll);
  const completedAt = Date.now();
  const winner = nextIndex >= room.tiles.length - 1 ? player : undefined;
  const burnTileIndex = nextIndex < currentIndex ? findNearestForwardTrailTile(room.tiles, currentIndex, roll) : undefined;
  const burnSeq = burnTileIndex === undefined ? current.burnSeq : current.burnSeq + 1;
  const playerName = player === "p1" ? current.player1Name : current.player2Name;
  const direction = nextIndex === currentIndex ? "stays put" : nextIndex > currentIndex ? "moves forward" : "moves back";

  room.game = {
    ...current,
    lastRoll: roll,
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
      currentIndex > 0 && room.tiles[currentIndex].value === roll
        ? `${playerName} rolled ${roll} and holds this tile`
        : `${playerName} rolled ${roll} and ${direction}`,
  };
  room.status = room.game.status === "finished" ? "finished" : "active";
}

function publicTrailRoom(room: TrailRoom) {
  return {
    id: room.id,
    status: room.status,
    players: room.players,
    tiles: room.tiles,
    game: room.game,
  };
}

function emitRoom(room: Room) {
  io.to(room.id).emit("room-state", publicRoom(room));
}

function emitTrailRoom(room: TrailRoom) {
  io.to(room.id).emit("number-trail-room-state", publicTrailRoom(room));
}

function createInitialTugState(player1Name = "Player 1", player2Name = "Waiting..."): TugState {
  return {
    player1Name,
    player2Name,
    setupComplete: true,
    currentPlayer: "p1",
    position: 0,
    message: `${player1Name} starts the tug`,
    status: "active",
    moveSeq: 0,
    rollCount: 0,
    landSeq: 0,
  };
}

function applyTugRoll(room: TugRoom, player: PlayerId, roll: number) {
  const current = room.game;
  const direction = player === "p1" ? -1 : 1;
  const targetFinish = direction * tugFinishDistance;
  const rawPosition = current.position + direction * roll;
  const nextPosition = direction < 0 ? Math.max(targetFinish, rawPosition) : Math.min(targetFinish, rawPosition);
  const winner = nextPosition === targetFinish ? player : undefined;
  const playerName = player === "p1" ? current.player1Name : current.player2Name;

  room.game = {
    ...current,
    lastRoll: roll,
    position: nextPosition,
    moveSeq: current.moveSeq + 1,
    landPosition: nextPosition,
    landSeq: current.landSeq + 1,
    currentPlayer: player === "p1" ? "p2" : "p1",
    status: winner ? "finished" : "active",
    winner,
    rollCount: current.rollCount + 1,
    message: winner ? `${playerName} pulled to finish` : `${playerName} pulled ${roll} spaces`,
  };
  room.status = room.game.status === "finished" ? "finished" : "active";
}

function publicTugRoom(room: TugRoom) {
  return {
    id: room.id,
    status: room.status,
    players: room.players,
    game: room.game,
  };
}

function emitTugRoom(room: TugRoom) {
  io.to(room.id).emit("dice-tug-room-state", publicTugRoom(room));
}

app.get("/health", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size, trailRooms: trailRooms.size, tugRooms: tugRooms.size });
});

io.on("connection", (socket) => {
  socket.on(
    "create-room",
    (
      payload: { playerName?: string; targetScore?: number },
      reply: (response: { ok: boolean; error?: string; room?: ReturnType<typeof publicRoom>; playerId?: PlayerId }) => void,
    ) => {
      const roomId = createRoomId();
      const playerName = payload.playerName?.trim().slice(0, 18) || "Player 1";
      const targetScore = [3, 5, 7, 11].includes(payload.targetScore ?? 7)
        ? payload.targetScore ?? 7
        : 7;
      const room: Room = {
        id: roomId,
        status: "waiting",
        players: {
          p1: { id: "p1", name: playerName, socketId: socket.id },
        },
        game: createInitialGame({
          player1Name: playerName,
          player2Name: "Waiting...",
          targetScore,
          setupComplete: true,
        }),
        createdAt: Date.now(),
      };

      rooms.set(roomId, room);
      socketToRoom.set(socket.id, { roomId, playerId: "p1" });
      socket.join(roomId);
      reply({ ok: true, room: publicRoom(room), playerId: "p1" });
      emitRoom(room);
    },
  );

  socket.on(
    "join-room",
    (
      payload: { roomId?: string; playerName?: string },
      reply: (response: { ok: boolean; error?: string; room?: ReturnType<typeof publicRoom>; playerId?: PlayerId }) => void,
    ) => {
      const roomId = payload.roomId?.trim().toUpperCase();
      const room = roomId ? rooms.get(roomId) : undefined;
      if (!room) {
        reply({ ok: false, error: "Room not found" });
        return;
      }
      if (room.players.p2?.socketId) {
        reply({ ok: false, error: "Room is full" });
        return;
      }

      const playerName = payload.playerName?.trim().slice(0, 18) || "Player 2";
      room.players.p2 = { id: "p2", name: playerName, socketId: socket.id };
      room.status = "active";
      room.game = createInitialGame({
        player1Name: room.players.p1?.name,
        player2Name: playerName,
        targetScore: room.game.targetScore,
        setupComplete: true,
      });
      socketToRoom.set(socket.id, { roomId: room.id, playerId: "p2" });
      socket.join(room.id);
      reply({ ok: true, room: publicRoom(room), playerId: "p2" });
      emitRoom(room);
    },
  );

  socket.on("roll-request", (payload: { roomId?: string }, reply?: (response: { ok: boolean; error?: string }) => void) => {
    const roomId = payload.roomId?.trim().toUpperCase();
    const room = roomId ? rooms.get(roomId) : undefined;
    const player = socketToRoom.get(socket.id);
    if (!room || !player || player.roomId !== room.id) {
      reply?.({ ok: false, error: "Room not found" });
      return;
    }
    if (room.status !== "active" || room.game.status === "finished") {
      reply?.({ ok: false, error: "Game is not active" });
      return;
    }
    if (room.game.currentPlayer !== player.playerId) {
      reply?.({ ok: false, error: "Not your turn" });
      return;
    }
    if (room.pendingRollPlayer) {
      reply?.({ ok: false, error: "Roll already in progress" });
      return;
    }

    room.pendingRollPlayer = player.playerId;
    io.to(room.id).emit("roll-start", { playerId: player.playerId });
    reply?.({ ok: true });
  });

  socket.on("submit-roll", (payload: { roomId?: string; roll?: number }, reply?: (response: { ok: boolean; error?: string }) => void) => {
    const roomId = payload.roomId?.trim().toUpperCase();
    const room = roomId ? rooms.get(roomId) : undefined;
    const player = socketToRoom.get(socket.id);
    if (!room || !player || player.roomId !== room.id) {
      reply?.({ ok: false, error: "Room not found" });
      return;
    }
    if (room.pendingRollPlayer !== player.playerId) {
      reply?.({ ok: false, error: "No roll expected from this player" });
      return;
    }

    const roll = Math.max(1, Math.min(6, Math.floor(payload.roll ?? 1)));
    room.game = applyTurnRoll(room.game, roll);
    room.status = room.game.status === "finished" ? "finished" : "active";
    room.pendingRollPlayer = undefined;
    io.to(room.id).emit("roll-result", { playerId: player.playerId, roll, room: publicRoom(room) });
    emitRoom(room);
    reply?.({ ok: true });
  });

  socket.on("restart-room", (payload: { roomId?: string }, reply?: (response: { ok: boolean; error?: string }) => void) => {
    const roomId = payload.roomId?.trim().toUpperCase();
    const room = roomId ? rooms.get(roomId) : undefined;
    if (!room) {
      reply?.({ ok: false, error: "Room not found" });
      return;
    }

    room.status = room.players.p2?.socketId ? "active" : "waiting";
    room.game = createInitialGame({
      player1Name: room.players.p1?.name,
      player2Name: room.players.p2?.name || "Waiting...",
      targetScore: room.game.targetScore,
      setupComplete: true,
    });
    emitRoom(room);
    reply?.({ ok: true });
  });

  socket.on(
    "create-number-trail-room",
    (
      payload: { playerName?: string },
      reply: (response: { ok: boolean; error?: string; room?: ReturnType<typeof publicTrailRoom>; playerId?: PlayerId }) => void,
    ) => {
      const roomId = createRoomId();
      const playerName = payload.playerName?.trim().slice(0, 18) || "Player 1";
      const room: TrailRoom = {
        id: roomId,
        status: "waiting",
        players: {
          p1: { id: "p1", name: playerName, socketId: socket.id },
        },
        tiles: createTrail(),
        game: createInitialTrailState(playerName, "Waiting..."),
        createdAt: Date.now(),
      };

      trailRooms.set(roomId, room);
      socketToTrailRoom.set(socket.id, { roomId, playerId: "p1" });
      socket.join(roomId);
      reply({ ok: true, room: publicTrailRoom(room), playerId: "p1" });
      emitTrailRoom(room);
    },
  );

  socket.on(
    "join-number-trail-room",
    (
      payload: { roomId?: string; playerName?: string },
      reply: (response: { ok: boolean; error?: string; room?: ReturnType<typeof publicTrailRoom>; playerId?: PlayerId }) => void,
    ) => {
      const roomId = payload.roomId?.trim().toUpperCase();
      const room = roomId ? trailRooms.get(roomId) : undefined;
      if (!room) {
        reply({ ok: false, error: "Room not found" });
        return;
      }
      if (room.players.p2?.socketId) {
        reply({ ok: false, error: "Room is full" });
        return;
      }

      const playerName = payload.playerName?.trim().slice(0, 18) || "Player 2";
      room.players.p2 = { id: "p2", name: playerName, socketId: socket.id };
      room.status = "active";
      room.game = createInitialTrailState(room.players.p1?.name || "Player 1", playerName);
      room.tiles = createTrail();
      socketToTrailRoom.set(socket.id, { roomId: room.id, playerId: "p2" });
      socket.join(room.id);
      reply({ ok: true, room: publicTrailRoom(room), playerId: "p2" });
      emitTrailRoom(room);
    },
  );

  socket.on(
    "number-trail-roll-request",
    (payload: { roomId?: string }, reply?: (response: { ok: boolean; error?: string }) => void) => {
      const roomId = payload.roomId?.trim().toUpperCase();
      const room = roomId ? trailRooms.get(roomId) : undefined;
      const player = socketToTrailRoom.get(socket.id);
      if (!room || !player || player.roomId !== room.id) {
        reply?.({ ok: false, error: "Room not found" });
        return;
      }
      if (room.status !== "active" || room.game.status === "finished") {
        reply?.({ ok: false, error: "Game is not active" });
        return;
      }
      if (room.game.currentPlayer !== player.playerId) {
        reply?.({ ok: false, error: "Not your turn" });
        return;
      }
      if (room.pendingRollPlayer) {
        reply?.({ ok: false, error: "Roll already in progress" });
        return;
      }

      room.pendingRollPlayer = player.playerId;
      room.game = {
        ...room.game,
        lastRoll: undefined,
        landTileIndex: undefined,
        burnTileIndex: undefined,
        message: `${player.playerId === "p1" ? room.game.player1Name : room.game.player2Name} is rolling`,
      };
      io.to(room.id).emit("number-trail-roll-start", { playerId: player.playerId });
      emitTrailRoom(room);

      room.pendingRollTimer = setTimeout(() => {
        const activeRoom = trailRooms.get(room.id);
        if (!activeRoom || activeRoom.pendingRollPlayer !== player.playerId) return;
        const roll = Math.floor(Math.random() * 6) + 1;
        applyTrailRoll(activeRoom, player.playerId, roll);
        activeRoom.pendingRollPlayer = undefined;
        activeRoom.pendingRollTimer = undefined;
        io.to(activeRoom.id).emit("number-trail-roll-result", {
          playerId: player.playerId,
          roll,
          room: publicTrailRoom(activeRoom),
        });
        emitTrailRoom(activeRoom);
      }, 920);

      reply?.({ ok: true });
    },
  );

  socket.on("restart-number-trail-room", (payload: { roomId?: string }, reply?: (response: { ok: boolean; error?: string }) => void) => {
    const roomId = payload.roomId?.trim().toUpperCase();
    const room = roomId ? trailRooms.get(roomId) : undefined;
    if (!room) {
      reply?.({ ok: false, error: "Room not found" });
      return;
    }
    if (room.pendingRollTimer) {
      clearTimeout(room.pendingRollTimer);
    }

    room.status = room.players.p2?.socketId ? "active" : "waiting";
    room.pendingRollPlayer = undefined;
    room.pendingRollTimer = undefined;
    room.tiles = createTrail();
    room.game = createInitialTrailState(room.players.p1?.name || "Player 1", room.players.p2?.name || "Waiting...");
    emitTrailRoom(room);
    reply?.({ ok: true });
  });

  socket.on(
    "create-dice-tug-room",
    (
      payload: { playerName?: string },
      reply: (response: { ok: boolean; error?: string; room?: ReturnType<typeof publicTugRoom>; playerId?: PlayerId }) => void,
    ) => {
      const roomId = createRoomId();
      const playerName = payload.playerName?.trim().slice(0, 18) || "Player 1";
      const room: TugRoom = {
        id: roomId,
        status: "waiting",
        players: {
          p1: { id: "p1", name: playerName, socketId: socket.id },
        },
        game: createInitialTugState(playerName, "Waiting..."),
        createdAt: Date.now(),
      };

      tugRooms.set(roomId, room);
      socketToTugRoom.set(socket.id, { roomId, playerId: "p1" });
      socket.join(roomId);
      reply({ ok: true, room: publicTugRoom(room), playerId: "p1" });
      emitTugRoom(room);
    },
  );

  socket.on(
    "join-dice-tug-room",
    (
      payload: { roomId?: string; playerName?: string },
      reply: (response: { ok: boolean; error?: string; room?: ReturnType<typeof publicTugRoom>; playerId?: PlayerId }) => void,
    ) => {
      const roomId = payload.roomId?.trim().toUpperCase();
      const room = roomId ? tugRooms.get(roomId) : undefined;
      if (!room) {
        reply({ ok: false, error: "Room not found" });
        return;
      }
      if (room.players.p2?.socketId) {
        reply({ ok: false, error: "Room is full" });
        return;
      }

      const playerName = payload.playerName?.trim().slice(0, 18) || "Player 2";
      room.players.p2 = { id: "p2", name: playerName, socketId: socket.id };
      room.status = "active";
      room.game = createInitialTugState(room.players.p1?.name || "Player 1", playerName);
      socketToTugRoom.set(socket.id, { roomId: room.id, playerId: "p2" });
      socket.join(room.id);
      reply({ ok: true, room: publicTugRoom(room), playerId: "p2" });
      emitTugRoom(room);
    },
  );

  socket.on("dice-tug-roll-request", (payload: { roomId?: string }, reply?: (response: { ok: boolean; error?: string }) => void) => {
    const roomId = payload.roomId?.trim().toUpperCase();
    const room = roomId ? tugRooms.get(roomId) : undefined;
    const player = socketToTugRoom.get(socket.id);
    if (!room || !player || player.roomId !== room.id) {
      reply?.({ ok: false, error: "Room not found" });
      return;
    }
    if (room.status !== "active" || room.game.status === "finished") {
      reply?.({ ok: false, error: "Game is not active" });
      return;
    }
    if (room.game.currentPlayer !== player.playerId) {
      reply?.({ ok: false, error: "Not your turn" });
      return;
    }
    if (room.pendingRollPlayer) {
      reply?.({ ok: false, error: "Roll already in progress" });
      return;
    }

    room.pendingRollPlayer = player.playerId;
    room.game = {
      ...room.game,
      lastRoll: undefined,
      landPosition: undefined,
      message: `${player.playerId === "p1" ? room.game.player1Name : room.game.player2Name} is rolling`,
    };
    io.to(room.id).emit("dice-tug-roll-start", { playerId: player.playerId });
    emitTugRoom(room);

    room.pendingRollTimer = setTimeout(() => {
      const activeRoom = tugRooms.get(room.id);
      if (!activeRoom || activeRoom.pendingRollPlayer !== player.playerId) return;
      const roll = Math.floor(Math.random() * 6) + 1;
      applyTugRoll(activeRoom, player.playerId, roll);
      activeRoom.pendingRollPlayer = undefined;
      activeRoom.pendingRollTimer = undefined;
      io.to(activeRoom.id).emit("dice-tug-roll-result", {
        playerId: player.playerId,
        roll,
        room: publicTugRoom(activeRoom),
      });
      emitTugRoom(activeRoom);
    }, 920);

    reply?.({ ok: true });
  });

  socket.on("restart-dice-tug-room", (payload: { roomId?: string }, reply?: (response: { ok: boolean; error?: string }) => void) => {
    const roomId = payload.roomId?.trim().toUpperCase();
    const room = roomId ? tugRooms.get(roomId) : undefined;
    if (!room) {
      reply?.({ ok: false, error: "Room not found" });
      return;
    }
    if (room.pendingRollTimer) {
      clearTimeout(room.pendingRollTimer);
    }
    room.status = room.players.p2?.socketId ? "active" : "waiting";
    room.pendingRollPlayer = undefined;
    room.pendingRollTimer = undefined;
    room.game = createInitialTugState(room.players.p1?.name || "Player 1", room.players.p2?.name || "Waiting...");
    emitTugRoom(room);
    reply?.({ ok: true });
  });

  socket.on("disconnect", () => {
    const player = socketToRoom.get(socket.id);
    if (player) {
      const room = rooms.get(player.roomId);
      socketToRoom.delete(socket.id);
      if (room) {
        const slot = room.players[player.playerId];
        if (slot) {
          slot.socketId = undefined;
        }
        room.status = "waiting";
        emitRoom(room);
      }
    }

    const trailPlayer = socketToTrailRoom.get(socket.id);
    if (trailPlayer) {
      const trailRoom = trailRooms.get(trailPlayer.roomId);
      socketToTrailRoom.delete(socket.id);
      if (trailRoom) {
        const trailSlot = trailRoom.players[trailPlayer.playerId];
        if (trailSlot) {
          trailSlot.socketId = undefined;
        }
        trailRoom.status = "waiting";
        if (trailRoom.pendingRollTimer) {
          clearTimeout(trailRoom.pendingRollTimer);
          trailRoom.pendingRollTimer = undefined;
          trailRoom.pendingRollPlayer = undefined;
        }
        emitTrailRoom(trailRoom);
      }
    }

    const tugPlayer = socketToTugRoom.get(socket.id);
    if (tugPlayer) {
      const tugRoom = tugRooms.get(tugPlayer.roomId);
      socketToTugRoom.delete(socket.id);
      if (tugRoom) {
        const tugSlot = tugRoom.players[tugPlayer.playerId];
        if (tugSlot) {
          tugSlot.socketId = undefined;
        }
        tugRoom.status = "waiting";
        if (tugRoom.pendingRollTimer) {
          clearTimeout(tugRoom.pendingRollTimer);
          tugRoom.pendingRollTimer = undefined;
          tugRoom.pendingRollPlayer = undefined;
        }
        emitTugRoom(tugRoom);
      }
    }
  });
});

const port = Number(process.env.SOCKET_PORT || 8201);
httpServer.listen(port, () => {
  console.log(`Dicerra online server listening on http://localhost:${port}`);
});
