const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: true },
  pingInterval: 25000,
  pingTimeout: 20000
});

const PORT = process.env.PORT || 3000;
const ROOM_SIZE = 2;
const POWER_INTERVAL_MS = 5000;
const TICK_MS = 50;
const ARENA_WIDTH = 900;
const PLAYER_WIDTH = 34;

app.use(express.static("public"));
app.get("/health", (_req, res) => res.json({ ok: true }));

const POWER_LIST = [
  { id: "fire", name: "เปลวเพลิง", icon: "🔥", rarity: "RARE", damage: 14, speed: 4.8 },
  { id: "thunder", name: "สายฟ้า", icon: "⚡", rarity: "RARE", damage: 11, speed: 7.2 },
  { id: "ice", name: "น้ำแข็ง", icon: "❄️", rarity: "UNCOMMON", damage: 9, speed: 4.3 },
  { id: "shadow", name: "เงามืด", icon: "🌑", rarity: "EPIC", damage: 18, speed: 5.7 },
  { id: "storm", name: "พายุ", icon: "🌪️", rarity: "UNCOMMON", damage: 10, speed: 5.6 },
  { id: "stone", name: "ศิลา", icon: "🪨", rarity: "COMMON", damage: 7, speed: 3.7 },
  { id: "dimension", name: "มิติ", icon: "🌀", rarity: "LEGENDARY", damage: 16, speed: 6.6 },
  { id: "cosmos", name: "จักรวาล", icon: "☄️", rarity: "MYTHIC", damage: 22, speed: 4.8 }
];

