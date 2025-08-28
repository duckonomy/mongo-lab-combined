const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

app.use("/search-lab", express.static(path.join(__dirname, "../build")));

app.get("/search-lab/*", (req, res) => {
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
    console.log('Connected to MongoDB Atlas');
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
  }
};

function parseSearchQuery(queryString) {
  if (!queryString.trim()) return {};

  try {
    if (queryString.includes('$search')) {
      let cleanedQuery = queryString.replace(/"wildcard"/g, 'wildcard');
      const evalFunc = new Function('return ' + cleanedQuery);
      return evalFunc();
    }

    const evalFunc = new Function('return ' + queryString);
    return evalFunc();
  } catch (error) {
    console.error('Error parsing search query:', error.message);
    return {};
  }
}

connectToMongoDB();

app.post('/api/search/execute', async (req, res) => {
  try {
    if (!currentDb) {
      return res.status(400).json({
        error: 'Not connected to database. Please connect first.'
      });
    }

    const { query, collection = 'movies' } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query is required' });
    }

    console.log('Received query:', query);

    let result;

    try {
      const cleanQuery = query.replace(/;$/, '').trim();

      if (cleanQuery.startsWith('[') && cleanQuery.endsWith(']')) {
        const pipeline = parseSearchQuery(cleanQuery);
        console.log('Executing pipeline:', JSON.stringify(pipeline, null, 2));
        result = await currentDb.collection(collection).aggregate(pipeline).toArray();
      } else {
        const dbMatch = cleanQuery.match(/^db\.(\w+)\.(.*)/);

        if (!dbMatch) {
          const searchQuery = parseSearchQuery(cleanQuery);
          if (Array.isArray(searchQuery)) {
            result = await currentDb.collection(collection).aggregate(searchQuery).toArray();
          } else {
            result = await currentDb.collection(collection).find(searchQuery).toArray();
          }
        } else {
          const collectionName = dbMatch[1];
          const methodCall = dbMatch[2];
          const coll = currentDb.collection(collectionName);

          const methodMatch = methodCall.match(/^(\w+)\((.*)\)$/s);
          if (!methodMatch) {
            return res.status(400).json({
              error: 'Invalid method call format'
            });
          }

          const method = methodMatch[1];
          const argsString = methodMatch[2].trim();

          if (method === 'aggregate') {
            const pipeline = parseSearchQuery(argsString);
            result = await coll.aggregate(pipeline).toArray();
          } else if (method === 'find') {
            let filter = {};
            let projection = null;

            if (argsString) {
              const args = parseSearchQuery(`[${argsString}]`);
              if (args.length > 0) filter = args[0];
              if (args.length > 1) projection = args[1];
            }

            const cursor = coll.find(filter);
            if (projection && Object.keys(projection).length > 0) {
              cursor.project(projection);
            }
            result = await cursor.limit(20).toArray();
          } else {
            result = await eval(`coll.${methodCall}`);
            if (result && typeof result.toArray === 'function') {
              result = await result.toArray();
            }
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
    console.error('Search execution error:', error.message);
    res.status(500).json({
      error: 'Failed to execute search query',
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
  console.log(`Search lab server running on http://localhost:${port}`);
});
