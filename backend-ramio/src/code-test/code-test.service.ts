import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RunCodeResponseDto } from './dto/run-code.dto';

const SOLUTION_FILE = 'solution.py';
const TEST_FILE = 'test_solution.py';

@Injectable()
export class CodeTestService {
  private readonly pythonImage: string;
  private readonly timeoutMs: number;
private readonly nodeImage: string;
  constructor(private readonly config: ConfigService) {
    this.pythonImage =
      this.config.get<string>('RUNNER_PYTHON_IMAGE') ?? 'runner-python:3.12';
    this.timeoutMs =
      this.config.get<number>('RUNNER_TIMEOUT_MS') ?? 30_000;

      this.nodeImage = this.config.get<string>('RUNNER_NODE_IMAGE') ?? 'runner-node:20';
  }

  async runPythonTests(code: string, tests: string): Promise<RunCodeResponseDto> {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ramio-runner-'),
    );

    try {
      await fs.writeFile(
        path.join(workspaceDir, SOLUTION_FILE),
        code,
        'utf-8',
      );
      await fs.writeFile(
        path.join(workspaceDir, TEST_FILE),
        tests,
        'utf-8',
      );

      const result = await this.runDocker(workspaceDir);
      return result;
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {
        // ignore cleanup errors
      });
    }
  }

  private runDocker(workspaceDir: string): Promise<RunCodeResponseDto> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (result: RunCodeResponseDto) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const args = [
        'run',
        '--rm',
        '-i',
        '--network', 'none',
        '--cpus=0.5',
        '--memory=256m',
        '--memory-swap=256m',
        '--pids-limit=128',
        '--read-only',
        '--tmpfs', '/tmp:rw,size=64m',
        '--security-opt', 'no-new-privileges',
        '--cap-drop', 'ALL',
        '-v', `${workspaceDir}:/workspace:ro`,
        '-w', '/workspace',
        this.pythonImage,
        'python', '-B', '-m', 'unittest', '-v',
      ];

      const proc = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const timeoutId = setTimeout(() => {
        proc.kill('SIGKILL');
        finish({
          success: false,
          exitCode: -1,
          stdout,
          stderr: stderr + '\n[Runner timed out]\n',
          timedOut: true,
        });
      }, this.timeoutMs);

      proc.on('close', (exitCode, signal) => {
        clearTimeout(timeoutId);
        const code = exitCode ?? (signal === 'SIGKILL' ? -1 : 0);
        finish({
          success: code === 0,
          exitCode: code,
          stdout,
          stderr,
          timedOut: false,
        });
      });

      proc.on('error', (err) => {
        clearTimeout(timeoutId);
        finish({
          success: false,
          exitCode: -1,
          stdout,
          stderr: stderr + `\n[Runner error: ${err.message}]\n`,
          timedOut: false,
        });
      });
    });
  }

  private async runNodeTests(code: string, tests: string): Promise<RunCodeResponseDto> {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ramio-runner-'),
    );

    try {
      await fs.writeFile(
        path.join(workspaceDir, SOLUTION_FILE),
        code,
        'utf-8',
      );
      await fs.writeFile(
        path.join(workspaceDir, TEST_FILE),
        tests,
        'utf-8',
      );

      const result = await this.runDocker(workspaceDir);
      return result;
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {
        // ignore cleanup errors
      });
    }
    
  }
}
