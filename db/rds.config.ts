const { Pool } = require('pg');
require('dotenv').config();


const pool = new Pool({
  user: process.env.AWS_USER,
  host: process.env.AWS_HOST,
  database: process.env.AWS_DATABASE,
  password: process.env.AWS_PASSWORD,
  port: process.env.AWS_PORT,
  ssl: {
    rejectUnauthorized: false // For development purposes only; for production, set up a proper SSL configuration
  }
});

const query = (text: string, params: any, callback?: any) => {
  return pool.query(text, params, callback);
}

const close = () => {
  return pool.end();
}

export default { query, close };



