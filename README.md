### Pump Fun Indexer

### Google Cloud Storage
https://console.cloud.google.com/storage/browser/pump-fun-metadata

### Generate RSA keys and set env variables
https://stackoverflow.com/a/68730638/7311367

### Recreate DB
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

// set new env variables if needed

flyctl deploy --ha=false

flyctl scale count 1
```
