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
    // Only use environment variable for production origins
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
    console.log('🌐 CORS Allowed Origins:', allowedOrigins);
    
    return {
      origin: function (origin, callback) {
        console.log('🔍 CORS Check - Origin:', origin);
        console.log('🔍 CORS Check - Allowed:', allowedOrigins);
        
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
          console.log('✅ CORS Allowed for:', origin);
          callback(null, true);
        } else {
          console.log('🚫 CORS blocked origin:', origin);
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
        'X-Access-Token'
      ],
      exposedHeaders: [
        'set-cookie'
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
