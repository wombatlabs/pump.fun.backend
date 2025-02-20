### Pump Fun Backend

### What this app do
- Indexing PumpFun TokenFactory events and storing them in the database
- Processing client requests (REST API)
- Client authentication and provision of JWT tokens

### Env variables

| Env variable name            | Required | Default | Description                                                                                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                
|------------------------------|----------|---------|----------------------------------------------------------------------------------------------|
| NODE_ENV                     | false    | -       | Available values: "development", "production" ]                                              |
| PORT                         | false    | 3000    | Application port                                                                             |
| DATABASE_URL                 | true     | -       | Postgres DB connection string                                                                |
| TOKEN_FACTORY_ADDRESS        | true     | -       | Pump Fun TokenFactory address                                                                |
| INDEXER_INITIAL_BLOCK_NUMBER | true     | 0       | Block number on which Pump Fun TokenFactory was created. Required only for the first launch. |
| GOOGLE_CLOUD_PRIVATE_KEY     | true     | -       | Google Cloud Storage private key                                                             |
| SERVICE_PRIVATE_KEY          | true     | -       | Harmony Mainnet account private key. Required to send `setWinner` transaction once a day.    |
| JWT_PRIVATE_KEY              | true     | -       | JWT Private key in Base64 format (see "JWT keypair" for details)                             |
| JWT_PUBLIC_KEY               | true     | -       | JWT Public key in Base64 format (see "JWT keypair" for details)                              |

### Authorization with MetaMask
1. Client initiates the login process and send POST `/user/nonce` with user address in request body
2. Backend generates a one-time nonce associated with user address
3. Client signing a message `I'm signing my one-time nonce: <nonce>` with Metamask
4. Client send signed message to Backend via POST `/user/verify`
5. Backend verifies the signature
6. If the signature and nonce are valid, Backend generate JWT tokens to maintain the session for the user. The nonce is invalidated to prevent reuse.

List of endpoints that require JWT accessToken (`Authorization: Bearer <JWTAccessToken>`):
- POST /comment
- POST /uploadImage
- POST /metadata
- POST /user
- GET /user/sign-in
- POST /user/update

### Token metadata
Token metadata, such as .json file and token images, stored in GCS:
https://console.cloud.google.com/storage/browser/pump-fun-metadata

Example:
```shell
URI:
https://storage.googleapis.com/pump-fun-metadata/metadata/52548318-41f6-4e63-a94a-d7cdf9000dbf.json

Token image from URI:
https://storage.googleapis.com/pump-fun-metadata/images/52548318-41f6-4e63-a94a-d7cdf9000dbf.jpg
```

GCS configuration:
https://github.com/harmony-one/pump.fun.backend/blob/main/src/config/index.ts#L24

**NOTE**: some GCS configuration params currently hardcoded in `src/config/index.ts`.

### JWT keypair

1. Generate new RSA keypair:
```shell
./keypair/keygen.sh
```

2. Convert public and private keys to Base64 to easily set up via env variables:
https://stackoverflow.com/a/68730638/7311367

3. Set env variables:
```shell
JWT_PUBLIC_KEY=<PublicKeyBase64>
JWT_PRIVATE_KEY=<PrivateKeyBase64>
```

### Recreate DB on fly.io

#### Stop backend app
```shell
flyctl scale count 0
flyctl scale count 0 --config fly.staging.toml
```

####  (Optional) Drop postgres schema

Production:
```shell
flyctl postgres connect -a pump-fun-backend-db

\l

SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE pid <> pg_backend_pid() AND datname = 'pump_fun_backend';

drop database pump_fun_backend;

create database pump_fun_backend;

\q
```

Staging:
```shell
flyctl postgres connect -a pump-fun-backend-staging-db

SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE pid <> pg_backend_pid() AND datname = 'pump_fun_backend_staging';

drop database pump_fun_backend_staging;

create database pump_fun_backend_staging;

\q
```

#### (Optional) Set new env variables

```shell
flyctl secrets set TOKEN_FACTORY_ADDRESS=0xEa5CE8534c4a1462C56Ef82a0a82B7770c0c29ea
flyctl secrets set INDEXER_INITIAL_BLOCK_NUMBER=66615543

flyctl secrets set TOKEN_FACTORY="0x50331189a406cd0763EdcCa0c599f5328daFeB04,69663038;0x3C2fdEb2a8c62F41CCC626067D308c0603fd8F34,69665523" --config fly.staging.toml
flyctl secrets set COMPETITION_COLLATERAL_THRESHOLD=0.01 --config fly.staging.toml
flyctl secrets set COMPETITION_DAYS_INTERVAL=1 --config fly.staging.toml
```

#### Deploy backend update
```shell
flyctl deploy --ha=false

flyctl deploy --ha=false --config fly.staging.toml
```

### How to reattach new database to existed app
```shell
fly postgres detach pump-fun-backend-staging-db --config fly.staging.toml

fly postgres create 

fly postgres attach pump-fun-backend-staging-db-2 --app pump-fun-backend-staging

flyctl deploy --ha=false --config fly.staging.toml
```

### Generate new database migration
```shell
npm run migration:generate --name=Initial
```

### Deployments

#### Staging
```shell
Competition TokenFactory:
Token deployed to: 0x24605aadA2E4e2483B8B6097Df64d4E678C1a97E
BancorBondingCurve deployed to: 0x5fd343cC45B40BD44AACc5b7E7B5D9b3C4651BBC
NonfungiblePositionManager deployed to: 0x1B01BF64E54Cf024774a062c9DD857889341917A
TokenFactoryUpgradeable deployed to: 0xd5e9b7ec8f2e4feB6fab99209fa352ad6DE5D625
Processsing tokenFactory.startNewCompetition:
Sending tokenFactory.startNewCompetition...
... Sent! 0xc57081272c413ad50a472ff12de5debdf4d5c56ad09368012f893d198957c12a
startNewCompetition:  2

-------------------------------------------------------------------------------------

TokenFactoryBase:
Token deployed to: 0xdB7C0e81F9a032B1e94C7d0bBEB16A4BB7c8Ec4a
BancorBondingCurve deployed to: 0xc93a3092cc8753085Ab60e0F97840B88aC13aa18
NonfungiblePositionManager deployed to: 0x464B0Ef7640829F71fb5ae0BF0ee1c0632E76E93
TokenFactoryUpgradeable deployed to: 0xCBe0Ca4739282793D65c486c29a929624a0bcA5D
```
