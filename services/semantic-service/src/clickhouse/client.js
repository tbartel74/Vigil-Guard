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
        url.searchParams.set('user', this.config.user);
        if (this.config.password) {
            url.searchParams.set('password', this.config.password);
        }

        return new Promise((resolve, reject) => {
            const options = {
                method: 'POST',
                hostname: this.config.host,
                port: this.config.port,
                path: url.search,
                headers: {
                    'Content-Type': 'text/plain',
                    'Connection': 'keep-alive'
                },
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
