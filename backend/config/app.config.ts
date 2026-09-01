import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', () => {
    const environment = process.env.NODE_ENV || 'development';

    return {
        environment,
        apiVersion: process.env.API_VERSION,
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:3000',
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Origin',
                'X-Requested-With',
                'Content-Type',
                'Accept',
                'Authorization',
            ],
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
                    ? process.env.SWAGGER_ENABLED === 'true'
                    : true,
        },
    };
});