# Coolify Migrator

This project aims to help users who have left their data on version [**Coolify**](https://coolify.io) `v3` to migrate to version `v4`

> [!NOTE]
> Tested and working with Coolify `4.0.0-beta.340`

> [!IMPORTANT]
> This project is not affiliated with the Coolify project and author!

> [!CAUTION]
> We assume no responsibility for errors or erroneous data transmitted during migration. You are 100% responsible that the migration may fail or that you may lose data.

# Migrations supported:

- [ ] **Sources**

  - [x] **GitHub**
    - Source
    - Private keys
  - [ ] GitLab

- [ ] **Databases**

  - [x] PostgreSQL
    - Container
    - Volume data migration from dump
  - [x] MySQL
    - Container
    - Volume data migration from dump
  - [ ] MongoDB _(not really planned)_
  - [ ] MariaDB _(not really planned)_
  - [ ] CouchDB _(not really planned)_
  - [ ] EdgeDB _(not really planned)_

- [x] **Applications**

  - [x] Deployment
  - [x] Secrets
  - [x] Persistent Volumes

> [!IMPORTANT]
> Services cannot be migrated and transferred directly, due to the architecture difference between the 2 versions. We currently offer a dump transfer (volumes + databases) from where you can manually import

- [ ] **Services**

  - [x] Wordpress + MySQL

# How to run it:

1. Complete `.env` with the server connection variables

2. Import `v3` database:

```
yarn import:db
```

3. Install the proxy on `v4` server:

```
yarn proxy
```

4. Complete your env file with the printed values from proxy installation (`V3_SECRET_KEY`, `V4_SECRET_KEY`, `V4_DATABASE`)

5. Start the migration interface:

```
yarn start
```

Also, make sure to create your own API key with `All (root/admin access), be careful!` permissions in your `v4` instance!

## License

This project is licensed under the [MIT License](LICENSE).
