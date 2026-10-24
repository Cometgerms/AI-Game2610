import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import type { GameState, Plan } from '../client/game/sandbox';

/** @requires Server-owned state and bounded plans. @ensures A failed native process never returns a partial settlement. */
export function nativeSimulation(state: GameState, plans: Plan[], mode: 'resolve' | 'validate'): Promise<GameState> {
  return new Promise((accept, reject) => {
    const child = spawn(resolve('build', process.platform === 'win32' ? 'sovereign_sandbox.exe' : 'sovereign_sandbox'), [], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Simulation timed out')); }, 10000);
    child.on('error', () => { clearTimeout(timer); reject(new Error('Build the C++ engine with scripts/check-server.ps1.')); });
    child.stdin.on('error', () => {});
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { output += chunk; if (output.length > 1000000) child.kill(); });
    child.on('close', () => {
      clearTimeout(timer);
      try { const result = JSON.parse(output); if (!result.ok) throw new Error(result.error); accept(result.state); }
      catch (error) { reject(error instanceof SyntaxError ? new Error('Invalid native simulation response') : error); }
    });
    child.stdin.end(JSON.stringify({ state, plans, mode }));
  });
}
