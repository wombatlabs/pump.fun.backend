import * as process from 'process';

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
  RPC_URL: process.env.RPC_URL || 'https://a.api.s0.t.hmny.io',
  RATE_LIMITER_TTL: parseInt(process.env.RATE_LIMITER_TTL) || 10000,
  RATE_LIMITER_LIMIT: parseInt(process.env.RATE_LIMITER_LIMIT) || 20,
  PUMP_FUN_CONTRACT_ADDRESS: process.env.PUMP_FUN_CONTRACT_ADDRESS || '',
  PUMP_FUN_INITIAL_BLOCK_NUMBER: parseInt(process.env.PUMP_FUN_INITIAL_BLOCK_NUMBER || '0'),
  GOOGLE_CLOUD_CONFIG: getGoogleCloudConfig()
});
