import { Injectable } from '@nestjs/common';
import { MediaService } from '../media.service';
import { ProcessingMode } from '../media.types';

@Injectable()
export class ImageProcessor {
  constructor(private readonly media: MediaService) {}

  async process(mediaAssetId: string, mode?: ProcessingMode) {
    return this.media.processImageSync(mediaAssetId, mode);
  }
}
