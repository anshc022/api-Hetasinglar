// CORS Configuration Module
const corsConfig = {
  // Development origins
  development: [
    'http://localhost:3000',
    'http://localhost:8000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8000',
  ],
  
  // Production origins
  production: [
    'https://hetasinglar.vercel.app',
    'https://www.hetasinglar.vercel.app',
    'https://hetasinglar.onrender.com',
    'https://www.hetasinglar.onrender.com',
  ],
  
  // Get allowed origins based on environment
  getAllowedOrigins() {
    const env = process.env.NODE_ENV || 'development';
    const customOrigins = process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : [];
    
    if (env === 'production') {
      return [...this.production, ...customOrigins];
    } else {
      return [...this.development, ...this.production, ...customOrigins];
    }
  },
  
  // CORS options
  getCorsOptions() {
    const allowedOrigins = this.getAllowedOrigins();
    
    return {
      origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          console.log('🚫 CORS blocked origin:', origin);
          console.log('🔍 Allowed origins:', allowedOrigins);
          callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: [
        'Origin',
        'X-Requested-With',
        'Content-Type',
        'Accept',
        'Authorization',
        'Cache-Control',
        'X-Access-Token',
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Headers',
        'Access-Control-Allow-Methods'
      ],
      exposedHeaders: [
        'set-cookie',
        'Access-Control-Allow-Origin',
        'Access-Control-Allow-Credentials'
      ],
      optionsSuccessStatus: 200, // Some legacy browsers choke on 204
      preflightContinue: false
    };
  },
  
  // WebSocket verification
  verifyWebSocketClient(info) {
    const allowedOrigins = this.getAllowedOrigins();
    const origin = info.origin || info.req.headers.origin;
    
    console.log('🔌 WebSocket connection attempt from:', origin);
    console.log('🔍 Allowed WebSocket origins:', allowedOrigins);
    
    // Allow connections without origin (for some clients)
    if (!origin) return true;
    
    return allowedOrigins.includes(origin);
  }
};

module.exports = corsConfig;
