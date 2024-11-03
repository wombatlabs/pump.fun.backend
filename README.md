### Pump Fun Indexer

### Google Cloud Storage
https://console.cloud.google.com/storage/browser/pump-fun-metadata

### Recreated DB
```shell
flyctl postgres connect -a pump-fun-backend-db
\l
drop database pump_fun_backend;

If some session is using DB:
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE pid <> pg_backend_pid() AND datname = 'pump_fun_backend';

create database pump_fun_backend;

```
