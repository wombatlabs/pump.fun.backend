import {Injectable} from '@nestjs/common';
import {ConfigService} from "@nestjs/config";
import {Storage} from "@google-cloud/storage";
import {AddTokenMetadataDto} from "../dto/metadata.dto";
import {JWTInput} from "google-auth-library/build/src/auth/credentials";

@Injectable()
export class GcloudService {
  private readonly storage: Storage;

  constructor(private readonly configService: ConfigService) {
    const googleCloudConfig = this.configService.get<JWTInput>('GOOGLE_CLOUD_CONFIG')
    this.storage = new Storage({
      projectId: googleCloudConfig.project_id,
      credentials: googleCloudConfig
    })
  }

  public async uploadImage(uploadedFile: Express.Multer.File, filename: string) {
    const bucket = this.storage.bucket('pump-fun-metadata')
    const storageFileUrl = `images/${filename}`
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
