import { registerAs } from '@nestjs/config';

// Registers a namespaced "appConfig" configuration factory with NestJS's
// ConfigModule. Once registered, this config can be injected elsewhere via
// ConfigService.get('appConfig') or @Inject(appConfig.KEY).
export default registerAs('appConfig', () => {
    // Falls back to 'development' when NODE_ENV isn't set (e.g. local runs
    // without a .env file), so downstream checks always have a defined value.
    const environment = process.env.NODE_ENV || 'development';

    // `/docs` is default-on in development only. Every other environment
    // (production, staging, test) must opt back in explicitly via
    // `SWAGGER_ENABLED=true`.
    const swaggerDisabledByDefault =
        environment === 'production' ||
        environment === 'staging' ||
        environment === 'test';

    return {
        environment,

        // API version string, expected to be supplied via env var
        // (e.g. used in response headers or route prefixes).
        apiVersion: process.env.API_VERSION,

        // CORS configuration applied to incoming requests.
        cors: {
            // Which origin(s) are allowed to call this API; defaults to the
            // local frontend dev server if FRONTEND_URL isn't configured.
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            // HTTP methods permitted for cross-origin requests.
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            // Request headers the browser is allowed to send.
            allowedHeaders: [
                'Origin',
                'X-Requested-With',
                'Content-Type',
                'Accept',
                'Authorization',
            ],
            // Allows cookies/auth headers to be included in cross-origin requests.
            credentials: true,
        },

        // Swagger /docs is a powerful introspection surface (it can reveal
        // controller paths, DTO shapes, and schema internals), so it is
        // disabled by default outside development/test. To opt back in on a
        // non-local environment, set SWAGGER_ENABLED=true explicitly.
        swagger: {
            enabled:
                environment === 'production' ||
                environment === 'staging' ||
                environment === 'test'
                    // In production/staging/test, Swagger stays off unless
                    // explicitly turned on via env var.
                    ? process.env.SWAGGER_ENABLED === 'true'
                    // In any other environment (e.g. local development),
                    // Swagger is enabled by default.
                    : true,
        },
    };
});