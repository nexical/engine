
const fs = require('fs');
const path = require('path');

module.exports = (request, options) => {
    // Only attempt to replace .js with .ts for relative imports (starting with .)
    if (request.endsWith('.js') && (request.startsWith('./') || request.startsWith('../'))) {
        const tsRequest = request.replace(/\.js$/, '.ts');
        try {
            return options.defaultResolver(tsRequest, options);
        } catch (e) {
            // Ignored, fall back to default
        }
    }
    return options.defaultResolver(request, options);
};
