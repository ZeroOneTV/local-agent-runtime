import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { StructuredToolResult } from '../tools.types';
import { ShellGuardService } from '../../security/shell-guard.service';

const execAsync = promisify(exec);

@Injectable()
export class TerminalService {
  constructor(
    private readonly config: ConfigService,
    private readonly shellGuard: ShellGuardService,
  ) {}

  private get timeout(): number {
    return this.config.get<number>('tools.commandTimeoutMs') ?? 30000;
  }

  private get maxOutput(): number {
    return this.config.get<number>('tools.maxOutputChars') ?? 4000;
  }

  async runCommand(
    rootPath: string,
    command: string,
  ): Promise<StructuredToolResult> {
    const validation = this.shellGuard.validate(command);
    if (!validation.allowed) {
      return {
        success: false,
        error: {
          code: validation.code || 'COMMAND_BLOCKED',
          message: validation.message || 'Comando bloqueado',
        },
      };
    }

    const start = Date.now();
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: rootPath,
        timeout: this.timeout,
        maxBuffer: this.maxOutput,
        env: {
          PATH: process.env.PATH,
          HOME: process.env.HOME,
          NODE_ENV: process.env.NODE_ENV,
        },
      });

      const output = (stdout || stderr || 'Comando executado sem saída').slice(
        0,
        this.maxOutput,
      );

      return {
        success: true,
        data: { output, exitCode: 0 },
        metadata: { executionTime: Date.now() - start },
      };
    } catch (e: unknown) {
      const err = e as { stderr?: string; message?: string; code?: number };
      return {
        success: false,
        error: {
          code: 'COMMAND_FAILED',
          message: (err.stderr || err.message || 'Falha na execução').slice(
            0,
            this.maxOutput,
          ),
        },
        metadata: {
          executionTime: Date.now() - start,
          exitCode: err.code,
        },
      };
    }
  }

  runTests(rootPath: string) {
    return this.runCommand(rootPath, 'npm test --if-present');
  }

  runBuild(rootPath: string) {
    return this.runCommand(rootPath, 'npm run build --if-present');
  }
}
