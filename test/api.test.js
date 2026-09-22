const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, resetItems } = require('../app');

const startServer = () =>
  new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => resolve(server));
  });

const stopServer = (server) =>
  new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

test.beforeEach(() => {
  resetItems();
});

test('GET /health returns API health status', async () => {
  const server = await startServer();
  const address = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body, { status: 'ok' });
  } finally {
    await stopServer(server);
  }
});

test('CRUD operations work for /api/items', async () => {
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/items`;

  try {
    const createResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'First item' }),
    });
    const created = await createResponse.json();

    assert.equal(createResponse.status, 201);
    assert.deepEqual(created, { item: { id: 1, name: 'First item' } });

    const listResponse = await fetch(baseUrl);
    const listed = await listResponse.json();

    assert.equal(listResponse.status, 200);
    assert.deepEqual(listed, { items: [{ id: 1, name: 'First item' }] });

    const updateResponse = await fetch(`${baseUrl}/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Updated item' }),
    });
    const updated = await updateResponse.json();

    assert.equal(updateResponse.status, 200);
    assert.deepEqual(updated, { item: { id: 1, name: 'Updated item' } });

    const deleteResponse = await fetch(`${baseUrl}/1`, { method: 'DELETE' });
    const deleted = await deleteResponse.json();

    assert.equal(deleteResponse.status, 200);
    assert.deepEqual(deleted, { message: 'Item deleted' });
  } finally {
    await stopServer(server);
  }
});
