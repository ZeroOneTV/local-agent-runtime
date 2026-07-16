import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { PromptTemplateService } from './prompts/prompt-template.service';

@Module({
  providers: [LlmService, PromptTemplateService],
  exports: [LlmService, PromptTemplateService],
})
export class LlmModule {}
