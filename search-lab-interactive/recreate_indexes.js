// MongoDB commands to recreate critical search indexes after importing vectorized data

// 1. Recreate fulltextsearch_dynamic (most important for interactive exercises)
db.books.createSearchIndex('fulltextsearch_dynamic', {
  mappings: {
    dynamic: true
  }
});

// 2. Recreate fulltextsearch (used in some examples and hybrid search)
db.books.createSearchIndex('fulltextsearch', {
  mappings: {
    dynamic: false,
    fields: {
      title: {
        type: 'string'
      },
      synopsis: {
        type: 'string'
      },
      genres: {
        type: 'string'
      }
    }
  }
});

// 3. Recreate facetsIndexName (for facet exercises)
db.books.createSearchIndex('facetsIndexName', {
  mappings: {
    dynamic: false,
    fields: {
      genres: [
        {
          type: 'string'
        },
        {
          type: 'stringFacet'
        }
      ],
      year: {
        type: 'number'
      }
    }
  }
});

// 4. Create vector search index for hybrid search
db.books.createSearchIndex('vectorsearch', {
  fields: [
    {
      type: 'vector',
      path: 'embeddings',
      numDimensions: 1408,
      similarity: 'cosine'
    }
  ]
});