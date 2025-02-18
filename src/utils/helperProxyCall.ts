import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';
import { handleApiError } from './errors';
import { RateLimiter } from './rateLimiter';
import { HttpsProxyAgent } from 'https-proxy-agent';


interface ProxyConfig {
     host: string;
     port: number;
     auth?: {
          username: string;
          password: string;
     };
}

export class HttpApi {
     private client: AxiosInstance;
     private endpoint: string;
     private rateLimiter: RateLimiter;

     constructor(baseUrl: string,
          endpoint: string = "/",
          rateLimiter: RateLimiter,
          proxyConfig?: { host: string, port: number, auth?: { username: string, password: string } }) {
          this.endpoint = endpoint;

          const agent = proxyConfig ? new HttpsProxyAgent(
               `https://${proxyConfig.auth ? `${proxyConfig.auth.username}:${proxyConfig.auth.password}@` : ''}${proxyConfig.host}:${proxyConfig.port}`) : undefined;
          console.log(`Proxy httpApi....`)
          this.client = axios.create({
               baseURL: baseUrl,
               headers: {
                    'Content-Type': 'application/json',
               },
               httpsAgent: agent,
               timeout: 60000
          });

          axiosRetry(this.client, {
               retries: 3, // Number of retries
               retryDelay: axiosRetry.exponentialDelay, // Exponential backoff
               retryCondition: (error) => {
                    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response?.status === 408; // Retry network errors, idempotent requests, or request timeout
               },
               onRetry: (retryCount, error, requestConfig) => {
                    console.log(`Retrying request ${requestConfig.method} ${requestConfig.url}, attempt ${retryCount}. Error: ${error.message}`);
               },
          });

          this.rateLimiter = rateLimiter;
     }

     async makeRequest<T>(payload: any, weight: number = 2, endpoint: string = this.endpoint): Promise<T> {
          try {
               await this.rateLimiter.waitForToken(weight);
               const response = await this.client.post(endpoint, payload);
               return response.data;
          } catch (error) {
               handleApiError(error);
               throw error; // Re-throw the error after handling it
          }
     }
}