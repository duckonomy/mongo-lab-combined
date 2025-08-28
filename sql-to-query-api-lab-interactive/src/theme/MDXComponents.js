import React from 'react';
// Import the original mapper
import MDXComponents from '@theme-original/MDXComponents';
import Link from "@site/src/components/Link";
import Screenshot from "@site/src/components/Screenshot";
import InteractiveExercise from "@site/src/components/InteractiveExercise";
import InteractiveQueryEditor from "@site/src/components/InteractiveQueryEditor";

export default {
  // Re-use the default mapping
  ...MDXComponents,
  Link,
  Screenshot,
  InteractiveExercise,
  InteractiveQueryEditor
};