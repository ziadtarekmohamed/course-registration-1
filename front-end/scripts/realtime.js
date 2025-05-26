// realtime.js - Client-side utilities for real-time data updates

/**
 * RealtimeService - Handles WebSocket connections for real-time data updates
 */
class RealtimeService {
    constructor(baseUrl = 'ws://localhost:8000') {
        this.baseUrl = baseUrl;
        this.socket = null;
        this.clientId = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000; // Start with 2 seconds
        this.subscriptions = new Map(); // entity_id -> callback
        this.pingInterval = null;
        this.debug = true; // Set to false in production
    }

    /**
     * Initialize the WebSocket connection
     * @returns {Promise} Resolves when connection is established
     */
    connect() {
        return new Promise((resolve, reject) => {
            try {
                // Create WebSocket connection
                this.socket = new WebSocket(`${this.baseUrl}/ws/realtime`);
                
                // Set up event handlers
                this.socket.onopen = () => {
                    this.log('WebSocket connection established');
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    
                    // Start ping interval to keep connection alive
                    this.startPingInterval();
                    
                    // Resolve the promise once we get the connection_established message
                };
                
                this.socket.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    this.log('Message received:', data);
                    
                    // Handle connection established confirmation
                    if (data.type === 'connection_established') {
                        this.clientId = data.client_id;
                        this.log(`Client ID assigned: ${this.clientId}`);
                        
                        // Resubscribe to previous subscriptions if any
                        this.resubscribeAll();
                        
                        resolve(this.clientId);
                    } 
                    // Handle data updates
                    else if (data.collection && data.operation) {
                        this.handleDataUpdate(data);
                    }
                };
                
                this.socket.onclose = (event) => {
                    this.log(`WebSocket connection closed: ${event.code} ${event.reason}`);
                    this.connected = false;
                    clearInterval(this.pingInterval);
                    
                    // Attempt to reconnect if closure wasn't intentional
                    if (!event.wasClean) {
                        this.attemptReconnect();
                    }
                };
                
                this.socket.onerror = (error) => {
                    this.log('WebSocket error:', error);
                    reject(error);
                };
            } catch (error) {
                this.log('Error creating WebSocket connection:', error);
                reject(error);
            }
        });
    }

    /**
     * Attempt to reconnect to the WebSocket server
     */
    attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.log('Maximum reconnection attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
        
        this.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        
        setTimeout(() => {
            this.connect().catch(error => {
                this.log('Reconnection failed:', error);
            });
        }, delay);
    }

    /**
     * Start a ping interval to keep the connection alive
     */
    startPingInterval() {
        // Clear any existing interval
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
        }
        
        // Send a ping every 30 seconds
        this.pingInterval = setInterval(() => {
            if (this.connected) {
                this.socket.send(JSON.stringify({
                    type: 'ping',
                    timestamp: Date.now()
                }));
            }
        }, 30000);
    }

    /**
     * Subscribe to updates for a specific collection and entity ID
     * @param {string} collection - Collection name (e.g., 'enrollments', 'schedules')
     * @param {string} entityId - ID of the entity to subscribe to (e.g., student_id, course_id)
     * @param {function} callback - Function to call when updates are received
     * @returns {Promise} Resolves when subscription is confirmed
     */
    subscribe(collection, entityId, callback) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('WebSocket is not connected'));
                return;
            }
            
            // Create a unique subscription key
            const subscriptionKey = `${collection}:${entityId}`;
            
            // Store the callback
            this.subscriptions.set(subscriptionKey, callback);
            
            // Send subscription request
            this.socket.send(JSON.stringify({
                type: 'subscribe',
                collection: collection,
                entity_id: entityId
            }));
            
            // Set up one-time handler for confirmation
            const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'subscription_confirmed' && 
                    data.collection === collection && 
                    data.entity_id === entityId) {
                    
                    this.log(`Subscription confirmed: ${collection}/${entityId}`);
                    
                    // Remove this one-time handler
                    this.socket.removeEventListener('message', handleMessage);
                    
                    resolve(data);
                } 
                else if (data.type === 'error') {
                    this.log(`Subscription error: ${data.message}`);
                    
                    // Remove this one-time handler
                    this.socket.removeEventListener('message', handleMessage);
                    
                    reject(new Error(data.message));
                }
            };
            
            this.socket.addEventListener('message', handleMessage);
        });
    }

    /**
     * Unsubscribe from updates for a specific collection and entity ID
     * @param {string} collection - Collection name
     * @param {string} entityId - ID of the entity
     * @returns {Promise} Resolves when unsubscription is confirmed
     */
    unsubscribe(collection, entityId) {
        return new Promise((resolve, reject) => {
            if (!this.connected) {
                reject(new Error('WebSocket is not connected'));
                return;
            }
            
            // Create a unique subscription key
            const subscriptionKey = `${collection}:${entityId}`;
            
            // Remove the callback
            this.subscriptions.delete(subscriptionKey);
            
            // Send unsubscription request
            this.socket.send(JSON.stringify({
                type: 'unsubscribe',
                collection: collection,
                entity_id: entityId
            }));
            
            // Set up one-time handler for confirmation
            const handleMessage = (event) => {
                const data = JSON.parse(event.data);
                
                if (data.type === 'unsubscription_confirmed' && 
                    data.collection === collection && 
                    data.entity_id === entityId) {
                    
                    this.log(`Unsubscription confirmed: ${collection}/${entityId}`);
                    
                    // Remove this one-time handler
                    this.socket.removeEventListener('message', handleMessage);
                    
                    resolve(data);
                } 
                else if (data.type === 'error') {
                    this.log(`Unsubscription error: ${data.message}`);
                    
                    // Remove this one-time handler
                    this.socket.removeEventListener('message', handleMessage);
                    
                    reject(new Error(data.message));
                }
            };
            
            this.socket.addEventListener('message', handleMessage);
        });
    }

    /**
     * Resubscribe to all previous subscriptions
     */
    resubscribeAll() {
        if (!this.connected) {
            return;
        }
        
        // Iterate through all subscriptions
        for (const [key, callback] of this.subscriptions.entries()) {
            // Parse the subscription key
            const [collection, entityId] = key.split(':');
            
            // Resubscribe
            this.log(`Resubscribing to ${collection}/${entityId}`);
            this.socket.send(JSON.stringify({
                type: 'subscribe',
                collection: collection,
                entity_id: entityId
            }));
        }
    }

    /**
     * Handle data update events
     * @param {object} data - The update event data
     */
    handleDataUpdate(data) {
        // Determine which subscription this update is for
        const collection = data.collection;
        let entityId = null;
        
        // Extract entity ID based on collection type
        if (collection === 'enrollments') {
            entityId = data.document?.student_id || '';
        } 
        else if (collection === 'schedules') {
            entityId = data.document?.student_id || '';
        } 
        else if (collection === 'time_slots') {
            entityId = data.document?.course_id || '';
        } 
        else if (collection === 'users') {
            entityId = data.document?.user_id || data.document?.student_id || data.document?.instructor_id || '';
        } 
        else if (collection === 'courses') {
            entityId = data.document?.course_id || '';
        }
        
        // If we have a valid entity ID, call the appropriate callback
        if (entityId) {
            const subscriptionKey = `${collection}:${entityId}`;
            const callback = this.subscriptions.get(subscriptionKey);
            
            if (callback) {
                this.log(`Calling callback for ${subscriptionKey}`);
                callback(data);
            }
        }
    }

    /**
     * Close the WebSocket connection
     */
    disconnect() {
        if (this.socket && this.connected) {
            this.socket.close(1000, 'Client disconnected');
            this.connected = false;
            clearInterval(this.pingInterval);
            this.log('WebSocket connection closed');
        }
    }

    /**
     * Log debug messages
     */
    log(...args) {
        if (this.debug) {
            console.log('[RealtimeService]', ...args);
        }
    }
}

