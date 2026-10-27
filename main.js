import { program, InvalidArgumentError } from 'commander';

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
