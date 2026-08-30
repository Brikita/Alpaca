import { spawn } from 'node:child_process';

const SAFE_READ_COMMANDS = new Set([
  'account get',
  'account portfolio',
  'clock',
  'position list',
  'order list',
  'data snapshot',
  'data bars',
  'data option chain',
  'data option snapshot',
  'data news',
  'option contracts',
]);

export interface AlpacaCliResult<T> {
  data: T;
  stderr: string;
}

export function assertPaperEnvironment(environment: NodeJS.ProcessEnv = process.env): void {
  if (environment.ALPACA_LIVE_TRADE?.toLowerCase() === 'true') {
    throw new Error('VolGuard refuses to run while ALPACA_LIVE_TRADE=true.');
  }
}

export function assertCommandAllowed(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
): void {
  assertPaperEnvironment(environment);
  const command = args.slice(0, Math.min(args.length, 3)).join(' ');
  const readOnly = [...SAFE_READ_COMMANDS].some(
    (candidate) => command === candidate || command.startsWith(`${candidate} `),
  );

  if (readOnly) return;

  const isDryRun = args[0] === 'order' && args[1] === 'submit' && args.includes('--dry-run');
  if (isDryRun) return;

  const executionUnlocked =
    environment.VOLGUARD_EXECUTION_ENABLED === 'paper' &&
    args[0] === 'order' &&
    args[1] === 'submit';

  if (!executionUnlocked) {
    throw new Error('Command blocked by the VolGuard execution lock.');
  }
}

export async function runAlpaca<T>(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
  timeoutMs = 30_000,
): Promise<AlpacaCliResult<T>> {
  assertCommandAllowed(args, environment);

  return new Promise((resolve, reject) => {
    const child = spawn(environment.ALPACA_CLI_PATH ?? 'alpaca', [...args, '--quiet'], {
      shell: false,
      windowsHide: true,
      env: {
        ...environment,
        ALPACA_LIVE_TRADE: 'false',
        ALPACA_OUTPUT: 'json',
        ALPACA_QUIET: 'true',
      },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Alpaca CLI timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr || `Alpaca CLI exited with code ${code}.`));
        return;
      }
      try {
        resolve({ data: JSON.parse(stdout) as T, stderr });
      } catch {
        reject(new Error('Alpaca CLI returned invalid JSON.'));
      }
    });
  });
}
