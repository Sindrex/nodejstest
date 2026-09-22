const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
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

const sendRequest = ({ port, path, method, headers = {}, body = '' }) =>
  new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path,
        method,
        headers,
      },
      (response) => {
        let responseBody = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: JSON.parse(responseBody),
          });
        });
      }
    );

    request.on('error', reject);
    request.end(body);
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

    const getResponse = await fetch(`${baseUrl}/1`);
    const fetched = await getResponse.json();

    assert.equal(getResponse.status, 200);
    assert.deepEqual(fetched, { item: { id: 1, name: 'First item' } });

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

    const missingResponse = await fetch(`${baseUrl}/1`);
    const missing = await missingResponse.json();

    assert.equal(missingResponse.status, 404);
    assert.deepEqual(missing, { error: 'Item not found' });
  } finally {
    await stopServer(server);
  }
});

test('invalid payloads return validation errors', async () => {
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}/api/items`;

  try {
    const missingNameResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const missingName = await missingNameResponse.json();

    assert.equal(missingNameResponse.status, 400);
    assert.deepEqual(missingName, { error: 'Item name is required' });

    const blankNameResponse = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    const blankName = await blankNameResponse.json();

    assert.equal(blankNameResponse.status, 400);
    assert.deepEqual(blankName, { error: 'Item name is required' });

    await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Existing item' }),
    });

    const blankUpdateResponse = await fetch(`${baseUrl}/1`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    const blankUpdate = await blankUpdateResponse.json();

    assert.equal(blankUpdateResponse.status, 400);
    assert.deepEqual(blankUpdate, { error: 'Item name is required' });

    const invalidJsonResponse = await sendRequest({
      port: address.port,
      path: '/api/items',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":',
    });

    assert.equal(invalidJsonResponse.statusCode, 400);
    assert.deepEqual(invalidJsonResponse.body, { error: 'Invalid JSON body' });
  } finally {
    await stopServer(server);
  }
});

test('unsupported methods return 405 for known routes', async () => {
  const server = await startServer();
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const healthResponse = await fetch(`${baseUrl}/health`, { method: 'POST' });
    const healthBody = await healthResponse.json();

    assert.equal(healthResponse.status, 405);
    assert.equal(healthResponse.headers.get('allow'), 'GET');
    assert.deepEqual(healthBody, { error: 'Method not allowed' });

    await fetch(`${baseUrl}/api/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Existing item' }),
    });

    const itemResponse = await fetch(`${baseUrl}/api/items/1`, { method: 'PATCH' });
    const itemBody = await itemResponse.json();

    assert.equal(itemResponse.status, 405);
    assert.equal(itemResponse.headers.get('allow'), 'GET, PUT, DELETE');
    assert.deepEqual(itemBody, { error: 'Method not allowed' });
  } finally {
    await stopServer(server);
  }
});

test('large request bodies return 413', async () => {
  const server = await startServer();
  const address = server.address();

  try {
    const result = await sendRequest({
      port: address.port,
      path: '/api/items',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': 1024 * 1024 + 1,
      },
      body: '{}',
    });

    assert.equal(result.statusCode, 413);
    assert.deepEqual(result.body, { error: 'Request body too large' });
  } finally {
    await stopServer(server);
  }
});
