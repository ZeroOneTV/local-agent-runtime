import { Injectable } from '@nestjs/common';
import { Response } from 'express';

@Injectable()
export class OpenAiStreamService {
  startStream(res: Response, id: string, model: string) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    this.writeChunk(res, id, model, '', { role: 'assistant' });
  }

  writeStatus(res: Response, id: string, model: string, status: string) {
    this.writeChunk(res, id, model, `\n[${status}]\n`);
  }

  writeContent(res: Response, id: string, model: string, content: string) {
    this.writeChunk(res, id, model, content);
  }

  endStream(res: Response, id: string, model: string) {
    this.writeChunk(res, id, model, '', null, 'stop');
    res.write('data: [DONE]\n\n');
    res.end();
  }

  streamText(res: Response, id: string, model: string, text: string, chunkSize = 24) {
    for (let i = 0; i < text.length; i += chunkSize) {
      this.writeContent(res, id, model, text.slice(i, i + chunkSize));
    }
    this.endStream(res, id, model);
  }

  private writeChunk(
    res: Response,
    id: string,
    model: string,
    content: string,
    deltaExtra?: Record<string, string> | null,
    finishReason: string | null = null,
  ) {
    const delta: Record<string, string> = { ...deltaExtra };
    if (content) delta.content = content;

    const payload = {
      id,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          delta,
          finish_reason: finishReason,
        },
      ],
    };

    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}
