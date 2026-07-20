# Product — AngularJS + Node.js + Express + Microsoft SQL Server

## Run it

1. Start Microsoft SQL Server and ensure TCP/IP connections are enabled (typically port `1433`).
2. Copy `.env.example` to `.env`, then set your SQL Server host/instance and login details. For a SQL Server Express instance, set `DB_SERVER=localhost`, `DB_INSTANCE=SQLEXPRESS`, and leave `DB_PORT` blank if it uses dynamic ports.
3. Run:

```powershell
npm.cmd install
npm.cmd start
```

Open http://localhost:3000.

The REST API is available at `/api/products` and supports `GET`, `POST`, `PUT /:id`, and `DELETE /:id`. Product records are persisted in the SQL Server `product_crud.dbo.products` table. The server creates the database and table automatically.

The default connection uses `localhost:1433` and SQL Server authentication. Set `DB_SERVER`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and (if needed) `DB_ENCRYPT` in `.env`. Your login needs permission to create a database; if it does not, create `product_crud` manually and grant the login access to it.

The standalone SQL Server schema is in `database/schema.sql`. Open it in SQL Server Management Studio and execute it to create the database and table manually.
