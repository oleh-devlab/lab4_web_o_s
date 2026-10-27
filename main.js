import { program, InvalidArgumentError } from 'commander';
import { access, readFile, writeFile } from 'node:fs';
import http from 'node:http';

function parsePort(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new InvalidArgumentError('Очікується ціле число від 1 до 65535.');
  }
  return n;
}

program
  .description('Сервер для отримання інформації про польоти з NDJSON-файлу')
  .helpOption('--help', 'показати довідку')
  .requiredOption('-i, --input <path>', 'шлях до файлу даних')
  .requiredOption('-h, --host <address>', 'адреса сервера')
  .requiredOption('-p, --port <number>', 'порт сервера', parsePort)
  .option('-o, --output <path>', 'файл для запису відповіді');

program.parse();
const options = program.opts();

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

// Значення з файлу як число: число лишається числом, рядок-число перетворюється,
// усе інше (відсутнє, null, порожнє, нечислове) стає null.
function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// Розбирає NDJSON порядково, одразу фільтрує й формує поля відповіді.
function processData(text, showDate, airtimeMin) {
  const result = [];
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') continue;

    let flight;
    try {
      flight = JSON.parse(line);
    } catch {
      throw new Error(`Файл даних пошкоджено: рядок ${i + 1} не є коректним JSON`);
    }
    if (flight === null || typeof flight !== 'object' || Array.isArray(flight)) {
      throw new Error(`Файл даних пошкоджено: рядок ${i + 1} не є JSON-об'єктом`);
    }

    const airTime = toNumber(flight.AIR_TIME);
    // запис без числового AIR_TIME неможливо порівняти з X, тому з фільтром він відкидається
    if (airtimeMin !== null && (airTime === null || airTime <= airtimeMin)) continue;

    const item = {};
    if (showDate) {
      const date = flight.FL_DATE;
      item.date = typeof date === 'string' && date.trim() !== '' ? date : null;
    }
    item.air_time = airTime;
    item.distance = toNumber(flight.DISTANCE);
    result.push(item);
  }

  return result;
}

// Надсилає JSON-відповідь; якщо задано --output, спершу записує її у файл.
function sendJson(res, status, body) {
  const json = JSON.stringify(body);

  if (options.output === undefined) {
    res.writeHead(status, JSON_HEADERS);
    res.end(json);
    return;
  }

  writeFile(options.output, json, 'utf8', (err) => {
    if (err) {
      res.writeHead(500, JSON_HEADERS);
      res.end(JSON.stringify({ error: `Не вдалося записати відповідь у файл "${options.output}"` }));
      return;
    }
    res.writeHead(status, JSON_HEADERS);
    res.end(json);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    sendJson(res, 400, { error: 'Некоректний URL запиту' });
    return;
  }

  if (url.pathname !== '/') {
    sendJson(res, 404, { error: `"${url.pathname}" не знайдено` });
    return;
  }

  const showDate = url.searchParams.get('date') === 'true';

  const rawMin = url.searchParams.get('airtime_min');
  let airtimeMin = null;
  if (rawMin !== null) {
    airtimeMin = Number(rawMin);
    if (rawMin.trim() === '' || !Number.isFinite(airtimeMin)) {
      sendJson(res, 400, { error: 'Параметр airtime_min має бути числом' });
      return;
    }
  }

  readFile(options.input, 'utf8', (err, text) => {
    if (err) {
      const message = err.code === 'ENOENT' ? 'Файл даних не знайдено' : `Не вдалося прочитати файл даних: ${err.message}`;
      sendJson(res, 500, { error: message });
      return;
    }

    let result;
    try {
      result = processData(text, showDate, airtimeMin);
    } catch (parseErr) {
      sendJson(res, 500, { error: parseErr.message });
      return;
    }

    sendJson(res, 200, result);
  });
});

server.on('error', (err) => {
  console.error(`Не вдалося запустити сервер: ${err.message}`);
  process.exit(1);
});

access(options.input, (err) => {
  if (err) program.error('Cannot find input file');

  server.listen(options.port, options.host, () => {
    console.log(`Сервер запущено: http://${options.host}:${options.port}/`);
  });
});