const rooms = new Map();
const playerToRoom = new Map();

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join("");
  } while (rooms.has(code));
  return code;
}
function choosePower(previousId) {
  let choices = POWER_LIST.filter(p => p.id !== previousId);
  if (!choices.length) choices = POWER_LIST;
  return { ...choices[crypto.randomInt(choices.length)] };
}
function publicPlayer(p) {
  return {
    id: p.id, name: p.name, x: p.x, y: p.y, hp: p.hp,
    facing: p.facing, power: p.power, alive: p.hp > 0
  };
}
function roomSnapshot(room) {
  return {
    code: room.code,
    status: room.players.size >= ROOM_SIZE ? room.status : "waiting",
    players: [...room.players.values()].map(publicPlayer),
    arenaWidth: ARENA_WIDTH,
    powerChangesIn: Math.max(0, room.nextPowerAt - Date.now())
  };
}
function emitRoom(room) {
  io.to(room.code).emit("state", roomSnapshot(room));
}
function leaveRoom(socket, reason = "left") {
  const code = playerToRoom.get(socket.id);
  if (!code) return;
  const room = rooms.get(code);
  playerToRoom.delete(socket.id);
  socket.leave(code);
  if (!room) return;
  room.players.delete(socket.id);
  if (room.players.size === 0) {
    clearInterval(room.timer);
    rooms.delete(code);
  } else {
    room.status = "waiting";
    io.to(code).emit("notice", reason === "disconnect" ? "คู่ต่อสู้ออกจากเกมแล้ว" : "ผู้เล่นออกจากห้อง");
    emitRoom(room);
  }
}
function startRoom(room) {
  if (room.players.size !== ROOM_SIZE || room.status === "playing") return;
  room.status = "playing";
  room.nextPowerAt = Date.now() + POWER_INTERVAL_MS;
  for (const p of room.players.values()) {
    p.hp = 100; p.x = p.slot === 1 ? 150 : ARENA_WIDTH - 150;
    p.y = 0; p.vy = 0; p.facing = p.slot === 1 ? 1 : -1;
    p.power = choosePower(null); p.lastAttackAt = 0;
  }
  room.timer = setInterval(() => {
    if (room.status !== "playing") return;
    const now = Date.now();
    if (now >= room.nextPowerAt) {
      for (const p of room.players.values()) p.power = choosePower(p.power?.id);
      room.nextPowerAt = now + POWER_INTERVAL_MS;
      io.to(room.code).emit("notice", "พลังเปลี่ยนแล้ว!");
    }
    emitRoom(room);
  }, TICK_MS);
  io.to(room.code).emit("matchStarted", { message: "เริ่มการต่อสู้!" });
  emitRoom(room);
}
io.on("connection", socket => {
  socket.on("createRoom", ({ name } = {}, ack = () => {}) => {
    if (playerToRoom.has(socket.id)) leaveRoom(socket);
    const code = makeCode();
    const room = {
      code, status: "waiting", players: new Map(),
      nextPowerAt: Date.now() + POWER_INTERVAL_MS, timer: null
    };
    room.players.set(socket.id, newPlayer(socket.id, name, 1));
    rooms.set(code, room);
    playerToRoom.set(socket.id, code);
    socket.join(code);
    ack({ ok: true, code, playerId: socket.id });
    emitRoom(room);
  });

  socket.on("joinRoom", ({ code, name } = {}, ack = () => {}) => {
    code = String(code || "").trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) return ack({ ok: false, error: "ไม่พบห้องนี้ ตรวจรหัสอีกครั้ง" });
    if (room.players.size >= ROOM_SIZE) return ack({ ok: false, error: "ห้องเต็มแล้ว" });
    if (playerToRoom.has(socket.id)) leaveRoom(socket);
    room.players.set(socket.id, newPlayer(socket.id, name, 2));
    playerToRoom.set(socket.id, code);
    socket.join(code);
    ack({ ok: true, code, playerId: socket.id });
    emitRoom(room);
    if (room.players.size === ROOM_SIZE) startRoom(room);
  });

  socket.on("input", ({ direction, jump } = {}) => {
    const room = rooms.get(playerToRoom.get(socket.id));
    const p = room?.players.get(socket.id);
    if (!p || room.status !== "playing" || p.hp <= 0) return;
    if (direction === "left" || direction === "right") {
      p.facing = direction === "right" ? 1 : -1;
      p.x = Math.max(PLAYER_WIDTH, Math.min(ARENA_WIDTH - PLAYER_WIDTH, p.x + p.facing * p.power.speed * 2.2));
    }
    if (jump && p.y === 0) p.vy = 11;
  });

  socket.on("attack", (_payload, ack = () => {}) => {
    const room = rooms.get(playerToRoom.get(socket.id));
    const p = room?.players.get(socket.id);
    if (!room || room.status !== "playing" || !p || p.hp <= 0) return ack({ ok: false, error: "ยังโจมตีไม่ได้" });
    const now = Date.now();
    if (now - p.lastAttackAt < 650) return ack({ ok: false, error: "กำลังคูลดาวน์" });
    p.lastAttackAt = now;
    const target = [...room.players.values()].find(other => other.id !== p.id);
    if (!target || target.hp <= 0) return ack({ ok: false, error: "ไม่มีเป้าหมาย" });
    const inRange = Math.abs(target.x - p.x) <= 125;
    if (!inRange) return ack({ ok: false, error: "ไกลเกินไป!" });
    let damage = p.power.damage;
    if (target.power.id === "stone") damage = Math.max(2, Math.floor(damage * 0.65));
    target.hp = Math.max(0, target.hp - damage);
    io.to(room.code).emit("combatLog", {
      attacker: p.name, target: target.name, damage, power: p.power.name
    });
    if (target.hp <= 0) {
      room.status = "finished";
      clearInterval(room.timer);
      io.to(room.code).emit("matchOver", { winnerId: p.id, winnerName: p.name });
    }
    emitRoom(room);
    ack({ ok: true, damage });
  });

  socket.on("rematch", (_payload, ack = () => {}) => {
    const room = rooms.get(playerToRoom.get(socket.id));
    if (!room || room.players.size !== ROOM_SIZE || room.status !== "finished") {
      return ack({ ok: false, error: "ยังเริ่มเกมใหม่ไม่ได้" });
    }
    room.status = "waiting";
    startRoom(room);
    ack({ ok: true });
  });

  socket.on("leaveRoom", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket, "disconnect"));
});

function newPlayer(id, name, slot) {
  return {
    id, name: String(name || `Player ${slot}`).trim().slice(0, 16) || `Player ${slot}`,
    slot, x: slot === 1 ? 150 : ARENA_WIDTH - 150, y: 0, vy: 0,
    hp: 100, facing: slot === 1 ? 1 : -1, power: choosePower(null), lastAttackAt: 0
  };
}
setInterval(() => {
  for (const room of rooms.values()) {
    if (room.status !== "playing") continue;
    for (const p of room.players.values()) {
      if (p.y > 0 || p.vy > 0) {
        p.y += p.vy;
        p.vy -= 0.65;
        if (p.y <= 0) { p.y = 0; p.vy = 0; }
      }
    }
  }
}, TICK_MS);

server.listen(PORT, () => console.log(`Random Power Battle running on port ${PORT}`));
