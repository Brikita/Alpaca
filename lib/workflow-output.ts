import { appendFile } from 'node:fs/promises';

export async function writeWorkflowOutputs(values: Record<string, string>): Promise<void> {
  const output = process.env.GITHUB_OUTPUT;
  if (!output) return;
  const lines = Object.entries(values).map(([key, value]) => (
    `${key}=${value.replace(/[\r\n]+/g, ' ').slice(0, 500)}`
  ));
  await appendFile(output, `${lines.join('\n')}\n`, 'utf8');
}

export function alertKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
}
