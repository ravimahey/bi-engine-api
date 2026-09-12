import { Module } from '@nestjs/common';
import { UploadService } from './services';

@Module({
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
