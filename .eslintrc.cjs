module.exports = {
    root: true,
    ignorePatterns: ['dist/', 'node_modules/'],
    env: {
        browser: true,
        es2022: true
    },
    extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended'
    ],
    plugins: ['react-refresh'],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true
        }
    },
    settings: {
        react: {
            version: 'detect'
        }
    },
    rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
    }
};
