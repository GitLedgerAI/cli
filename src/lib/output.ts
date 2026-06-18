const NO_COLOR = process.env.NO_COLOR === '1' || process.env.NO_COLOR === 'true';

function color(code: string, message: string): string {
  if (NO_COLOR) return message;
  return `\u001b[${code}m${message}\u001b[0m`;
}

export function info(message: string): void {
  console.log(color('36', `[info] ${message}`));
}

export function success(message: string): void {
  console.log(color('32', `[ok] ${message}`));
}

export function warn(message: string): void {
  console.warn(color('33', `[warn] ${message}`));
}

export function fail(message: string): never {
  throw new Error(message);
}
