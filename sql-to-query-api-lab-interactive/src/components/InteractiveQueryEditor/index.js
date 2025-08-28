import React, { useState } from 'react';
import MonacoEditor from '@monaco-editor/react';
import axios from 'axios';
import styles from './styles.module.css';

const InteractiveQueryEditor = ({
  initialQuery = '',
  onQueryExecute,
  expectedResult = null,
  exerciseTitle = '',
  hint = ''
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isCorrect, setIsCorrect] = useState(null);

  const defaultQueryExecute = async (query, callback) => {
    try {
      const response = await axios.post('http://localhost:3001/api/query/execute', {
        query: query.trim()
      });

      callback(response.data.result, null);
    } catch (error) {
      const errorMsg = error.response?.data?.details || error.message;
      if (errorMsg.includes('Not connected to database')) {
        callback(null, 'Please connect to MongoDB first.');
      } else {
        callback(null, errorMsg);
      }
    }
  };

  const executeQuery = async () => {
    if (!query.trim()) {
      setError('Please enter a query');
      return;
    }

    if (loading) return;

    setLoading(true);
    setError(null);

    try {
      const queryExecuteFunc = onQueryExecute || defaultQueryExecute;
      await queryExecuteFunc(query, (result, error) => {
        if (error) {
          setError(error);
          setResult(null);
          setIsCorrect(false);
        } else {
          setResult(result);
          setError(null);

          if (expectedResult) {
            const correct = validateResult(result, expectedResult);
            setIsCorrect(correct);
          }
        }
        setLoading(false);
      });
    } catch (err) {
      setError(err.message || 'Query execution failed');
      setLoading(false);
      setIsCorrect(false);
    }
  };

  const validateResult = (actual, expected) => {
    if (expected.type === 'count') {
      return Array.isArray(actual) && actual.length === expected.value;
    } else if (expected.type === 'contains') {
      return Array.isArray(actual) &&
             expected.fields.every(field =>
               actual.some(doc => hasNestedProperty(doc, field))
             );
    } else if (expected.type === 'exact') {
      return JSON.stringify(actual) === JSON.stringify(expected.value);
    }
    return true;
  };

  const hasNestedProperty = (obj, path) => {
    return path.split('.').reduce((current, prop) => {
      return current && current[prop] !== undefined ? current[prop] : undefined;
    }, obj) !== undefined;
  };

  const formatResult = (data) => {
    if (!data) return '';
    return JSON.stringify(data, null, 2);
  };

  return (
    <div className={styles.queryEditor}>
      {exerciseTitle && <h4 className={styles.title}>{exerciseTitle}</h4>}

      <div className={styles.editorContainer}>
        <MonacoEditor
          height="200px"
          language="javascript"
          theme="vs-dark"
          value={query}
          onChange={setQuery}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true
          }}
        />
      </div>

      <div className={styles.controls}>
        <button
          onClick={executeQuery}
          disabled={loading || !query.trim()}
          className={styles.executeButton}
        >
          {loading ? 'Executing...' : 'Run Query'}
        </button>

        {hint && (
          <details className={styles.hint}>
            <summary>Hint</summary>
            <p>{hint}</p>
          </details>
        )}
      </div>

      {error && (
        <div className={styles.error}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className={styles.result}>
          <div className={styles.resultHeader}>
            <span>Results ({Array.isArray(result) ? result.length : 1} documents)</span>
            {isCorrect !== null && (
              <span className={isCorrect ? styles.correct : styles.incorrect}>
                {isCorrect ? 'Correct!' : 'Try again'}
              </span>
            )}
          </div>
          <pre className={styles.resultContent}>
            {formatResult(result)}
          </pre>
        </div>
      )}
    </div>
  );
};

export default InteractiveQueryEditor;
