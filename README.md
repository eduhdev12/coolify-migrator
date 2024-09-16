# Coolify Migrator

This project aims to help users who have left their data on version [**Coolify**](https://coolify.io) `v3` to migrate to version `v4`

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

- [ ] **Services**

  - [ ] Deployment
  - [ ] Secrets
  - [ ] Volume data
  - [ ] Persistent volumes

## License

This project is licensed under the [MIT License](LICENSE).
