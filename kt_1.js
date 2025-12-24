// game-server.js
import zmq from "zeromq";

const ENDPOINT = process.env.ZMQ_ENDPOINT ?? "tcp://127.0.0.1:5555";

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function parseRange(rangeStr) {
  // ожидаем "min-max", например "1-100"
  if (typeof rangeStr !== "string") return null;
  const parts = rangeStr.split("-").map((s) => s.trim());
  if (parts.length !== 2) return null;

  const min = Number.parseInt(parts[0], 10);
  const max = Number.parseInt(parts[1], 10);

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  if (min > max) return null;

  return { min, max };
}

function nextGuess(min, max) {
  // бинарный поиск
  return Math.floor((min + max) / 2);
}

const sock = new zmq.Reply();

let state = {
  active: false,
  min: 0,
  max: 0,
  lastGuess: null,
  tries: 0,
};

console.log("готов к игре...");
await sock.bind(ENDPOINT);
console.log(`слушаю: ${ENDPOINT}`);

for await (const [msg] of sock) {
  const text = msg.toString();
  console.log("client ->", text);

  const data = safeJsonParse(text);
  if (!data) {
    await sock.send(JSON.stringify({ error: "bad_json" }));
    continue;
  }

  // старт: пришёл диапазон
  if (typeof data.range === "string") {
    const parsed = parseRange(data.range);
    if (!parsed) {
      await sock.send(JSON.stringify({ error: "bad_range", example: "1-100" }));
      continue;
    }

    state.active = true;
    state.min = parsed.min;
    state.max = parsed.max;
    state.tries = 0;

    const guess = nextGuess(state.min, state.max);
    state.lastGuess = guess;
    state.tries += 1;

    await sock.send(JSON.stringify({ answer: guess }));
    continue;
  }

  // ход: пришла подсказка
  if (typeof data.hint === "string") {
    if (!state.active || state.lastGuess === null) {
      await sock.send(JSON.stringify({ error: "no_active_game" }));
      continue;
    }

    if (data.hint === "more") {
      state.min = state.lastGuess + 1;
    } else if (data.hint === "less") {
      state.max = state.lastGuess - 1;
    } else if (data.hint === "correct") {
      const tries = state.tries;
      state = { active: false, min: 0, max: 0, lastGuess: null, tries: 0 };
      await sock.send(JSON.stringify({ status: "win", tries }));
      continue;
    } else {
      await sock.send(JSON.stringify({ error: "bad_hint", allowed: ["more", "less", "correct"] }));
      continue;
    }

    if (state.min > state.max) {
      const debug = { min: state.min, max: state.max };
      state = { active: false, min: 0, max: 0, lastGuess: null, tries: 0 };
      await sock.send(JSON.stringify({ error: "range_broken", debug }));
      continue;
    }

    const guess = nextGuess(state.min, state.max);
    state.lastGuess = guess;
    state.tries += 1;

    await sock.send(JSON.stringify({ answer: guess }));
    continue;
  }

  await sock.send(JSON.stringify({ error: "unknown_message" }));
}
