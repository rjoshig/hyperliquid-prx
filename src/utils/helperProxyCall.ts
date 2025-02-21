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
     private proxyConfig?: ProxyConfig;

     constructor(
          baseUrl: string,
          endpoint: string = "/",
          rateLimiter: RateLimiter,
          httpTimeout?: number,
          proxyConfig?: { host: string, port: number, auth?: { username: string, password: string } }

     ) {
          this.endpoint = endpoint;
          this.proxyConfig = proxyConfig;

          const agent = proxyConfig ? new HttpsProxyAgent(
               `https://${proxyConfig.auth ? `${proxyConfig.auth.username}:${proxyConfig.auth.password}@` : ''}${proxyConfig.host}:${proxyConfig.port}`) : undefined;

          if (proxyConfig) {
               console.log(`HttpApi: timeout: ${httpTimeout} : Proxy Username: ${proxyConfig.auth?.username || 'no_username'}:******:${proxyConfig.host}:${proxyConfig.port}`);

          }


          this.client = axios.create({
               baseURL: baseUrl,
               headers: {
                    'Content-Type': 'application/json',
               },
               httpsAgent: agent,
               timeout: httpTimeout
          });

          // console.dir(this.client, { depth: 3 })

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

               //                    console.log("HttpApi: Making  API request with payload", payload)

               // if (this.client.defaults.httpsAgent) {
               //      const agent = this.client.defaults.httpsAgent as HttpsProxyAgent<any>;
               //      const proxyAuthUsername = this.proxyConfig?.auth ? this.proxyConfig.auth.username : 'no_username';
               //      console.log(`Using proxy (makeRequest): ${proxyAuthUsername}:*****:${this.proxyConfig?.host}:${this.proxyConfig?.port}`);
               // }


               // console.log("HttpApi: Making  API request with payload", payload)
               await this.rateLimiter.waitForToken(weight);
               const response = await this.client.post(endpoint, payload);
               return response.data;
          } catch (error) {
               handleApiError(error);
               throw error; // Re-throw the error after handling it
          }
     }
}