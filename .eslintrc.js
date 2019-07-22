module.exports = {
    "env": {
        "es6": true,
        "node": true,
        "jquery": true,
    },
    "extends": "eslint:recommended",
    "parserOptions": {
        "ecmaVersion": 2018,
        "sourceType": "module"
    },
    "rules": {
        "no-console" : 0,
        "quotes": [
            "error",
            "single",
            { "allowTemplateLiterals": true },
        ],
        "semi": [
            "error",
            "always"
        ],
        "indent": [
            "error",
            4,
            "tab"
        ]
    }
};