# 🎲 Dice Duel – Product & Technical Design Document

## 1. Product Overview

### 1.1 Summary

Dice Duel is a web-based 3D dice game for two players. Players take turns rolling dice, and the player with the higher value earns a point. The first player to reach 7 points wins the game.

The game is designed to:

* Provide a visually engaging 3D experience
* Be simple to understand but satisfying to play
* Start as a local (single-device) game
* Later evolve into a real-time online multiplayer experience

---

### 1.2 Core Gameplay Rules

* Two players: Player 1 and Player 2
* Each round:

  * Both players roll a die
  * The higher value wins the round
  * Winner gets +1 point
  * Tie = no points
* First player to reach **7 points** wins
* Game ends immediately when a player reaches 7

---

### 1.3 Target Experience

* Smooth 3D dice rolling animation
* Realistic physics (later phase)
* Clear visual feedback:

  * Who won the round
  * Current scores
  * Final winner
* Minimal UI friction

---

## 2. Development Phases

### Phase 1: MVP (Local Game)

* Single device
* Two players (same screen)
* Dice roll logic
* Score tracking
* Win condition (7 points)
* SQLite persistence

### Phase 2: 3D & Visual Polish

* 3D dice rendering
* Lighting & environment
* Roll animation
* UI feedback (effects, transitions)

### Phase 3: UX Improvements

* Player name input
* Restart game
* Round history
* Sound effects

### Phase 4: Online Multiplayer

* Game rooms
* Two-device play
* Real-time sync (WebSockets)
* Persistent sessions

---

## 3. Tech Stack

### Frontend

* React
* React Router v7 (Framework Mode)
* React Three Fiber (3D rendering)
* Drei (3D helpers)
* Tailwind CSS (optional)

### Physics

* @react-three/rapier (physics engine)

### Backend

* Built-in server via React Router framework
* Server actions & loaders

### Database

* SQLite

### ORM

* Drizzle ORM (preferred)

### Future (Online)

* WebSockets (Socket.io or native WS)
* PostgreSQL (optional migration)

---

## 4. System Architecture

```txt
Client (Browser)
├─ React UI
├─ 3D Scene (R3F + Drei)
└─ Game Interaction

Server (React Router Framework)
├─ Loaders (fetch game state)
├─ Actions (mutate game state)
└─ API routes

Database (SQLite)
```

---

## 5. Folder Structure

```txt
app/
├─ routes/
│  ├─ _index.tsx
│  ├─ game.$gameId.tsx
│  └─ api.roll.ts
│
├─ components/
│  ├─ GameBoard.tsx
│  ├─ ScoreBoard.tsx
│  ├─ DiceScene.tsx
│  └─ Dice.tsx
│
├─ game/
│  ├─ rules.ts
│  ├─ dice.ts
│  └─ types.ts
│
├─ db/
│  ├─ schema.ts
│  └─ client.ts
```

---

## 6. Game Logic Design

### 6.1 Game State

```ts
type GameState = {
  id: string
  player1: Player
  player2: Player
  player1Score: number
  player2Score: number
  status: "active" | "finished"
  winnerId?: string
}
```

---

### 6.2 Round Flow

```txt
User clicks "Roll"
→ Generate dice values
→ Compare values
→ Assign point
→ Update state
→ Check winner
→ Persist result
```

---

### 6.3 Core Functions

```ts
function rollDice(): [number, number]

function compareDice(p1: number, p2: number): "p1" | "p2" | "tie"

function applyScore(state: GameState, result): GameState

function checkWinner(state: GameState): GameState
```

---

## 7. Dice Logic Strategy

### MVP (Phase 1)

* Use pseudo-random numbers:

```ts
Math.floor(Math.random() * 6) + 1
```

* Animate dice visually to match result

---

### Advanced (Phase 2+)

* Use physics engine (Rapier)
* Apply impulse to dice
* Detect final orientation
* Calculate top face

---

## 8. 3D Scene Design

### Scene Elements

* Camera
* Lighting (ambient + environment)
* Ground plane
* Two dice meshes

### Key Components

```jsx
<Canvas>
  <Physics>
    <Environment />
    <Stage>
      <Dice />
      <Dice />
    </Stage>
  </Physics>
</Canvas>
```

---

### Dice Behavior

* On roll:

  * Apply random impulse
  * Apply angular velocity
* After motion stops:

  * Detect top face (later phase)

---

## 9. UI Design

### Main Screen

* Title
* Player names
* Scoreboard
* Dice scene
* Roll button

### States

* Idle
* Rolling
* Round result
* Game finished

---

### Feedback

* Highlight winning player
* Animate score changes
* Show winner screen

---

## 10. Database Schema

### players

```sql
id TEXT PRIMARY KEY
name TEXT
```

---

### games

```sql
id TEXT PRIMARY KEY
player1_id TEXT
player2_id TEXT
player1_score INTEGER
player2_score INTEGER
status TEXT
winner_id TEXT
created_at DATETIME
```

---

### rounds

```sql
id TEXT PRIMARY KEY
game_id TEXT
player1_roll INTEGER
player2_roll INTEGER
winner_player_id TEXT
created_at DATETIME
```

---

## 11. API / Actions

### Create Game

```ts
POST /api/game
```

---

### Roll Dice

```ts
POST /api/roll

Request:
{ gameId }

Response:
{
  player1Roll,
  player2Roll,
  updatedScores,
  winner
}
```

---

## 12. State Management

* Local UI state → React state
* Game state → server (via actions/loaders)
* Keep logic centralized in `/game`

---

## 13. Future: Multiplayer Design

### Requirements

* Two devices
* Shared game state
* Real-time updates

### Approach

* WebSocket connection
* Server holds authoritative state
* Clients receive updates

### Flow

```txt
Player A rolls dice
→ Server computes result
→ Broadcast to Player B
→ Both UIs update
```

---

## 14. Non-Functional Requirements

* Fast initial load
* Smooth animation (60 FPS target)
* Deterministic game logic (server-authoritative later)
* Simple deploy (Node environment)

---

## 15. Deployment

### MVP

* Node server
* SQLite file-based DB

### Future

* Move DB to PostgreSQL
* Deploy WebSocket server
* CDN for assets

---

## 16. Milestone Definition

### Milestone 1 (Must Build First)

* Two players
* Roll button
* Dice result (random)
* Score tracking
* Win at 7
* Persist game in SQLite

---

## 17. Risks & Considerations

* Physics-based dice detection complexity
* Sync issues in multiplayer
* Performance of 3D on low-end devices

---

## 18. Final Notes

* Keep game logic decoupled from UI
* Start simple, iterate fast
* Do not over-engineer multiplayer early
* Prioritize playable MVP

---

## ✅ Definition of Done (MVP)

* Game playable end-to-end
* Scores update correctly
* Winner detected at 7
* UI responsive
* Data persisted

---
