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
flyctl secrets set TOKEN_FACTORY="0xc115aDA811C5c81f1EafcBe5526d5Fcb73B6b40D,69952745;0x7400bE22b1F3fF409E58738E4cF32290f60b7504,69952955"
flyctl secrets set COMPETITION_COLLATERAL_THRESHOLD=420000
flyctl secrets set COMPETITION_DAYS_INTERVAL=7

flyctl secrets set TOKEN_FACTORY="0xc115aDA811C5c81f1EafcBe5526d5Fcb73B6b40D,69952745;0x7400bE22b1F3fF409E58738E4cF32290f60b7504,69952955" --config fly.staging.toml
flyctl secrets set COMPETITION_COLLATERAL_THRESHOLD=420000 --config fly.staging.toml
flyctl secrets set COMPETITION_DAYS_INTERVAL=7 --config fly.staging.toml
```

#### Deploy backend update
```shell
flyctl deploy --ha=false

flyctl deploy --ha=false --config fly.staging.toml
```

### How to reattach new database to existed app

#### Production DB
```shell
fly postgres detach pump-fun-backend-db
fly postgres create
fly postgres attach pump-fun-db --app pump-fun-backend
flyctl deploy --ha=false
```

#### Staging DB
```shell
fly postgres detach pump-fun-backend-staging-db --config fly.staging.toml
fly postgres create 
fly postgres attach pump-fun-backend-staging-db-2 --app pump-fun-backend-staging
flyctl deploy --ha=false --config fly.staging.toml
```

### How to generate new database migration
```shell
npm run migration:generate --name=Initial
```

### Deployments

#### Production

##### .env config
```shell
TOKEN_FACTORY=0xc115aDA811C5c81f1EafcBe5526d5Fcb73B6b40D,69952745;0x7400bE22b1F3fF409E58738E4cF32290f60b7504,69952955

```

##### Deployed contracts:
```shell
TokenFactory: 0xc115aDA811C5c81f1EafcBe5526d5Fcb73B6b40D
TokenFactoryBase: 0x7400bE22b1F3fF409E58738E4cF32290f60b7504
```
