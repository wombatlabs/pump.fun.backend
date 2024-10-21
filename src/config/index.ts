import * as process from 'process';

const parseStringArray = (value: string) =>
  value.split(',').map(item => item.trim().toLowerCase()).filter(_ => _)

export default () => ({
  version: process.env.npm_package_version || '0.0.1',
  name: process.env.npm_package_name || '',
  port: parseInt(process.env.PORT, 10) || 3000,
  RPC_URL: process.env.RPC_URL || 'https://a.api.s0.t.hmny.io',
  RATE_LIMITER_TTL: parseInt(process.env.RATE_LIMITER_TTL) || 10000,
  RATE_LIMITER_LIMIT: parseInt(process.env.RATE_LIMITER_LIMIT) || 20,
  PUMP_FUN_CONTRACT_ADDRESS: process.env.PUMP_FUN_CONTRACT_ADDRESS || '',
  PUMP_FUN_INITIAL_BLOCK_NUMBER: parseInt(process.env.PUMP_FUN_INITIAL_BLOCK_NUMBER || '0')
});
