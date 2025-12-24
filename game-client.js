import zmq from "zeromq";

const ENDPOINT = process.env.ZMQ_ENDPOINT ?? "tcp://127.0.0.1:5555";

function randIntInclusive(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function toInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

const minArg = toInt(process.argv[2]);
const maxArg = toInt(process.argv[3]);

if (minArg === null || maxArg === null || minArg > maxArg) {
  console.log('использование: node game-client.js <min> <max>');
  console.log('пример: node game-client.js 1 100');
  process.exit(1);
}

const secret = randIntInclusive(minArg, maxArg);
console.log(`я загадал число в диапазоне ${minArg}-${maxArg}`);

const sock = new zmq.Request();
sock.connect(ENDPOINT);

let reply;

// диапазон
await sock.send(JSON.stringify({ range: `${minArg}-${maxArg}` }));
reply = JSON.parse((await sock.receive())[0].toString());
console.log("server ->", reply);

while (true) {
  if (reply?.error) {
    console.log("ошибка от сервера:", reply);
    break;
  }

  const guess = reply.answer;
  if (!Number.isFinite(guess)) {
    console.log("сервер прислал некорректный answer:", reply);
    break;
  }

  if (guess < secret) {
    await sock.send(JSON.stringify({ hint: "more" }));
  } else if (guess > secret) {
    await sock.send(JSON.stringify({ hint: "less" }));
  } else {
    console.log(`угадал: ${guess}`);
    await sock.send(JSON.stringify({ hint: "correct" }));
    const finalReply = JSON.parse((await sock.receive())[0].toString());
    console.log("server ->", finalReply);
    break;
  }

  reply = JSON.parse((await sock.receive())[0].toString());
  console.log("server ->", reply);
}

sock.close();

