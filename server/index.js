const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve search lab static files 
// Since the build has baseUrl '/search-lab/', we need to serve the root build at the search-lab path
app.use("/search-lab", express.static(path.join(__dirname, "../search-lab-interactive/build"), {
  index: false // Disable directory index to handle routing properly
}));

// For any search-lab route that doesn't match a static file, serve the main index.html
app.get("/search-lab*", (req, res) => {
  res.sendFile(path.join(__dirname, "../search-lab-interactive/build/index.html"));
});

// Serve sql lab static files
// Since the build has baseUrl '/sql-to-query-api-lab/', we need to serve the root build at the sql lab path
app.use("/sql-to-query-api-lab", express.static(path.join(__dirname, "../sql-to-query-api-lab-interactive/build"), {
  index: false // Disable directory index to handle routing properly
}));

// For any sql-lab route that doesn't match a static file, serve the main index.html
app.get("/sql-to-query-api-lab*", (req, res) => {
  res.sendFile(path.join(__dirname, "../sql-to-query-api-lab-interactive/build/index.html"));
});

let mongoClient = null;
let currentDb = null;

const connectToMongoDB = async () => {
  try {
    const username = process.env.MONGODB_USERNAME;
    const password = process.env.MONGODB_PASSWORD;
    const location = process.env.MONGODB_LOCATION;

    if (!username || !password) {
      console.warn('MONGODB_USERNAME, MONGODB_PASSWORD, and MONGODB_LOCATION must be set in .env file for API functionality');
      console.warn('Server will start without database connection - only serving static files');
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
    console.warn('Server will start without database connection - only serving static files');
  }
};

// Search lab query parsing function
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

// SQL lab query parsing function
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

// Search Lab API endpoints
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

    console.log('Received search query:', query);

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
      console.error('Search query execution error:', evalError);
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

// SQL Lab API endpoints
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

    console.log('Received SQL query:', query);

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
      console.error('SQL query execution error:', evalError);
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
    console.error('SQL query execution error:', error.message);
    res.status(500).json({
      error: 'Failed to execute query',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (_, res) => {
  res.json({
    status: 'ok',
    connected: !!currentDb,
    timestamp: new Date().toISOString(),
    labs: {
      'search-lab': 'available at /search-lab',
      'sql-to-query-api-lab': 'available at /sql-to-query-api-lab'
    }
  });
});

// Root redirect to search lab by default
app.get("/", (req, res) => {
  res.redirect("/search-lab");
});

// Catch-all for any other routes - serve search lab by default
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../search-lab-interactive/build/index.html"));
});

app.listen(port, () => {
  console.log(`Unified intro labs server running on http://localhost:${port}`);
  console.log(`Search Lab: http://localhost:${port}/search-lab`);
  console.log(`SQL Lab: http://localhost:${port}/sql-to-query-api-lab`);
});