/**
 * ClickHouse HTTP Client
 * Handles communication with ClickHouse for vector search
 * Features: Connection pooling, keep-alive, proper timeout handling
 */

const http = require('http');
const config = require('../config');

class ClickHouseClient {
    constructor() {
        this.config = config.clickhouse;
        this.baseUrl = `http://${this.config.host}:${this.config.port}`;

        // HTTP Agent with connection pooling and keep-alive
        this.agent = new http.Agent({
            keepAlive: this.config.keepAlive !== false,
            keepAliveMsecs: 30000,
            maxSockets: this.config.maxSockets || 10,
            maxFreeSockets: 5,
            timeout: this.config.timeout || 5000
        });
    }

    /**
     * Execute a query against ClickHouse
     */
    async query(sql, format = 'JSON') {
        const url = new URL(this.baseUrl);
        url.searchParams.set('database', this.config.database);
        // Note: user/password now passed via HTTP Basic Auth header (more secure than URL)

        return new Promise((resolve, reject) => {
            // Build Authorization header for HTTP Basic Auth
            const authHeader = this.config.user
                ? 'Basic ' + Buffer.from(`${this.config.user}:${this.config.password || ''}`).toString('base64')
                : null;

            const headers = {
                'Content-Type': 'text/plain',
                'Connection': 'keep-alive'
            };

            if (authHeader) {
                headers['Authorization'] = authHeader;
            }

            const options = {
                method: 'POST',
                hostname: this.config.host,
                port: this.config.port,
                path: url.search,
                headers,
                agent: this.agent,
                timeout: this.config.timeout || 5000
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode >= 400) {
                        reject(new Error(`ClickHouse error ${res.statusCode}: ${data}`));
                    } else {
                        try {
                            if (format === 'JSON' && data.trim()) {
                                resolve(JSON.parse(data));
                            } else {
                                resolve(data);
                            }
                        } catch (e) {
                            resolve(data);
                        }
                    }
                });
            });

            req.on('error', (err) => {
                // More detailed error message
                reject(new Error(`ClickHouse connection error: ${err.message}`));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`ClickHouse request timeout after ${this.config.timeout}ms`));
            });

            req.write(sql);
            req.end();
        });
    }

    /**
     * Escape string for ClickHouse
     */
    escape(str) {
        if (!str) return '';
        return String(str)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r')
            .replace(/\t/g, '\\t');
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            await this.query('SELECT 1', 'text');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get table count
     */
    async getCount() {
        const result = await this.query(`SELECT count() as cnt FROM ${this.config.table} FORMAT JSON`);
        if (result && result.data && result.data[0]) {
            return result.data[0].cnt;
        }
        return 0;
    }

    /**
     * Check if table exists and has data
     */
    async checkTable() {
        try {
            const count = await this.getCount();
            return { exists: true, count };
        } catch (e) {
            if (e.message.includes('UNKNOWN_TABLE')) {
                return { exists: false, count: 0 };
            }
            throw e;
        }
    }
}

// Singleton instance
const client = new ClickHouseClient();

module.exports = client;
