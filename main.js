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
