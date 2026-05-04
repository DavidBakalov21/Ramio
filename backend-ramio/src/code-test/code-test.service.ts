import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { RunCodeResponseDto } from './dto/run-code.dto';
import type { TestLanguage } from '../bedrock/bedrock.service';
import { BedrockService } from '../bedrock/bedrock.service';
import { stripModelCodeOutput } from '../lib/strip-model-code.js';

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
    // Defaults use public images so hosts need no local `docker build` (except Node + Jest).
    this.pythonImage =
      this.config.get<string>('RUNNER_PYTHON_IMAGE') ?? 'python:3.12-slim';
    this.javaImage =
      this.config.get<string>('RUNNER_JAVA_IMAGE') ??
      'eclipse-temurin:21-jdk';
    this.dotnetImage =
      this.config.get<string>('RUNNER_DOTNET_IMAGE') ??
      'mcr.microsoft.com/dotnet/sdk:8.0';
    this.nodeImage =
      this.config.get<string>('RUNNER_NODE_IMAGE') ?? 'runner-node:20';
    this.timeoutMs = this.config.get<number>('RUNNER_TIMEOUT_MS') ?? 30_000;
  }

  async runPythonTests(
    code: string,
    tests: string,
  ): Promise<RunCodeResponseDto> {
    const normalizedTests = stripModelCodeOutput(tests);
    const solutionFile = 'solution.py';
    const testFile = 'test_solution.py';
    const result = await this.runLanguageTests({
      code,
      tests: normalizedTests,
      solutionFile,
      testFile,
      image: this.pythonImage,
      // discover + -t/-s puts workspace on the path so `import solution` works.
      // -p test_solution.py matches only our file (avoids ambiguous `unittest test_solution`
      // failing with ModuleNotFoundError in some images). PYTHONPATH is belt-and-suspenders.
      command: [
        'sh',
        '-lc',
        'export PYTHONPATH=/workspace && cd /workspace && exec python -B -m unittest discover -s /workspace -t /workspace -p test_solution.py -v',
      ],
    });
    return this.withPythonSolutionImportHint(
      this.withPythonUnittestNoTestsHint(result),
    );
  }

  async runNodeTests(code: string, tests: string): Promise<RunCodeResponseDto> {
    const solutionFile = 'solution.js';
    const testFile = 'test.js';
    const jestConfigContent = `module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test.js'],
};
`;
    return this.runLanguageTests({
      code,
      tests,
      solutionFile,
      testFile,
      image: this.nodeImage,
      command: [
        'jest',
        '--config',
        '/workspace/jest.config.cjs',
        '/workspace/test.js',
        '--runInBand',
        '--no-cache',
      ],
      extraFiles: { 'jest.config.cjs': jestConfigContent },
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
        [
          'set -e',
          'export HOME=/tmp',
          'export DOTNET_CLI_HOME=/tmp',
          'export DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1',
          'export DOTNET_CLI_TELEMETRY_OPTOUT=1',
          'export DOTNET_NOLOGO=1',
          'export NUGET_PACKAGES=/tmp/nuget',
          'mkdir -p /tmp/proj',
          'cd /tmp/proj',
          'dotnet new console --force >/tmp/dotnet-new.log 2>&1 || { cat /tmp/dotnet-new.log >&2; exit 1; }',
          'rm -f Program.cs',
          'cp /workspace/Solution.cs /workspace/SolutionTests.cs ./',
          'dotnet build --nologo --verbosity quiet',
          'dotnet /tmp/proj/bin/Debug/net8.0/proj.dll 2>&1',
        ].join(' && '),
      ],
    });
  }

  private withPythonUnittestNoTestsHint(
    result: RunCodeResponseDto,
  ): RunCodeResponseDto {
    if (result.success) return result;
    if (
      result.exitCode === 5 ||
      result.stderr.includes('NO TESTS RAN') ||
      result.stderr.includes('Ran 0 tests')
    ) {
      return {
        ...result,
        stderr: `${result.stderr.trimEnd()}\n\nRamio: No unittest tests ran. The assignment test file must define unittest.TestCase subclasses with methods named test_* (stdlib unittest only; pytest-style files are not executed).\n`,
      };
    }
    return result;
  }

  /**
   * When tests fail importing a symbol from the student's solution module — not when the
   * runner fails to load test_solution.py (ModuleNotFoundError: test_solution).
   */
  private withPythonSolutionImportHint(
    result: RunCodeResponseDto,
  ): RunCodeResponseDto {
    if (result.success) return result;
    const err = result.stderr;
    if (err.includes('Ramio: Automated tests import symbols')) return result;

    const testModuleLoadFailed =
      /Failed to import test module:\s*test_solution\b/.test(err) ||
      /No module named ['"]test_solution['"]/.test(err);
    if (testModuleLoadFailed) return result;

    const studentSolutionImportIssue =
      /cannot import name .+ from ['"]solution['"]/.test(err) ||
      /No module named ['"]solution['"]/.test(err) ||
      (/ImportError:\s*cannot import name/.test(err) && /\bsolution\b/.test(err));

    if (!studentSolutionImportIssue) return result;

    return {
      ...result,
      stderr: `${err.trimEnd()}\n\nRamio: Automated tests import symbols from your submitted module (solution.py). Define the missing function or class (and spelling must match). Output from print(...) alone does not create an importable name.\n`,
    };
  }

  private async runLanguageTests(input: {
    code: string;
    tests: string;
    solutionFile: string;
    testFile: string;
    image: string;
    command: string[];
    extraFiles?: Record<string, string>;
  }): Promise<RunCodeResponseDto> {
    if (!input.tests.trim()) {
      return {
        success: false,
        exitCode: -1,
        stdout: '',
        stderr:
          'This assignment has an empty test file. Upload a non-empty test file before running tests.',
        timedOut: false,
      };
    }

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
      if (input.extraFiles) {
        for (const [name, content] of Object.entries(input.extraFiles)) {
          await fs.writeFile(path.join(workspaceDir, name), content, 'utf-8');
        }
      }

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
