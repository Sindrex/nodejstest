const http = require('http');

const items = [];
let nextId = 1;

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(payload));
};

const readJsonBody = (request) =>
  new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
    });

    request.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });

    request.on('error', reject);
  });

const findItemById = (id) => items.find((item) => item.id === id);

const handleItemsRoute = async (request, response, pathname) => {
  const idMatch = pathname.match(/^\/api\/items\/(\d+)$/);

  if (pathname === '/api/items') {
    if (request.method === 'GET') {
      sendJson(response, 200, { items });
      return;
    }

    if (request.method === 'POST') {
      try {
        const payload = await readJsonBody(request);

        if (!payload.name || typeof payload.name !== 'string') {
          sendJson(response, 400, { error: 'Item name is required' });
          return;
        }

        const item = { id: nextId++, name: payload.name };
        items.push(item);
        sendJson(response, 201, { item });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }

      return;
    }
  }

  if (idMatch) {
    const id = Number(idMatch[1]);
    const item = findItemById(id);

    if (!item) {
      sendJson(response, 404, { error: 'Item not found' });
      return;
    }

    if (request.method === 'GET') {
      sendJson(response, 200, { item });
      return;
    }

    if (request.method === 'PUT') {
      try {
        const payload = await readJsonBody(request);

        if (!payload.name || typeof payload.name !== 'string') {
          sendJson(response, 400, { error: 'Item name is required' });
          return;
        }

        item.name = payload.name;
        sendJson(response, 200, { item });
      } catch (error) {
        sendJson(response, 400, { error: error.message });
      }

      return;
    }

    if (request.method === 'DELETE') {
      const itemIndex = items.findIndex((entry) => entry.id === id);
      items.splice(itemIndex, 1);
      sendJson(response, 200, { message: 'Item deleted' });
      return;
    }
  }

  sendJson(response, 404, { error: 'Route not found' });
};

const requestListener = async (request, response) => {
  const { pathname } = new URL(request.url, 'http://localhost');

  if (pathname === '/health' && request.method === 'GET') {
    sendJson(response, 200, { status: 'ok' });
    return;
  }

  if (pathname === '/api/items' || /^\/api\/items\/\d+$/.test(pathname)) {
    await handleItemsRoute(request, response, pathname);
    return;
  }

  sendJson(response, 404, { error: 'Route not found' });
};

const createServer = () => http.createServer(requestListener);

const resetItems = () => {
  items.length = 0;
  nextId = 1;
};

module.exports = {
  createServer,
  resetItems,
};
