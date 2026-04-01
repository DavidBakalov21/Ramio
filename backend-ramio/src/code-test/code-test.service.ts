import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RunCodeResponseDto } from './dto/run-code.dto';
import type { TestLanguage } from '../bedrock/bedrock.service';
import { BedrockService } from '../bedrock/bedrock.service';

@Injectable()
export class CodeTestService {
  private readonly pythonImage: string;
  private readonly javaImage: string;
  private readonly dotnetImage: string;
  private readonly nodeImage: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly bedrockService: BedrockService,
  ) {
    this.pythonImage =
      this.config.get<string>('RUNNER_PYTHON_IMAGE') ?? 'runner-python:3.12';
    this.javaImage =
      this.config.get<string>('RUNNER_JAVA_IMAGE') ?? 'runner-java:21';
    this.dotnetImage =
      this.config.get<string>('RUNNER_DOTNET_IMAGE') ?? 'runner-dotnet:8.0';
    this.nodeImage =
      this.config.get<string>('RUNNER_NODE_IMAGE') ?? 'runner-node:20';
    this.timeoutMs = this.config.get<number>('RUNNER_TIMEOUT_MS') ?? 30_000;
  }

  async runPythonTests(
    code: string,
    tests: string,
  ): Promise<RunCodeResponseDto> {
    const solutionFile = 'solution.py';
    const testFile = 'test_solution.py';
    return this.runLanguageTests({
      code,
      tests,
      solutionFile,
      testFile,
      image: this.pythonImage,
      command: ['python', '-B', '-m', 'unittest', '-v'],
    });
  }

  async runJavaTests(code: string, tests: string): Promise<RunCodeResponseDto> {
    const solutionFile = 'Solution.java';
    const testFile = 'SolutionTest.java';
    return this.runLanguageTests({
      code,
      tests,
      solutionFile,
      testFile,
      image: this.javaImage,
      command: [
        'sh',
        '-lc',
        'cp /workspace/Solution.java /workspace/SolutionTest.java /tmp/ && cd /tmp && javac Solution.java SolutionTest.java && java SolutionTest',
      ],
    });
  }

  async runDotnetTests(
    code: string,
    tests: string,
  ): Promise<RunCodeResponseDto> {
    const solutionFile = 'Solution.cs';
    const testFile = 'SolutionTests.cs';
    return this.runLanguageTests({
      code,
      tests,
      solutionFile,
      testFile,
      image: this.dotnetImage,
      command: [
        'sh',
        '-lc',
        'mkdir -p /tmp/proj && cd /tmp/proj && dotnet new console --force >/tmp/dotnet-new.log 2>&1 && rm -f Program.cs && cp /workspace/Solution.cs /workspace/SolutionTests.cs ./ && dotnet run',
      ],
    });
  }

  private async runLanguageTests(input: {
    code: string;
    tests: string;
    solutionFile: string;
    testFile: string;
    image: string;
    command: string[];
  }): Promise<RunCodeResponseDto> {
    const workspaceDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'ramio-runner-'),
    );

    try {
      await fs.writeFile(
        path.join(workspaceDir, input.solutionFile),
        input.code,
        'utf-8',
      );
      await fs.writeFile(
        path.join(workspaceDir, input.testFile),
        input.tests,
        'utf-8',
      );

      const result = await this.runDocker(
        workspaceDir,
        input.image,
        input.command,
      );
      return result;
    } finally {
      await fs.rm(workspaceDir, { recursive: true, force: true }).catch(() => {
        console.error('Error cleaning up workspace directory', workspaceDir);
      });
    }
  }

  private runDocker(
    workspaceDir: string,
    image: string,
    command: string[],
  ): Promise<RunCodeResponseDto> {
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
        '--network',
        'none',
        '--cpus=0.5',
        '--memory=256m',
        '--memory-swap=256m',
        '--pids-limit=128',
        '--read-only',
        '--tmpfs',
        '/tmp:rw,size=64m',
        '--security-opt',
        'no-new-privileges',
        '--cap-drop',
        'ALL',
        '-v',
        `${workspaceDir}:/workspace:ro`,
        '-w',
        '/workspace',
        image,
        ...command,
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

  async generateUnitTests(
    sourceCode: string,
    language: TestLanguage = 'python',
  ): Promise<string> {
    return this.bedrockService.generateUnitTests(sourceCode, language);
  }

  async generateUnitTestsFromDescription(
    description: string,
    language: TestLanguage = 'python',
  ): Promise<string> {
    return this.bedrockService.generateUnitTestsFromDescription(
      description,
      language,
    );
  }
}
