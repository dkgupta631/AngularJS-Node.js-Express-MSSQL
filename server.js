const express = require('express');
const http = require('http');
const path = require('path');
const sql = require('mssql');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
  server: process.env.DB_SERVER || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'product_crud',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true,
    instanceName: process.env.DB_INSTANCE || undefined
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};
let pool;

async function setupDatabase() {
  const bootstrap = await new sql.ConnectionPool({ ...dbConfig, database: 'master' }).connect();
  const dbName = dbConfig.database.replace(/[[\]]/g, '');

  try {
    await bootstrap.request().batch(`
      IF DB_ID(N'${dbName}') IS NULL
        EXEC('CREATE DATABASE [' + '${dbName}' + ']')
    `);
  } catch (error) {
    console.warn('Database bootstrap skipped:', error.message);
  }

  await bootstrap.close();
  pool = await new sql.ConnectionPool(dbConfig).connect();

  await ensureTable('dbo.products', `
    CREATE TABLE dbo.products (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(100) NOT NULL,
      category NVARCHAR(60) NOT NULL,
      price DECIMAL(10,2) NOT NULL,
      stock INT NOT NULL CONSTRAINT CK_products_stock CHECK (stock >= 0),
      description NVARCHAR(300) NOT NULL DEFAULT N'',
      created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    )
  `);

  await ensureTable('dbo.chat_rooms', `
    CREATE TABLE dbo.chat_rooms (
      id INT IDENTITY(1,1) PRIMARY KEY,
      name NVARCHAR(100) NOT NULL UNIQUE,
      created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
    )
  `);

  await ensureTable('dbo.chat_messages', `
    CREATE TABLE dbo.chat_messages (
      id BIGINT IDENTITY(1,1) PRIMARY KEY,
      room_id INT NOT NULL,
      sender NVARCHAR(60) NOT NULL,
      message NVARCHAR(MAX) NOT NULL,
      created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
      CONSTRAINT FK_chat_messages_room_id FOREIGN KEY (room_id) REFERENCES dbo.chat_rooms(id) ON DELETE CASCADE
    )
  `);

  try {
    const roomExists = await pool.request().query("SELECT TOP 1 id FROM dbo.chat_rooms WHERE name = N'Support'");
    if (!roomExists.recordset[0]) {
      try {
        await pool.request().query("INSERT INTO dbo.chat_rooms (name) VALUES (N'Support')");
      } catch (error) {
        console.warn('Default chat room seed skipped:', error.message);
      }
    }
  } catch (error) {
    console.warn('Chat room seeding skipped:', error.message);
  }
}

async function ensureTable(tableName, createSql) {
  const checkResult = await pool.request().query(`SELECT OBJECT_ID(N'${tableName}', N'U') AS objectId`);
  if (checkResult.recordset[0].objectId) return;

  try {
    await pool.request().query(createSql);
  } catch (error) {
    console.warn(`${tableName} table create skipped: ${error.message}`);
  }
}

function validateProduct(body) {
  const name = String(body.name || '').trim();
  const category = String(body.category || '').trim();
  const price = Number(body.price);
  const stock = Number(body.stock);

  if (!name || !category || !Number.isFinite(price) || price < 0 || !Number.isInteger(stock) || stock < 0) {
    return { error: 'Name and category are required. Price must be zero or more, and stock must be a whole number zero or more.' };
  }

  return {
    product: {
      name,
      category,
      price,
      stock,
      description: String(body.description || '').trim()
    }
  };
}

function validateChatMessage(body) {
  const sender = String(body.sender || '').trim();
  const message = String(body.message || '').trim();
  const roomId = Number(body.roomId);

  if (!sender || !message || !Number.isInteger(roomId) || roomId < 1) {
    return { error: 'Sender, room, and message are required.' };
  }

  return { chatMessage: { sender, message, roomId } };
}

app.get('/api/products', async (req, res, next) => {
  try {
    const result = await pool.request().query('SELECT id, name, category, price, stock, description FROM dbo.products ORDER BY id DESC');
    res.json(result.recordset);
  } catch (error) { next(error); }
});

app.get('/api/products/:id', async (req, res, next) => {
  try {
    const result = await pool.request().input('id', sql.Int, req.params.id)
      .query('SELECT id, name, category, price, stock, description FROM dbo.products WHERE id = @id');
    if (!result.recordset[0]) return res.status(404).json({ error: 'Product not found.' });
    res.json(result.recordset[0]);
  } catch (error) { next(error); }
});

