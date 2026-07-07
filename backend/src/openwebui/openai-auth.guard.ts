import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { OpenWebuiConfigService } from './openwebui.config';

@Injectable()
export class OpenAiAuthGuard implements CanActivate {
  constructor(private readonly config: OpenWebuiConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    if (!this.config.requireApiKey) return true;

    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
      openwebuiApiKey?: string;
    }>();

    const auth = request.headers.authorization;
    const key = auth?.startsWith('Bearer ') ? auth.slice(7) : auth;

    if (!key || key !== this.config.apiKey) {
      throw new UnauthorizedException('API key inválida');
    }

    request.openwebuiApiKey = key;
    return true;
  }
}