// Create a singleton instance
const realtimeService = new RealtimeService();

// Helper function to subscribe to schedule updates for a specific student
async function subscribeToScheduleUpdates(studentId, callback) {
    if (!realtimeService.connected) {
        await realtimeService.connect();
    }
    return realtimeService.subscribe('schedules', studentId, callback);
}

// Helper function to subscribe to time slot updates for a specific course
async function subscribeToTimeSlotUpdates(courseId, callback) {
    if (!realtimeService.connected) {
        await realtimeService.connect();
    }
    return realtimeService.subscribe('time_slots', courseId, callback);
}

// Helper function to subscribe to enrollment updates for a specific student
async function subscribeToEnrollmentUpdates(studentId, callback) {
    if (!realtimeService.connected) {
        await realtimeService.connect();
    }
    return realtimeService.subscribe('enrollments', studentId, callback);
}

// Helper function to subscribe to course updates
async function subscribeToCourseUpdates(courseId, callback) {
    if (!realtimeService.connected) {
        await realtimeService.connect();
    }
    return realtimeService.subscribe('courses', courseId, callback);
}

// Export the service and helper functions
export {
    realtimeService,
    subscribeToScheduleUpdates,
    subscribeToTimeSlotUpdates,
    subscribeToEnrollmentUpdates,
    subscribeToCourseUpdates
}; 