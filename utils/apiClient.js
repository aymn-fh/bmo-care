const axios = require('axios');

const apiClient = axios.create({
    baseURL: process.env.BACKEND_URL + '/api',
    timeout: 10000,
    headers: {
        'Content-Type': 'application/json'
    }
});

// Request interceptor to add token if available in session
// Note: Since this is server-side, we might need to pass the token explicitly in each call
// or use a wrapper function that takes the req object.

// Helper to get client with auth token
apiClient.withAuth = (req) => {
    const token = req.user?.token;
    if (token) {
        // Create a new instance or just return config with headers
        // Better to return the same instance but we need to pass headers per request
        // So we will just use a helper method to get config
        return {
            headers: {
                Authorization: `Bearer ${token}`
            }
        };
    }
    return {};
};

// Helper proxy function to make authenticated requests easier
apiClient.authGet = (req, url, config = {}) => {
    return apiClient.get(url, { ...config, ...apiClient.withAuth(req) });
};

apiClient.authPost = (req, url, data, config = {}) => {
    return apiClient.post(url, data, { ...config, ...apiClient.withAuth(req) });
};

apiClient.authPut = (req, url, data, config = {}) => {
    return apiClient.put(url, data, { ...config, ...apiClient.withAuth(req) });
};

apiClient.authDelete = (req, url, config = {}) => {
    return apiClient.delete(url, { ...config, ...apiClient.withAuth(req) });
};

module.exports = apiClient;
