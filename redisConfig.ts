import Redis from 'ioredis';
import * as dotenv from 'dotenv';
dotenv.config();

const redisConfig: any = {
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT || 6379
}

const redis = new Redis(redisConfig);

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis error', err);
});

export default redis