import { InfoAPI } from './rest/infoProxy';
import { ExchangeAPI } from './rest/exchangeProxy';
import { WebSocketClient } from './websocket/connection';
import { WebSocketSubscriptions } from './websocket/subscriptions';
import { RateLimiter } from './utils/rateLimiter';
import * as CONSTANTS from './types/constants';
import { CustomOperations } from './rest/customProxy';
import { ethers } from 'ethers';
import { SymbolConversion } from './utils/symbolConversion';
import { AuthenticationError } from './utils/errors';
import { environment } from './utils/environment';

export interface HyperliquidConfig {
    enableWs?: boolean;
    privateKey?: string;
    testnet?: boolean;
    walletAddress?: string;
    vaultAddress?: string;
    maxReconnectAttempts?: number;
    proxyConfig?: {
        host: string;
        port: number;
        auth?: {
            username: string;
            password: string;
        };
    };
    httpTimeout?: number
}

export class Hyperliquid {
    public info: InfoAPI;
    public exchange: ExchangeAPI;
    public ws: WebSocketClient;
    public subscriptions: WebSocketSubscriptions;
    public custom: CustomOperations;
    public symbolConversion: SymbolConversion;

    private rateLimiter: RateLimiter;
    private isValidPrivateKey: boolean = false;
    private walletAddress: string | null = null;
    private _initialized: boolean = false;
    private _initializing: Promise<void> | null = null;
    private _privateKey?: string;
    private _walletAddress?: string;
    private vaultAddress?: string | null = null;
    private enableWs: boolean;
    private proxyConfig?: {
        host: string;
        port: number;
        auth?: {
            username: string;
            password: string;
        };

    };
    private httpTimeout?: number
    constructor(params: HyperliquidConfig = {}) {
        const { enableWs = true, privateKey, testnet = false, walletAddress, vaultAddress, maxReconnectAttempts, proxyConfig, httpTimeout = 50000 } = params;

        // Browser-specific security warnings
        if (environment.isBrowser) {
            if (privateKey) {
                console.warn('Warning: Storing private keys in browser environments is not recommended. Consider using a Web3 wallet provider instead.');
            }
            if (!window.isSecureContext) {
                console.warn('Warning: Running in an insecure context. Some features may be limited.');
            }
        }

        const baseURL = testnet ? CONSTANTS.BASE_URLS.TESTNET : CONSTANTS.BASE_URLS.PRODUCTION;

        this.rateLimiter = new RateLimiter();
        this.symbolConversion = new SymbolConversion(baseURL, this.rateLimiter);
        this.walletAddress = walletAddress || null;
        this.vaultAddress = vaultAddress || null;
        this.proxyConfig = proxyConfig
        this.httpTimeout = httpTimeout;
        // Initialize info API
        this.info = new InfoAPI(baseURL, this.rateLimiter, this.symbolConversion, this, this.proxyConfig, this.httpTimeout);

        // Initialize WebSocket only if enabled and supported
        this.enableWs = enableWs && environment.supportsWebSocket();
        if (this.enableWs && !environment.supportsWebSocket()) {
            console.warn('WebSocket support is not available in this environment. WebSocket features will be disabled.');
            this.enableWs = false;
        }

        this.ws = new WebSocketClient(testnet, maxReconnectAttempts);
        this.subscriptions = new WebSocketSubscriptions(this.ws, this.symbolConversion);

        // Create proxy objects for exchange and custom
        this.exchange = this.createAuthenticatedProxy(ExchangeAPI);
        this.custom = this.createAuthenticatedProxy(CustomOperations);

        if (privateKey) {
            this._privateKey = privateKey;
            this._walletAddress = walletAddress;
            this.initializePrivateKey(privateKey, testnet);
        }
    }

    public async connect(): Promise<void> {
        if (!this._initialized) {
            if (!this._initializing) {
                this._initializing = this.initialize();
            }
            await this._initializing;
        }
    }

    private async initialize(): Promise<void> {
        if (this._initialized) return;

        try {
            // Initialize symbol conversion first
            await this.symbolConversion.initialize();

            // Connect WebSocket if enabled and supported
            if (this.enableWs && environment.supportsWebSocket()) {
                await this.ws.connect();
            }

            this._initialized = true;
            this._initializing = null;
        } catch (error) {
            this._initializing = null;
            throw error;
        }
    }

    public async ensureInitialized(): Promise<void> {
        await this.connect();
    }

    private initializePrivateKey(privateKey: string, testnet: boolean): void {
        try {
            const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
            new ethers.Wallet(formattedPrivateKey); // Validate the private key

            this.exchange = new ExchangeAPI(
                testnet,
                formattedPrivateKey,
                this.info,
                this.rateLimiter,
                this.symbolConversion,
                this.walletAddress,
                this,
                this.vaultAddress
            );

            this.custom = new CustomOperations(
                this.exchange,
                this.info,
                formattedPrivateKey,
                this.symbolConversion,
                this.walletAddress

            );

            this.isValidPrivateKey = true;
        } catch (error) {
            console.warn("Invalid private key provided. Some functionalities will be limited.");
            this.isValidPrivateKey = false;
        }
    }

    private createAuthenticatedProxy<T extends object>(Class: new (...args: any[]) => T): T {
        return new Proxy({} as T, {
            get: (target, prop) => {
                if (!this.isValidPrivateKey) {
                    throw new AuthenticationError('Invalid or missing private key. This method requires authentication.');
                }
                return target[prop as keyof T];
            }
        });
    }

    private initializeWithPrivateKey(privateKey: string, testnet: boolean = false): void {
        try {
            const formattedPrivateKey = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}` as `0x${string}`;
            new ethers.Wallet(formattedPrivateKey); // Validate the private key

            this.exchange = new ExchangeAPI(
                testnet,
                formattedPrivateKey,
                this.info,
                this.rateLimiter,
                this.symbolConversion,
                this.walletAddress,
                this,
                this.vaultAddress,
                this.proxyConfig // Pass proxyConfig
            );
            this.custom = new CustomOperations(
                this.exchange,
                this.info,
                formattedPrivateKey,
                this.symbolConversion,
                this.walletAddress,
            );
            this.isValidPrivateKey = true;
        } catch (error) {
            console.warn("Invalid private key provided. Some functionalities will be limited.");
            this.isValidPrivateKey = false;
        }
    }

    // Modify existing methods to check initialization
    public isAuthenticated(): boolean {
        this.ensureInitialized();
        return this.isValidPrivateKey;
    }

    disconnect(): void {
        this.ensureInitialized();
        this.ws.close();
    }
}

export * from './types';
export * from './utils/signing';
