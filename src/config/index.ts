import * as process from 'process';
import {resolve as pathResolve} from "path";
import {existsSync, readFileSync} from "fs";

const parseStringArray = (value: string) =>
  value.split(',').map(item => item.trim().toLowerCase()).filter(_ => _)

const getGoogleCloudConfig = () => {
  return {
    "type": "service_account",
    "project_id": "pumpfun-440412",
    "private_key_id": "b8e5f73e8bb7f4993a6b441733ee2f487d01a60e",
    "private_key": process.env.GOOGLE_CLOUD_PRIVATE_KEY.replace(/\\n/g, '\n'),
    "client_email": "pumpfunserviceaccount@pumpfun-440412.iam.gserviceaccount.com",
    "client_id": "112998611633035668262",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/pumpfunserviceaccount%40pumpfun-440412.iam.gserviceaccount.com",
    "universe_domain": "googleapis.com"
  }

}

export default () => ({
  version: process.env.npm_package_version || '0.0.1',
  name: process.env.npm_package_name || '',
  port: parseInt(process.env.PORT, 10) || 3000,
  JWT_EXPIRATION_DATE: process.env.JWT_EXPIRATION_DATE || '600000s',
  REFRESH_EXPIRATION_DATE: process.env.REFRESH_EXPIRATION_DATE || '3600000s',
  JWT_PRIVATE_KEY: Buffer.from(process.env.JWT_PRIVATE_KEY || '', 'base64').toString('ascii'),
  JWT_PUBLIC_KEY: Buffer.from(process.env.JWT_PUBLIC_KEY || '', 'base64').toString('ascii'),
  RPC_URL: process.env.RPC_URL || 'https://a.api.s0.t.hmny.io',
  RATE_LIMITER_TTL: parseInt(process.env.RATE_LIMITER_TTL) || 60000,
  RATE_LIMITER_LIMIT: parseInt(process.env.RATE_LIMITER_LIMIT) || 10,
  TOKEN_FACTORY: process.env.TOKEN_FACTORY || '',
  GOOGLE_CLOUD_CONFIG: getGoogleCloudConfig(),
  SERVICE_PRIVATE_KEY: process.env.SERVICE_PRIVATE_KEY || '',
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || '',
  COMPETITION_DAYS_INTERVAL: parseInt(process.env.COMPETITION_DAYS_INTERVAL || '7'),
  COMPETITION_COLLATERAL_THRESHOLD: parseInt(process.env.COMPETITION_COLLATERAL_THRESHOLD || '420000'), // in ONE tokens
});
