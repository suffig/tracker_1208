// Enhanced Supabase configuration with better error handling and performance
const supabaseConfig = {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'supabase.auth.token',
    autoRefreshTokenRetryAttempts: 5, // Increased retry attempts
    tokenRefreshMargin: 60 // Refresh 60 seconds before expiry
  },
  global: {
    headers: {
      'X-Client-Info': 'fifa-tracker/1.0.0',
      'X-Client-Version': '2.0.0'
    }
  },
  db: {
    schema: 'public'
  },
  realtime: {
    params: {
      eventsPerSecond: 10 // Rate limiting for real-time events
    }
  }
};

// Fallback client for when CDN is blocked
const createFallbackClient = () => {
  // Simple session state for fallback mode
  let fallbackSession = null;
  let authCallbacks = [];
  
  const mockClient = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: fallbackSession } }),
      onAuthStateChange: (callback) => {
        console.warn('Supabase auth not available - using fallback');
        authCallbacks.push(callback);
        // Initial callback
        setTimeout(() => callback(fallbackSession ? 'SIGNED_IN' : 'SIGNED_OUT', fallbackSession), 100);
        return { data: { subscription: { unsubscribe: () => {
          authCallbacks = authCallbacks.filter(cb => cb !== callback);
        } } } };
      },
      signInWithPassword: ({ email, password }) => {
        console.warn('Supabase signInWithPassword not available - using fallback demo auth');
        
        // Simple validation for demo purposes
        if (!email || !password) {
          return Promise.resolve({ 
            error: new Error('E-Mail und Passwort sind erforderlich.') 
          });
        }
        
        if (!email.includes('@')) {
          return Promise.resolve({ 
            error: new Error('Bitte geben Sie eine gültige E-Mail-Adresse ein.') 
          });
        }
        
        // Create a mock session for demo mode
        fallbackSession = {
          user: {
            id: 'demo-user-' + Date.now(),
            email: email,
            created_at: new Date().toISOString(),
            app_metadata: {},
            user_metadata: {}
          },
          access_token: 'demo-token-' + Date.now(),
          expires_at: Date.now() / 1000 + 3600 // 1 hour from now
        };
        
        // Notify all auth listeners
        authCallbacks.forEach(callback => {
          setTimeout(() => callback('SIGNED_IN', fallbackSession), 50);
        });
        
        return Promise.resolve({ data: { user: fallbackSession.user, session: fallbackSession }, error: null });
      },
      signUp: ({ email, password }) => {
        console.warn('Supabase signUp not available - using fallback demo mode');
        
        if (!email || !password) {
          return Promise.resolve({ 
            error: new Error('E-Mail und Passwort sind erforderlich.') 
          });
        }
        
        if (password.length < 6) {
          return Promise.resolve({ 
            error: new Error('Passwort muss mindestens 6 Zeichen haben.') 
          });
        }
        
        return Promise.resolve({ 
          data: { user: null, session: null },
          error: null 
        });
      },
      signOut: () => {
        console.warn('Supabase signOut not available - using fallback');
        fallbackSession = null;
        
        // Notify all auth listeners
        authCallbacks.forEach(callback => {
          setTimeout(() => callback('SIGNED_OUT', null), 50);
        });
        
        return Promise.resolve({ error: null });
      }
    },
    from: (table) => ({
      select: () => ({
        limit: () => Promise.resolve({ data: [], error: null }),
        eq: () => Promise.resolve({ data: [], error: null }),
        neq: () => Promise.resolve({ data: [], error: null }),
        gt: () => Promise.resolve({ data: [], error: null }),
        gte: () => Promise.resolve({ data: [], error: null }),
        lt: () => Promise.resolve({ data: [], error: null }),
        lte: () => Promise.resolve({ data: [], error: null }),
        like: () => Promise.resolve({ data: [], error: null }),
        in: () => Promise.resolve({ data: [], error: null }),
        order: () => Promise.resolve({ data: [], error: null }),
        range: () => Promise.resolve({ data: [], error: null })
      }),
      insert: () => Promise.resolve({ data: [], error: null }),
      update: () => Promise.resolve({ data: [], error: null }),
      delete: () => Promise.resolve({ data: [], error: null }),
    }),
    channel: () => ({
      on: () => mockClient.channel(),
      subscribe: (callback) => {
        console.warn('Supabase realtime not available - using fallback');
        if (typeof callback === 'function') {
          setTimeout(() => callback('CLOSED'), 100);
        }
        return mockClient.channel();
      }
    }),
    removeChannel: () => {}
  };
  return mockClient;
};

