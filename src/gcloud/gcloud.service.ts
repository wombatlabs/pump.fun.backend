import {Injectable, Logger} from '@nestjs/common';
import {ConfigService} from "@nestjs/config";
import {Storage} from "@google-cloud/storage";
import {AddTokenMetadataDto} from "../dto/metadata.dto";

@Injectable()
export class GcloudService {
  private readonly logger = new Logger(GcloudService.name);
  private readonly storage: Storage;

  constructor(private readonly configService: ConfigService) {
    this.storage = new Storage({
      projectId: 'pumpfun-440412',
      // keyFilename: serviceKey,
      credentials: this.configService.get('GOOGLE_CLOUD_CONFIG')
    })
  }

  public async uploadImage(uploadedFile: Express.Multer.File, filename: string) {
    const bucket = this.storage.bucket('pump-fun-metadata')
    const storageFileUrl = `images/${filename}.jpg`
    const file = bucket.file(storageFileUrl)
    await file.save(uploadedFile.buffer)
    return `https://storage.googleapis.com/pump-fun-metadata/${storageFileUrl}`
  }

  public async uploadMetadata(dto: AddTokenMetadataDto, filename: string) {
    const bucket = this.storage.bucket('pump-fun-metadata')
    const storageFileUrl = `metadata/${filename}.json`
    const file = bucket.file(storageFileUrl)
    await file.save(JSON.stringify(dto))
    return `https://storage.googleapis.com/pump-fun-metadata/${storageFileUrl}`
  }
}