app.post('/api/products', async (req, res, next) => {
  const result = validateProduct(req.body);
  if (result.error) return res.status(400).json(result);
  try {
    const product = result.product;
    const outcome = await productRequest(product)
      .query(`INSERT INTO dbo.products (name, category, price, stock, description)
        OUTPUT INSERTED.id VALUES (@name, @category, @price, @stock, @description)`);
    res.status(201).json({ id: outcome.recordset[0].id, ...product });
  } catch (error) { next(error); }
});

app.put('/api/products/:id', async (req, res, next) => {
  const result = validateProduct(req.body);
  if (result.error) return res.status(400).json(result);
  try {
    const product = result.product;
    const outcome = await productRequest(product).input('id', sql.Int, req.params.id)
      .query(`UPDATE dbo.products SET name = @name, category = @category, price = @price,
        stock = @stock, description = @description, updated_at = SYSUTCDATETIME() WHERE id = @id`);
    if (outcome.rowsAffected[0] === 0) return res.status(404).json({ error: 'Product not found.' });
    res.json({ id: Number(req.params.id), ...product });
  } catch (error) { next(error); }
});

app.delete('/api/products/:id', async (req, res, next) => {
  try {
    const outcome = await pool.request().input('id', sql.Int, req.params.id)
      .query('DELETE FROM dbo.products WHERE id = @id');
    if (outcome.rowsAffected[0] === 0) return res.status(404).json({ error: 'Product not found.' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.get('/api/chat/rooms', async (req, res, next) => {
  try {
    const result = await pool.request().query('SELECT id, name FROM dbo.chat_rooms ORDER BY id ASC');
    res.json(result.recordset);
  } catch (error) { next(error); }
});

app.get('/api/chat/rooms/:roomId/messages', async (req, res, next) => {
  try {
    const roomId = Number(req.params.roomId);
    if (!Number.isInteger(roomId) || roomId < 1) return res.status(400).json({ error: 'Room id is invalid.' });

    const roomResult = await pool.request().input('roomId', sql.Int, roomId)
      .query('SELECT id FROM dbo.chat_rooms WHERE id = @roomId');
    if (!roomResult.recordset[0]) return res.status(404).json({ error: 'Chat room not found.' });

    const messageResult = await pool.request().input('roomId', sql.Int, roomId)
      .query(`SELECT id, room_id AS roomId, sender, message, created_at AS createdAt
        FROM dbo.chat_messages WHERE room_id = @roomId ORDER BY id ASC`);
    res.json(messageResult.recordset);
  } catch (error) { next(error); }
});

app.post('/api/chat/rooms/:roomId/messages', async (req, res, next) => {
  const validation = validateChatMessage(req.body);
  if (validation.error) return res.status(400).json(validation);

  try {
    const roomId = Number(req.params.roomId);
    if (!Number.isInteger(roomId) || roomId < 1) return res.status(400).json({ error: 'Room id is invalid.' });

    const roomResult = await pool.request().input('roomId', sql.Int, roomId)
      .query('SELECT id FROM dbo.chat_rooms WHERE id = @roomId');
    if (!roomResult.recordset[0]) return res.status(404).json({ error: 'Chat room not found.' });

    const payload = validation.chatMessage;
    const outcome = await pool.request()
      .input('roomId', sql.Int, roomId)
      .input('sender', sql.NVarChar(60), payload.sender)
      .input('message', sql.NVarChar(sql.MAX), payload.message)
      .query(`INSERT INTO dbo.chat_messages (room_id, sender, message)
        OUTPUT INSERTED.id, INSERTED.room_id AS roomId, INSERTED.sender, INSERTED.message, INSERTED.created_at AS createdAt
        VALUES (@roomId, @sender, @message)`);

    const record = outcome.recordset[0];
    io.to(String(roomId)).emit('chat:message', record);
    res.status(201).json(record);
  } catch (error) { next(error); }
});

function productRequest(product) {
  return pool.request()
    .input('name', sql.NVarChar(100), product.name)
    .input('category', sql.NVarChar(60), product.category)
    .input('price', sql.Decimal(10, 2), product.price)
    .input('stock', sql.Int, product.stock)
    .input('description', sql.NVarChar(300), product.description);
}

io.on('connection', (socket) => {
  socket.on('chat:join-room', (roomId) => {
    if (roomId) socket.join(String(roomId));
  });

  socket.on('chat:leave-room', (roomId) => {
    if (roomId) socket.leave(String(roomId));
  });
});

app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ error: 'Database operation failed. Check the server connection settings.' });
});

setupDatabase()
  .then(() => server.listen(PORT, () => console.log(`Product CRUD is running at http://localhost:${PORT}`)))
  .catch((error) => { console.error('Unable to connect to SQL Server:', error.message); process.exit(1); });