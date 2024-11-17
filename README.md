### Pump Fun Backend

### Authorization with MetaMask
1. Client initiates the login process and send POST `/user/nonce` with user address in request body
2. Backend generates a one-time nonce associated with user address
3. Client signing a message `I'm signing my one-time nonce: <nonce>` with Metamask
4. Client send signed message to Backend via POST `/user/verify`
5. Backend verifies the signature
6. If the signature and nonce are valid, Backend generate JWT tokens to maintain the session for the user. The nonce is invalidated to prevent reuse.

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
```shell
flyctl scale count 0

flyctl postgres connect -a pump-fun-backend-db

\l

SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE pid <> pg_backend_pid() AND datname = 'pump_fun_backend';

drop database pump_fun_backend;

create database pump_fun_backend;

\q

// Set new env variables if needed: flyctl secrete set <secret_name> <secret_value>

flyctl deploy --ha=false
```
