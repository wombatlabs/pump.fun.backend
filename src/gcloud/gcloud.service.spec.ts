import { Test, TestingModule } from '@nestjs/testing';
import { GcloudService } from './gcloud.service';

describe('GcloudService', () => {
  let service: GcloudService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GcloudService],
    }).compile();

    service = module.get<GcloudService>(GcloudService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
