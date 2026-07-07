import { Injectable } from '@nestjs/common';
import { DEFAULT_PROJECT_ID } from '../common/constants';
import { OpenWebuiConfigService } from './openwebui.config';

export interface LogicalModel {
  id: string;
  name: string;
  object: 'model';
  owned_by: string;
  projectId: string;
  backendModel?: string;
  orchestration: boolean;
}

@Injectable()
export class LogicalModelsService {
  private readonly models: LogicalModel[];
  private readonly apiKeyToProject: Map<string, string>;

  constructor(private readonly config: OpenWebuiConfigService) {
    this.models = this.parseModels(config.logicalModelsRaw);
    this.apiKeyToProject = this.parseApiKeyMap(config.apiKeyProjectMapRaw);
  }

  listModels(): LogicalModel[] {
    return this.models;
  }

  listOpenAiModels() {
    return {
      object: 'list',
      data: this.models.map(({ id, object, owned_by }) => ({ id, object, owned_by })),
    };
  }

  resolveModel(modelId?: string): LogicalModel {
    if (!modelId) return this.models[0];
    const found = this.models.find((m) => m.id === modelId);
    if (found) return found;
    if (modelId.startsWith('project-')) {
      const projectId = modelId.replace('project-', '');
      return {
        id: modelId,
        name: `Project ${projectId.slice(0, 8)}`,
        object: 'model',
        owned_by: 'local',
        projectId,
        backendModel: undefined,
        orchestration: true,
      };
    }
    return this.models[0];
  }

  resolveProjectId(modelId: string | undefined, apiKey?: string): string {
    if (apiKey && this.apiKeyToProject.has(apiKey)) {
      return this.apiKeyToProject.get(apiKey)!;
    }
    return this.resolveModel(modelId).projectId || DEFAULT_PROJECT_ID;
  }

  private parseModels(raw: string): LogicalModel[] {
    const models = raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const parts = entry.includes('|') ? entry.split('|') : entry.split(':');
        const [id, name, projectId, backendModel] = parts;
        return {
          id: id || 'local-assistant',
          name: name || 'Local Assistant',
          object: 'model' as const,
          owned_by: 'local',
          projectId: projectId || DEFAULT_PROJECT_ID,
          backendModel: backendModel || undefined,
          orchestration: true,
        };
      });

    if (!models.length) {
      models.push({
        id: 'local-assistant',
        name: 'Local Assistant',
        object: 'model',
        owned_by: 'local',
        projectId: DEFAULT_PROJECT_ID,
        backendModel: undefined,
        orchestration: true,
      });
    }

    return models;
  }

  private parseApiKeyMap(raw: string): Map<string, string> {
    const map = new Map<string, string>();
    for (const entry of raw.split(',').map((e) => e.trim()).filter(Boolean)) {
      const sep = entry.includes('|') ? '|' : ':';
      const [key, projectId] = entry.split(sep);
      if (key && projectId) map.set(key, projectId);
    }
    return map;
  }
}
