import express, { json } from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import path from "path";
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

const app = express();
const port = 3001;

app.use(cors());
app.use(json());

app.use("/sql-to-query-api-lab", express.static(path.join(__dirname, "../build")));

app.get("/sql-to-query-api-lab/*", (req, res) => {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});

let mongoClient = null;
let currentDb = null;

const connectToMongoDB = async () => {
  try {
    const username = process.env.MONGODB_USERNAME;
    const password = process.env.MONGODB_PASSWORD;
    const location = process.env.MONGODB_LOCATION;

    if (!username || !password) {
      console.error('MONGODB_USERNAME, MONGODB_PASSWORD, and MONGODB_LOCATION must be set in .env file');
      return;
    }

    const connectionString = `mongodb+srv://${username}:${password}@${location}`;

    mongoClient = new MongoClient(connectionString);
    await mongoClient.connect();
    currentDb = mongoClient.db('library_clean');

    await currentDb.admin().ping();
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
  }
};

function parseMongoArguments(argsString) {
  if (!argsString.trim()) return [];

  try {
    const evalFunc = new Function('return [' + argsString + '];');
    return evalFunc();
  } catch (error) {
    console.error('Error parsing MongoDB arguments:', error.message);
    return [];
  }
}

connectToMongoDB();

app.post('/api/query/execute', async (req, res) => {
  try {
    if (!currentDb) {
      return res.status(400).json({
        error: 'Not connected to database. Please connect first.'
      });
    }

    const { query } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    let result;

    try {
      const cleanQuery = query.replace(/;$/, '').trim();
      const dbMatch = cleanQuery.match(/^db\.(\w+)\.(.*)/);

      if (!dbMatch) {
        try {
          const parsedQuery = JSON.parse(query);
          const coll = currentDb.collection('books');

          if (parsedQuery.operation === 'find') {
            const cursor = coll.find(parsedQuery.filter || {});
            if (parsedQuery.project) cursor.project(parsedQuery.project);
            result = await cursor.toArray();
          }
        } catch (jsonError) {
          return res.status(400).json({
            error: 'Query must start with db.collection.method() or be valid JSON'
          });
        }
      } else {
        const collection = dbMatch[1];
        const methodCall = dbMatch[2];
        const coll = currentDb.collection(collection);

        const methodMatch = methodCall.match(/^(\w+)\((.*)\)$/s);
        if (!methodMatch) {
          return res.status(400).json({
            error: 'Invalid method call format'
          });
        }

        const method = methodMatch[1];
        const argsString = methodMatch[2].trim();

        if (method === 'find') {
          let filter = {};
          let projection = null;

          if (argsString) {
            const args = parseMongoArguments(argsString);
            if (args.length > 0) filter = args[0];
            if (args.length > 1) projection = args[1];
          }

          const cursor = coll.find(filter);
          if (projection && Object.keys(projection).length > 0) {
            cursor.project(projection);
          }
          result = await cursor.toArray();

        } else if (method === 'aggregate') {
          const args = parseMongoArguments(argsString);
          const pipeline = args[0] || [];
          result = await coll.aggregate(pipeline).toArray();

        } else {
          result = await eval(`coll.${methodCall}`);
          if (result && typeof result.toArray === 'function') {
            result = await result.toArray();
          }
        }
      }

    } catch (evalError) {
      console.error('Query execution error:', evalError);
      return res.status(400).json({
        error: 'Invalid query format',
        details: evalError.message
      });
    }

    res.json({
      success: true,
      result: result,
      count: Array.isArray(result) ? result.length : 1
    });

  } catch (error) {
    console.error('Query execution error:', error.message);
    res.status(500).json({
      error: 'Failed to execute query',
      details: error.message
    });
  }
});

app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    connected: !!currentDb,
    timestamp: new Date().toISOString()
  });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../build/index.html"));
});

app.listen(port, () => {
  console.log(`Simple MongoDB server running on http://localhost:${port}`);
});