// Start with fallback client
console.log("supabaseClient.js geladen mit Fallback!");
export const supabase = createFallbackClient();

// Enhanced wrapper with better connection handling and metrics
class SupabaseWrapper {
  constructor(client) {
    this.client = client;
    this.maxRetries = 3;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 30000; // 30 seconds max
    this.connectionStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastResponseTime: 0
    };
    this.requestQueue = [];
    this.isProcessingQueue = false;
    this.maxConcurrentRequests = 5;
    this.activeRequests = 0;
  }

  // Get connection statistics
  getStats() {
    return {
      ...this.connectionStats,
      successRate: this.connectionStats.totalRequests > 0 
        ? (this.connectionStats.successfulRequests / this.connectionStats.totalRequests * 100).toFixed(2) + '%'
        : '0%',
      activeRequests: this.activeRequests,
      queuedRequests: this.requestQueue.length
    };
  }

  // Reset statistics
  resetStats() {
    this.connectionStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      lastResponseTime: 0
    };
  }

  // Enhanced retry operation with better metrics and queue management
  async retryOperation(operation, maxRetries = this.maxRetries, priority = 'normal') {
    return new Promise((resolve, reject) => {
      const requestItem = {
        operation,
        maxRetries,
        priority,
        resolve,
        reject,
        timestamp: Date.now()
      };

      if (priority === 'high') {
        this.requestQueue.unshift(requestItem);
      } else {
        this.requestQueue.push(requestItem);
      }

      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessingQueue || this.activeRequests >= this.maxConcurrentRequests) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0 && this.activeRequests < this.maxConcurrentRequests) {
      const requestItem = this.requestQueue.shift();
      this.executeRequest(requestItem);
    }

    this.isProcessingQueue = false;
  }

  async executeRequest(requestItem) {
    this.activeRequests++;
    this.connectionStats.totalRequests++;
    
    const startTime = performance.now();
    let lastError = null;

    try {
      for (let attempt = 1; attempt <= requestItem.maxRetries; attempt++) {
        try {
          const result = await requestItem.operation();
          
          if (result.error) throw result.error;
          
          // Success metrics
          const responseTime = performance.now() - startTime;
          this.updateResponseTimeMetrics(responseTime);
          this.connectionStats.successfulRequests++;
          
          requestItem.resolve(result);
          return;
          
        } catch (error) {
          lastError = error;
          console.warn(`Database operation failed (attempt ${attempt}/${requestItem.maxRetries}):`, error);
          
          if (this.isNonRetryableError(error) || attempt === requestItem.maxRetries) {
            break;
          }
          
          // Exponential backoff with jitter
          const baseDelay = Math.min(this.baseDelay * Math.pow(2, attempt - 1), this.maxDelay);
          const jitter = Math.random() * 0.1 * baseDelay; // 10% jitter
          const delay = baseDelay + jitter;
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
      
      // Failed after all retries
      this.connectionStats.failedRequests++;
      requestItem.reject(lastError);
      
    } catch (error) {
      this.connectionStats.failedRequests++;
      requestItem.reject(error);
    } finally {
      this.activeRequests--;
      // Process next items in queue
      setTimeout(() => this.processQueue(), 0);
    }
  }

  updateResponseTimeMetrics(responseTime) {
    this.connectionStats.lastResponseTime = responseTime;
    
    if (this.connectionStats.averageResponseTime === 0) {
      this.connectionStats.averageResponseTime = responseTime;
    } else {
      // Moving average
      this.connectionStats.averageResponseTime = 
        (this.connectionStats.averageResponseTime * 0.8) + (responseTime * 0.2);
    }
  }

  isNonRetryableError(error) {
    if (!error) return false;
    
    const message = error.message ? error.message.toLowerCase() : '';
    const code = error.code;
    
    // Authentication errors
    if (message.includes('auth') || message.includes('unauthorized') || message.includes('forbidden')) {
      return true;
    }
    
    // Specific error codes that shouldn't be retried
    if (code === 'PGRST301' || code === 'PGRST116' || code === '23505' || code === '23503') {
      return true;
    }
    
    // Client errors (4xx) generally shouldn't be retried
    if (error.status && error.status >= 400 && error.status < 500) {
      return true;
    }
    
    return false;
  }

  // Enhanced select with better query building and validation
  async select(table, query = '*', options = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).select(query);
      
      // Apply filters
      if (options.eq) {
        Object.entries(options.eq).forEach(([column, value]) => {
          if (value !== undefined && value !== null) {
            queryBuilder = queryBuilder.eq(column, value);
          }
        });
      }
      
      if (options.neq) {
        Object.entries(options.neq).forEach(([column, value]) => {
          queryBuilder = queryBuilder.neq(column, value);
        });
      }
      
      if (options.gt) {
        Object.entries(options.gt).forEach(([column, value]) => {
          queryBuilder = queryBuilder.gt(column, value);
        });
      }
      
      if (options.gte) {
        Object.entries(options.gte).forEach(([column, value]) => {
          queryBuilder = queryBuilder.gte(column, value);
        });
      }
      
      if (options.lt) {
        Object.entries(options.lt).forEach(([column, value]) => {
          queryBuilder = queryBuilder.lt(column, value);
        });
      }
      
      if (options.lte) {
        Object.entries(options.lte).forEach(([column, value]) => {
          queryBuilder = queryBuilder.lte(column, value);
        });
      }
      
      if (options.like) {
        Object.entries(options.like).forEach(([column, pattern]) => {
          queryBuilder = queryBuilder.like(column, pattern);
        });
      }
      
      if (options.in) {
        Object.entries(options.in).forEach(([column, values]) => {
          if (Array.isArray(values) && values.length > 0) {
            queryBuilder = queryBuilder.in(column, values);
          }
        });
      }
      
      // Apply ordering
      if (options.order) {
        if (Array.isArray(options.order)) {
          options.order.forEach(orderBy => {
            queryBuilder = queryBuilder.order(orderBy.column, { 
              ascending: orderBy.ascending ?? true 
            });
          });
        } else {
          queryBuilder = queryBuilder.order(options.order.column, { 
            ascending: options.order.ascending ?? true 
          });
        }
      }
      
      // Apply pagination
      if (options.limit) {
        queryBuilder = queryBuilder.limit(Math.min(options.limit, 1000)); // Max 1000 records
      }
      
      if (options.range) {
        queryBuilder = queryBuilder.range(options.range.from, options.range.to);
      }
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Enhanced insert with better validation
  async insert(table, data, options = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    if (!data) throw new Error('Data is required for insert');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).insert(data);
      
      if (options.returning !== false) {
        queryBuilder = queryBuilder.select();
      }
      
      if (options.onConflict) {
        queryBuilder = queryBuilder.onConflict(options.onConflict);
      }
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Enhanced update with better validation
  async update(table, data, conditions = {}, options = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    if (!data) throw new Error('Data is required for update');
    if (Object.keys(conditions).length === 0) throw new Error('At least one condition is required for update');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).update(data);
      
      // Apply conditions
      Object.entries(conditions).forEach(([column, value]) => {
        if (value !== undefined && value !== null) {
          queryBuilder = queryBuilder.eq(column, value);
        }
      });
      
      if (options.returning !== false) {
        queryBuilder = queryBuilder.select();
      }
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Enhanced deleteRow with better validation
  async deleteRow(table, conditions = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    if (Object.keys(conditions).length === 0) throw new Error('At least one condition is required for delete');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).delete();
      
      // Apply conditions
      Object.entries(conditions).forEach(([column, value]) => {
        if (value !== undefined && value !== null) {
          queryBuilder = queryBuilder.eq(column, value);
        }
      });
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Upsert operation
  async upsert(table, data, options = {}, priority = 'normal') {
    if (!table) throw new Error('Table name is required');
    if (!data) throw new Error('Data is required for upsert');
    
    return this.retryOperation(async () => {
      let queryBuilder = this.client.from(table).upsert(data);
      
      if (options.onConflict) {
        queryBuilder = queryBuilder.onConflict(options.onConflict);
      }
      
      if (options.returning !== false) {
        queryBuilder = queryBuilder.select();
      }
      
      return await queryBuilder;
    }, this.maxRetries, priority);
  }

  // Batch operations for better performance
  async batchSelect(operations) {
    const promises = operations.map(op => 
      this.select(op.table, op.query, op.options, op.priority || 'normal')
    );
    
    const results = await Promise.allSettled(promises);
    
    return results.map((result, index) => ({
      success: result.status === 'fulfilled',
      data: result.status === 'fulfilled' ? result.value : null,
      error: result.status === 'rejected' ? result.reason : null,
      operation: operations[index]
    }));
  }

  // Connection health check
  async healthCheck() {
    try {
      const result = await this.select('players', 'id', { limit: 1 }, 'high');
      return { healthy: true, responseTime: this.connectionStats.lastResponseTime };
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  getClient() {
    return this.client;
  }
}


export const supabaseDb = new SupabaseWrapper(supabase);

// Enhanced auth event handler with better error handling and monitoring
const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
  const userInfo = session?.user?.email || 'No user';
  console.log(`Auth state changed: ${event}`, userInfo);
  
  // Update connection stats based on auth events
  if (event === 'SIGNED_IN') {
    console.log('✅ User signed in successfully');
    supabaseDb.resetStats(); // Reset stats on new session
  } else if (event === 'SIGNED_OUT') {
    console.log('👋 User signed out');
    supabaseDb.resetStats(); // Reset stats on sign out
  } else if (event === 'TOKEN_REFRESHED') {
    if (session) {
      console.log('🔄 Auth token refreshed successfully');
    } else {
      console.error('❌ Token refresh failed - user may need to re-authenticate');
      window.dispatchEvent(new CustomEvent('supabase-session-expired', {
        detail: { timestamp: new Date().toISOString() }
      }));
    }
  } else if (event === 'USER_UPDATED') {
    console.log('👤 User profile updated');
  } else if (event === 'PASSWORD_RECOVERY') {
    console.log('🔐 Password recovery initiated');
  }
  
  // Dispatch custom event for app-wide auth state management
  window.dispatchEvent(new CustomEvent('auth-state-change', {
    detail: { event, session, user: session?.user }
  }));
});

// Add connection monitoring for debugging
if (typeof window !== 'undefined') {
  // Global access for debugging
  window.supabase = supabase;
  window.supabaseDb = supabaseDb;
  
  // Add debugging helpers
  window.supabaseDebug = {
    getStats: () => supabaseDb.getStats(),
    resetStats: () => supabaseDb.resetStats(),
    healthCheck: () => supabaseDb.healthCheck(),
    getQueueLength: () => supabaseDb.requestQueue.length,
    getActiveRequests: () => supabaseDb.activeRequests
  };
  
  // Periodic stats logging in development
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    setInterval(() => {
      const stats = supabaseDb.getStats();
      if (stats.totalRequests > 0) {
        console.log('📊 Supabase Stats:', stats);
      }
    }, 60000); // Log every minute
  }
}

// Performance monitoring for database operations
class DatabasePerformanceMonitor {
  constructor() {
    this.slowQueryThreshold = 2000; // 2 seconds
    this.slowQueries = [];
    this.maxSlowQueries = 10;
  }

  logSlowQuery(operation, duration, table, query) {
    if (duration > this.slowQueryThreshold) {
      const slowQuery = {
        operation,
        duration: Math.round(duration),
        table,
        query: query || 'N/A',
        timestamp: new Date().toISOString()
      };
      
      this.slowQueries.unshift(slowQuery);
      if (this.slowQueries.length > this.maxSlowQueries) {
        this.slowQueries.pop();
      }
      
      console.warn(`🐌 Slow database query detected:`, slowQuery);
    }
  }

  getSlowQueries() {
    return this.slowQueries;
  }

  clearSlowQueries() {
    this.slowQueries = [];
  }
}

export const dbPerformanceMonitor = new DatabasePerformanceMonitor();

// Add performance monitoring to window for debugging
if (typeof window !== 'undefined') {
  window.dbPerformanceMonitor = dbPerformanceMonitor;
}
