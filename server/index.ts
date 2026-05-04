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

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["http://localhost:8200", "http://127.0.0.1:8200"],
    methods: ["GET", "POST"],
  },
});

const rooms = new Map<string, Room>();
const socketToRoom = new Map<string, { roomId: string; playerId: PlayerId }>();

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

function emitRoom(room: Room) {
  io.to(room.id).emit("room-state", publicRoom(room));
}

app.get("/health", (_request, response) => {
  response.json({ ok: true, rooms: rooms.size });
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

  socket.on("disconnect", () => {
    const player = socketToRoom.get(socket.id);
    if (!player) return;
    const room = rooms.get(player.roomId);
    socketToRoom.delete(socket.id);
    if (!room) return;

    const slot = room.players[player.playerId];
    if (slot) {
      slot.socketId = undefined;
    }
    room.status = "waiting";
    emitRoom(room);
  });
});

const port = Number(process.env.SOCKET_PORT || 8201);
httpServer.listen(port, () => {
  console.log(`Dicerra online server listening on http://localhost:${port}`);
});
