import React, { useState } from 'react';
import axios from 'axios';
import InteractiveQueryEditor from '../InteractiveQueryEditor';
import styles from './styles.module.css';

const InteractiveExercise = ({
  title,
  description,
  initialQuery = '',
  expectedResult = null,
  hint = '',
  solution = '',
  collection = 'movies'
}) => {
  const [showSolution, setShowSolution] = useState(false);

  const executeQuery = async (query, callback) => {
    try {
      const response = await axios.post('http://localhost:3001/api/search/execute', {
        query: query.trim(),
        collection: collection
      });

      callback(response.data.result, null);
    } catch (error) {
      const errorMsg = error.response?.data?.details || error.message;
      if (errorMsg.includes('Not connected to database')) {
        callback(null, 'Please connect to MongoDB first. Make sure your .env file is configured with MONGODB_USERNAME, MONGODB_PASSWORD, and MONGODB_LOCATION.');
      } else {
        callback(null, errorMsg);
      }
    }
  };

  return (
    <div className={styles.interactiveExercise}>
      <div className={styles.exerciseHeader}>
        <h4>{title}</h4>
        {description && <p className={styles.description}>{description}</p>}
      </div>

      <InteractiveQueryEditor
        initialQuery={initialQuery}
        onQueryExecute={executeQuery}
        expectedResult={expectedResult}
        hint={hint}
        collection={collection}
      />

      {solution && (
        <div className={styles.solutionSection}>
          <button
            onClick={() => setShowSolution(!showSolution)}
            className={styles.solutionToggle}
          >
            {showSolution ? 'Hide Solution' : 'Show Solution'}
          </button>

          {showSolution && (
            <div className={styles.solution}>
              <h5>Solution:</h5>
              <pre><code>{solution}</code></pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InteractiveExercise;