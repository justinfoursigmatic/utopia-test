module.exports = {
  parserOptions: {
    ecmaVersion: 6,
    sourceType: 'module',
    ecmaFeatures: {
      modules: true,
      jsx: true,
    },
  },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier', 'react', 'react-hooks', 'jest'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'prettier',
    'prettier/@typescript-eslint',
    'plugin:jest/recommended',
  ],
  rules: {
    // Built-in eslint rules
    'no-console': ['error', { allow: ['info', 'warn', 'error'] }],
    'no-unused-expressions': 'warn',
    'no-await-in-loop': 'warn',
    'no-template-curly-in-string': 'warn',
    'array-callback-return': 'warn',
    'block-scoped-var': 'error',
    'no-param-reassign': 'error',
    'no-restricted-globals': [
      'error',

      // Prevent accidental use of specific globals with names that were designed to clash,
      // https://media2.giphy.com/media/4ZxicT7ZQYcLShHOiz/giphy.gif

      'addEventListener',
      'Animation',
      'blur',
      'close',
      'closed',
      'confirm',
      'defaultStatus',
      'defaultstatus',
      'event',
      'external',
      'find',
      'focus',
      'frameElement',
      'frames',
      'history',
      'History',
      'innerHeight',
      'innerWidth',
      'length',
      'location',
      'locationbar',
      'menubar',
      'moveBy',
      'moveTo',
      'name',
      'navigator',
      'onblur',
      'onerror',
      'onfocus',
      'onload',
      'onresize',
      'onunload',
      'open',
      'opener',
      'opera',
      'origin',
      'outerHeight',
      'outerWidth',
      'pageXOffset',
      'pageYOffset',
      'parent',
      'print',
      'removeEventListener',
      'resizeBy',
      'resizeTo',
      'screen',
      'screenLeft',
      'screenTop',
      'screenX',
      'screenY',
      'scroll',
      'scrollbars',
      'scrollBy',
      'scrollTo',
      'scrollX',
      'scrollY',
      'status',
      'statusbar',
      'stop',
      'Text',
      'toolbar',
      'top',
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: ['**/*.spec', '**/*.spec.*'],
      },
    ],
    'no-shadow': 'off', // we need to use typescript's no-shadow rule
    // React specific errors
    'react/jsx-no-comment-textnodes': 'error',
    'react/jsx-key': ['error', { checkFragmentShorthand: true }],
    'react/no-did-mount-set-state': 'error',
    'react/no-did-update-set-state': 'error',
    'react/no-access-state-in-setstate': 'error',
    'react/jsx-no-bind': [
      'error',
      {
        ignoreDOMComponents: true,
        ignoreRefs: false,
        allowArrowFunctions: false,
        allowFunctions: false,
        allowBind: false,
      },
    ],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',
    // typescript-eslint rules
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        args: 'none',
        varsIgnorePattern: '_exhaustiveCheck',
        ignoreRestSiblings: true,
      },
    ],
    // inherited rules we are turning off here
    'no-undef': 'off',
    'no-inner-declarations': 'off',
    'no-dupe-class-members': 'off',
    'no-case-declarations': 'off',
    'no-prototype-builtins': 'off',
    'no-useless-escape': 'off',
    'no-var': 'off',
    'prefer-const': 'off',
    'react/prop-types': 'off',
    'react/display-name': 'off',
    'react/no-deprecated': 'off',
    'react/no-direct-mutation-state': 'off',
    'react/no-find-dom-node': 'off',
    'react/no-unescaped-entities': 'off',
    'react/no-string-refs': 'off',
    'react/no-typos': 'off',
    'react/require-render-return': 'off',
    '@typescript-eslint/ban-ts-ignore': 'off',
    '@typescript-eslint/no-inferrable-types': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
    '@typescript-eslint/camelcase': 'off',
    '@typescript-eslint/array-type': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/no-object-literal-type-assertion': 'off',
    '@typescript-eslint/prefer-interface': 'off',
    '@typescript-eslint/explicit-member-accessibility': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-shadow': ['error'],
    'jest/no-conditional-expect': 'off',
    'jest/no-done-callback': 'off',
    'jest/no-test-prefixes': 'off',
  },
  overrides: [
    {
      files: ['*.spec.ts', '*.spec.tsx'],
      rules: {
        'no-unused-expressions': 'off',
        'no-template-curly-in-string': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-empty-function': 'off',
      },
    },
  ],
  settings: {
    react: {
      version: '17.0.0-rc.1',
    },
  },
}
