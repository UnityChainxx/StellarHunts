import { registerAs } from '@nestjs/config';

export default registerAs('appConfig', () => ({
    environment: process.env.NODE_ENV || 'development',
    apiVersion: process.env.API_VERSION || 'v1',
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
    }
}));
