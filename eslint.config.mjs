// ioBroker eslint template configuration file for js and ts files
// Please note that esm or react based modules need additional modules loaded.
import config from '@iobroker/eslint-config';
import globals from 'globals';

export default [
    ...config,
    {
        // macht describe/it global bekannt
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                ...globals.mocha,
            },
        },
    },
    {
        // specify files to exclude from linting here
        ignores: [
            '.dev-server/',
            '.vscode/',
            '*.test.js',
            '*.test.cjs',
            'test/**/*.js',
            '*.config.mjs',
            'build',
            'dist',
            'admin/build',
            'admin/words.js',
            'admin/admin.d.ts',
            'admin/blockly.js',
            '**/adapter-config.d.ts',
            'lib/adapter-config.d.ts',
        ],
    },
    {
        // you may disable some 'jsdoc' warnings - but using jsdoc is highly recommended
        // as this improves maintainability. jsdoc warnings will not block build process.
        rules: {
            // 'jsdoc/require-jsdoc': 'off',
            // 'jsdoc/require-param': 'off',
            // 'jsdoc/require-param-description': 'off',
            // 'jsdoc/require-returns-description': 'off',
            // 'jsdoc/require-returns-check': 'off',
        },
    },
];
