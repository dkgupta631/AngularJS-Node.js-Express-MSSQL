/*
  Product CRUD database schema for Microsoft SQL Server.
  Run this script in SQL Server Management Studio if your application login
  is not allowed to create databases automatically.
*/

IF DB_ID(N'product_crud') IS NULL
  CREATE DATABASE product_crud;
GO

USE product_crud;
GO

IF OBJECT_ID(N'dbo.products', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.products (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL,
    category NVARCHAR(60) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    stock INT NOT NULL CONSTRAINT CK_products_stock CHECK (stock >= 0),
    description NVARCHAR(300) NOT NULL DEFAULT N'',
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.chat_rooms', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.chat_rooms (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(100) NOT NULL UNIQUE,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
GO

IF OBJECT_ID(N'dbo.chat_messages', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.chat_messages (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    room_id INT NOT NULL,
    sender NVARCHAR(60) NOT NULL,
    message NVARCHAR(MAX) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_chat_messages_room_id FOREIGN KEY (room_id) REFERENCES dbo.chat_rooms(id) ON DELETE CASCADE
  );
END;
GO

IF NOT EXISTS (SELECT 1 FROM dbo.chat_rooms WHERE name = N'Support')
BEGIN
  INSERT INTO dbo.chat_rooms (name) VALUES (N'Support');
END;
GO
