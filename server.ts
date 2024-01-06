import express , { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import newsRouter from './routes/newsRouter';
import articleRouter from './routes/articleRouter';
import webhookRouter from './routes/webhookRouter';
import revisionRouter from './routes/revisionRouter';
import * as dotenv from 'dotenv';
import connectDB from './db/db.config';
import agenda from './agendaConfig';
import axios from 'axios'
import path from 'path';
dotenv.config();
connectDB();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});


const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(helmet());
app.use(limiter);
app.use(cookieParser());

app.get('/sitemap.xml', async (req, res) => {
  try {
    const sitemapUrl = 'https://journova.s3.us-east-2.amazonaws.com/sitemap.xml';
    const response = await axios.get(sitemapUrl);

    res.set('Content-Type', 'application/xml');
    res.status(200).send(response.data);
} catch (error) {
    console.error('Error fetching sitemap:', error);
    res.status(500).send('An error occurred');
}
});

app.use('/webhook', webhookRouter);
app.use(express.json()); //must come after webhookRouter because it needs raw data


app.use('/news', newsRouter);
app.use('/article', articleRouter);
app.use('/revision', revisionRouter);
app.use('*', (req: Request, res: Response) => res.status(400).send('not found'));

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const defaultErr = {
    log: "Express error handler caught unknown middleware error",
    status: 400,
    message: { err: "An error occurred" },
  };
  const errorObj = Object.assign({}, defaultErr, err);
  console.log(errorObj.log);
  return res.status(errorObj.status).json(errorObj.message);
});

app.listen(port, async () => {
  console.log('Server listening on port', port);

  await agenda.start();
  await agenda.every('12 hours', 'update news')
});