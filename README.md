### Pump Fun Indexer

### Google Cloud Storage
https://console.cloud.google.com/storage/browser/pump-fun-metadata

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

flyctl deploy

flyctl scale count 1
```
