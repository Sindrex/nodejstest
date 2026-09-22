const http = require('http');

const items = [];
const MAX_BODY_SIZE = 1024 * 1024;
let nextId = 1;

const sendJson = (response, statusCode, payload, headers = {}) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    ...headers,
  });
  response.end(JSON.stringify(payload));
};

const createHttpError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const readJsonBody = async (request) => {
  const contentLength = Number(request.headers['content-length']);

  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_SIZE) {
    throw createHttpError(413, 'Request body too large');
  }

  const chunks = [];
  let bodySize = 0;

  for await (const chunk of request) {
    bodySize += chunk.length;

    if (bodySize > MAX_BODY_SIZE) {
      throw createHttpError(413, 'Request body too large');
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    throw createHttpError(400, 'Invalid JSON body');
  }
};

const findItemById = (id) => items.find((item) => item.id === id);
const getValidatedName = (payload) => {
  if (typeof payload.name !== 'string') {
    return null;
  }

  const name = payload.name.trim();
  return name ? name : null;
};
const sendError = (response, error) => {
  if (error.statusCode) {
    sendJson(response, error.statusCode, { error: error.message });
    return;
  }

  sendJson(response, 500, { error: 'Internal server error' });
};

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
        const name = getValidatedName(payload);

        if (!name) {
          sendError(response, createHttpError(400, 'Item name is required'));
          return;
        }

        const item = { id: nextId++, name };
        items.push(item);
        sendJson(response, 201, { item });
      } catch (error) {
        sendError(response, error);
      }

      return;
    }

    sendJson(
      response,
      405,
      { error: 'Method not allowed' },
      { Allow: 'GET, POST' }
    );
    return;
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
        const name = getValidatedName(payload);

        if (!name) {
          sendError(response, createHttpError(400, 'Item name is required'));
          return;
        }

        item.name = name;
        sendJson(response, 200, { item });
      } catch (error) {
        sendError(response, error);
      }

      return;
    }

    if (request.method === 'DELETE') {
      const itemIndex = items.findIndex((entry) => entry.id === id);
      items.splice(itemIndex, 1);
      sendJson(response, 200, { message: 'Item deleted' });
      return;
    }

    sendJson(
      response,
      405,
      { error: 'Method not allowed' },
      { Allow: 'GET, PUT, DELETE' }
    );
    return;
  }

  sendJson(response, 404, { error: 'Route not found' });
};

const requestListener = async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');

    if (pathname === '/health' && request.method === 'GET') {
      sendJson(response, 200, { status: 'ok' });
      return;
    }

    if (pathname === '/health') {
      sendJson(
        response,
        405,
        { error: 'Method not allowed' },
        { Allow: 'GET' }
      );
      return;
    }

    if (pathname === '/api/items' || /^\/api\/items\/\d+$/.test(pathname)) {
      await handleItemsRoute(request, response, pathname);
      return;
    }

    sendJson(response, 404, { error: 'Route not found' });
  } catch (error) {
    sendError(response, error);
  }
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
